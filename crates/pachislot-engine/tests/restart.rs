#![allow(clippy::expect_used, clippy::indexing_slicing, clippy::float_cmp)]

mod support;

use std::num::NonZeroU32;

use pachislot_domain::normalized::{AtRules, AtTable, BonusMiss, ForcedCz, ModeRule};
use pachislot_domain::observation::{Leg, LegEnd, Path};
use pachislot_domain::probability::Probability;
use pachislot_engine::at::{Odds, cycle, walk};
use pachislot_engine::hunt::hunt;
use support::{ceiled, mode, rules, start, table, through};

fn near(left: f64, right: f64) -> bool {
    (left - right).abs() <= 1e-9 * left.abs().max(right.abs()).max(1.0)
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

fn restarting(modes: Vec<ModeRule>) -> AtRules {
    AtRules {
        bonus_miss: BonusMiss::Restarts,
        ..rules(Some("cz"), modes)
    }
}

#[test]
fn without_ceilings_or_misses_play_starting_again_at_a_bonus_changes_nothing() {
    let (p, s, q) = (0.005, 0.4, 0.5);
    let held = staged(p, s, q);
    let again = cycle(&restarting(vec![mode("cz", 0)]), Odds::of(&held), &[1.0]);
    let on = cycle(
        &rules(Some("cz"), vec![mode("cz", 0)]),
        Odds::of(&held),
        &[1.0],
    );
    assert!(near(again.games, 1.0 / (p * s * q)), "{}", again.games);
    assert!(near(again.games, on.games));
    assert!(near(again.triggers, on.triggers));
}

#[test]
fn a_through_ceiling_counted_from_the_bonus_brings_a_bonus_each_stretch() {
    let (p, s, q) = (0.005, 0.4, 0.5);
    let limit = 3;
    let machine = restarting(through(vec![mode("cz", 0)], NonZeroU32::new(limit)));
    let held = staged(p, s, q);
    let found = cycle(&machine, Odds::of(&held), &[1.0]);
    let tries: f64 = (0..=limit)
        .map(|misses| (1.0 - s).powi(i32::try_from(misses).expect("a count")))
        .sum();
    assert!(
        near(found.triggers, tries / q),
        "{} against {}",
        found.triggers,
        tries / q
    );
    assert!(
        near(found.games, tries / q / p),
        "{} against {}",
        found.games,
        tries / q / p
    );
    let hunted = hunt(start(0, 0, 0), &machine, &held).expect("comes");
    assert!(
        near(hunted.games, found.games),
        "{} against {}",
        hunted.games,
        found.games
    );
}

#[test]
fn a_sure_ceiling_counted_from_the_bonus_ends_each_stretch_at_the_latest_there() {
    let (p, s, q) = (0.004, 0.3, 0.45);
    let ceiling = 500;
    let machine = AtRules {
        forced_cz: ForcedCz::Wins,
        ..restarting(vec![ModeRule {
            since_at_ceiling: NonZeroU32::new(ceiling),
            ..mode("cz", 0)
        }])
    };
    let held = staged(p, s, q);
    let found = cycle(&machine, Odds::of(&held), &[1.0]);
    let kept = 1.0 - p * s;
    let stretch: f64 = (0..ceiling)
        .map(|games| kept.powi(i32::try_from(games).expect("a count")))
        .sum();
    assert!(
        near(found.games, stretch / q),
        "{} against {}",
        found.games,
        stretch / q
    );
    let hunted = hunt(start(0, 0, 0), &machine, &held).expect("comes");
    assert!(
        near(hunted.games, found.games),
        "{} against {}",
        hunted.games,
        found.games
    );
    let seated = hunt(start(120, 300, 2), &machine, &held).expect("comes");
    let left: f64 = (0..ceiling - 300)
        .map(|games| kept.powi(i32::try_from(games).expect("a count")))
        .sum();
    let ends_at_bonus = 1.0;
    let expected = left + ends_at_bonus * (1.0 - q) * found.games;
    assert!(
        near(seated.games, expected),
        "{} against {expected}",
        seated.games
    );
}

#[test]
fn a_bonus_that_misses_the_at_starts_the_at_ceiling_again_where_play_restarts() {
    let held = staged(0.004, 0.4, 0.5);
    let path = Path {
        start: start(0, 0, 0),
        legs: [(200, LegEnd::Bonus), (250, LegEnd::Going)]
            .iter()
            .map(|(games, end)| Leg {
                games: *games,
                end: *end,
            })
            .collect(),
    };
    let again = walk(&path, &restarting(vec![ceiled("cz", 0, 300)]), &held);
    let on = walk(&path, &rules(Some("cz"), vec![ceiled("cz", 0, 300)]), &held);
    assert!(again.log_likelihood.is_finite(), "{}", again.log_likelihood);
    assert_eq!(on.log_likelihood, f64::NEG_INFINITY);
    let failed = Path {
        legs: vec![Leg {
            games: 200,
            end: LegEnd::Missed,
        }],
        ..path.clone()
    };
    let bonus = Path {
        legs: vec![Leg {
            games: 200,
            end: LegEnd::Bonus,
        }],
        ..path
    };
    let machine = rules(Some("cz"), vec![ceiled("cz", 0, 900)]);
    let (failed, bonus) = (
        walk(&failed, &machine, &held),
        walk(&bonus, &machine, &held),
    );
    assert!(near(
        (failed.log_likelihood - bonus.log_likelihood).exp(),
        (1.0 - 0.4) / (0.4 * 0.5)
    ));
}
