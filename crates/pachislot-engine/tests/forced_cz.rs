#![allow(clippy::expect_used, clippy::indexing_slicing)]

mod support;

use std::num::NonZeroU32;

use pachislot_domain::normalized::{AtRules, AtTable, BonusMiss, ForcedCz, ModeRule};
use pachislot_domain::probability::Probability;
use pachislot_engine::error::SeatError;
use pachislot_engine::hunt::hunt;
use pachislot_engine::normalize::normalize;
use pachislot_engine::seat::seated;
use support::{drawn_misses_spec, id, mode, rules, start, table};

fn near(left: f64, right: f64) -> bool {
    (left - right).abs() <= 1e-9 * left.abs().max(right.abs()).max(1.0)
}

/// A CZ at `p` a game with no ceiling of its own, forced on the
/// `forced`th game from the AT — or the last bonus, where a bonus that
/// misses the AT starts play again — where it certainly succeeds.
fn forced_wins(forced: u32, bonus_miss: BonusMiss) -> AtRules {
    AtRules {
        forced_cz: ForcedCz::Wins,
        bonus_miss,
        ..rules(
            Some("cz"),
            vec![ModeRule {
                since_at_ceiling: NonZeroU32::new(forced),
                ..mode("cz", 0)
            }],
        )
    }
}

/// A table whose CZ succeeds into a bonus at `s` and the bonus wins the AT at `q`.
fn staged(p: f64, s: f64, q: f64) -> AtTable {
    AtTable {
        success: Probability::new(s * q).expect("a rate"),
        paid: Probability::new(s).expect("a rate"),
        bonus_share: Probability::new(q).expect("a share"),
        ..table(p, s * q, vec![1.0], vec![1.0])
    }
}

#[test]
fn an_at_a_forced_cz_wins_is_won_by_the_ceiling() {
    let (p, s, forced) = (0.01, 0.3, 200);
    let machine = forced_wins(forced, BonusMiss::Counted);
    let held = table(p, s, vec![1.0], vec![1.0]);
    let fresh = hunt(start(0, 0, 0), &machine, &held).expect("comes");
    let lasted = (1.0 - p * s).powi(i32::try_from(forced - 1).expect("a count"));
    assert!(near(fresh.by_ceiling, lasted), "{}", fresh.by_ceiling);
    assert!(near(fresh.games, (1.0 - lasted) / (p * s) + lasted));
    let due = hunt(start(50, forced - 1, 0), &machine, &held).expect("comes");
    assert!(near(due.by_ceiling, 1.0), "{}", due.by_ceiling);
    assert!(near(due.games, 1.0));
}

#[test]
fn a_cz_drawn_on_its_ceiling_from_the_at_is_not_won_by_it() {
    let (p, s, forced) = (0.01, 0.3, 200);
    let machine = AtRules {
        forced_cz: ForcedCz::Drawn,
        ..forced_wins(forced, BonusMiss::Counted)
    };
    let walked = AtRules {
        modes: vec![ModeRule {
            at_ceiling: NonZeroU32::new(1_000),
            ..machine.modes[0].clone()
        }],
        ..machine
    };
    let held = table(p, s, vec![1.0], vec![1.0]);
    let fresh = hunt(start(0, 0, 0), &walked, &held).expect("comes");
    let reached = (1.0 - p * s).powi(999) * (1.0 - s) / (1.0 - p * s);
    assert!(near(fresh.by_ceiling, reached), "{}", fresh.by_ceiling);
}

#[test]
fn a_forced_cz_s_bonus_wins_the_at_by_the_ceiling_at_its_share() {
    let (p, s, q, forced) = (0.01, 0.3, 0.4, 200);
    let machine = forced_wins(forced, BonusMiss::Restarts);
    let held = staged(p, s, q);
    let lasted = (1.0 - p * s).powi(i32::try_from(forced - 1).expect("a count"));
    let fresh = hunt(start(0, 0, 0), &machine, &held).expect("comes");
    assert!(near(fresh.by_ceiling, lasted), "{}", fresh.by_ceiling);
    let due = hunt(start(50, forced - 1, 0), &machine, &held).expect("comes");
    assert!(
        near(due.by_ceiling, q + (1.0 - q) * lasted),
        "{}",
        due.by_ceiling
    );
}

/// The games played from a seat to the AT where each game brings a CZ
/// that wins at `r`, and an AT間天井 `left` games on wins it outright:
/// `(1 − (1 − r)^left) / r`.
fn to_ceiling(r: f64, left: u32) -> f64 {
    (1.0 - (1.0 - r).powi(i32::try_from(left).expect("a count"))) / r
}

#[test]
fn past_a_forced_cz_that_came_and_missed_only_the_odds_and_the_at_ceiling_are_left() {
    let (p, s, forced, at_ceiling) = (0.01, 0.3, 200, 1_000);
    let machine = AtRules {
        forced_cz: ForcedCz::Drawn,
        modes: vec![ModeRule {
            since_at_ceiling: NonZeroU32::new(forced),
            at_ceiling: NonZeroU32::new(at_ceiling),
            ..mode("cz", 0)
        }],
        ..rules(Some("cz"), Vec::new())
    };
    let held = table(p, s, vec![1.0], vec![1.0]);
    let past = hunt(start(5, 210, 1), &machine, &held).expect("comes");
    assert!(
        near(past.games, to_ceiling(p * s, at_ceiling - 210)),
        "{}",
        past.games
    );
    let due = hunt(start(forced - 1, forced - 1, 0), &machine, &held).expect("comes");
    assert!(
        near(
            due.games,
            1.0 + (1.0 - s) * to_ceiling(p * s, at_ceiling - forced)
        ),
        "{}",
        due.games
    );
}

#[test]
fn a_mode_whose_sure_cz_the_seat_is_past_is_ruled_out_and_the_others_weighed() {
    let (p, s) = (0.01, 0.3);
    let machine = AtRules {
        modes: vec![
            ModeRule {
                since_at_ceiling: NonZeroU32::new(100),
                ..mode("short", 30)
            },
            mode("long", 0),
        ],
        ..forced_wins(100, BonusMiss::Counted)
    };
    let held = table(p, s, vec![0.5, 0.5], vec![0.5, 0.5]);
    let past = hunt(start(10, 150, 1), &machine, &held).expect("comes");
    assert!(near(past.games, 1.0 / (p * s)), "{}", past.games);
    assert!(near(past.by_ceiling, 0.0));
}

#[test]
fn a_seat_past_a_sure_cz_in_every_mode_it_may_be_in_stands_just_short_of_it_and_one_counting_more_since_the_cz_than_since_the_at_is_refused()
 {
    let mut spec = drawn_misses_spec();
    let ceiling = |games: u32| NonZeroU32::new(games).expect("a ceiling");
    spec.components.ceiling.insert(id("at"), ceiling(1_000));
    spec.components
        .since_at_ceiling
        .insert(id("cz"), ceiling(800));
    spec.components
        .since_at_ceiling
        .insert(id("m2"), ceiling(300));
    spec.components.ceiling_wins.insert(id("cz"));
    let normalized = normalize(&spec).expect("normalises");
    let machine = normalized.at_rules.as_ref().expect("an AT machine");
    assert_eq!(
        seated(&normalized, machine, start(0, 500, 3)),
        Ok(start(0, 500, 3))
    );
    for since_at in [800, 850] {
        assert_eq!(
            seated(&normalized, machine, start(0, since_at, 3)),
            Ok(start(0, 799, 3))
        );
    }
    assert_eq!(
        seated(&normalized, machine, start(600, 500, 3)),
        Err(SeatError::TriggerAboveSinceAt {
            since_trigger: 600,
            since_at: 500
        })
    );
}
