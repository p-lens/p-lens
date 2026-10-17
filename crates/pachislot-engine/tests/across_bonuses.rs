#![allow(clippy::expect_used, clippy::indexing_slicing, clippy::float_cmp)]

mod support;

use std::num::NonZeroU32;

use pachislot_domain::normalized::{AtRules, AtTable, BonusMiss, CeilingAt, ForcedCz, ModeRule};
use pachislot_domain::observation::{AtSeen, Leg, LegEnd, Path, PathStart, ToldLeg, ToldPath};
use pachislot_domain::probability::Probability;
use pachislot_domain::spec::{Component, Spec};
use pachislot_engine::at::{Odds, cycle, told_log_likelihood, walk};
use pachislot_engine::error::SpecError;
use pachislot_engine::hunt::hunt;
use pachislot_engine::normalize::normalize;
use support::{PAYOUT, cz_spec, id, mode, rules, shares, start, table};

fn near(left: f64, right: f64) -> bool {
    (left - right).abs() <= 1e-9 * left.abs().max(right.abs()).max(1.0)
}

fn games(count: u32) -> NonZeroU32 {
    NonZeroU32::new(count).expect("a count of games")
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

/// 賞金首Angel's shape: a bonus that misses the AT starts play again, a CZ
/// certainly succeeding into its bonus on the `bonus_ceiling`th game from
/// the AT or the last bonus, and, where given, an AT間天井 of `across` games
/// counted from the AT across those bonuses.
fn angel(bonus_ceiling: u32, across: Option<u32>) -> AtRules {
    AtRules {
        bonus_miss: BonusMiss::Restarts,
        forced_cz: ForcedCz::Wins,
        ceiling_across_bonuses: across.map(games),
        ..rules(
            Some("cz"),
            vec![ModeRule {
                since_at_ceiling: NonZeroU32::new(bonus_ceiling),
                ..mode("cz", 0)
            }],
        )
    }
}

/// What the rest of a cycle comes to, played out state by state with no
/// stretch or renewal: play where it stands, `seat` games from the AT and
/// `since` from the AT or the last bonus, walked game by game — each game a
/// CZ at `p`, certainly on the bonus ceiling, succeeding into the bonus at
/// `s` (certainly on that ceiling), the bonus winning the AT at `q` or
/// starting play again — until the AT間天井 counted across bonuses wins
/// whatever is left. The games played, the triggers drawn — the AT間天井's
/// one where it brings it — and the chance the AT came on that ceiling.
#[allow(clippy::cast_precision_loss)]
fn played_out(
    (p, s, q): (f64, f64, f64),
    (bonus_ceiling, across): (usize, usize),
    (seat, since): (usize, usize),
    triggering: bool,
) -> (f64, f64, f64) {
    let mut alive = vec![0.0; bonus_ceiling];
    alive[since] = 1.0;
    let (mut played, mut triggers, mut ceiled) = (0.0, 0.0, 0.0);
    for game in seat + 1..=across {
        let mut next = vec![0.0; bonus_ceiling];
        let mut again = 0.0;
        for (before, mass) in alive.iter().copied().enumerate() {
            if mass == 0.0 {
                continue;
            }
            played += mass;
            if game == across {
                ceiled += mass;
                if triggering {
                    triggers += mass;
                }
                continue;
            }
            if before + 1 == bonus_ceiling {
                triggers += mass;
                again += mass * (1.0 - q);
                continue;
            }
            triggers += mass * p;
            again += mass * p * s * (1.0 - q);
            next[before + 1] += mass * (1.0 - p * s);
        }
        next[0] += again;
        alive = next;
    }
    (played, triggers, ceiled)
}

const ODDS: (f64, f64, f64) = (1.0 / 250.0, 0.35, 0.4);

#[test]
fn a_cycle_under_a_ceiling_across_bonuses_is_the_one_played_out_state_by_state() {
    let (p, s, q) = ODDS;
    let held = staged(p, s, q);
    for (bonus_ceiling, across) in [(800, 1_600), (300, 1_000), (500, 450)] {
        let found = cycle(&angel(bonus_ceiling, Some(across)), Odds::of(&held), &[1.0]);
        let (played, triggers, _) = played_out(
            ODDS,
            (bonus_ceiling as usize, across as usize),
            (0, 0),
            false,
        );
        assert!(
            near(found.games, played),
            "{} against {played}",
            found.games
        );
        assert!(
            near(found.triggers, triggers),
            "{} against {triggers}",
            found.triggers
        );
        assert_eq!(found.ceiled, 0.0);
    }
}

#[test]
fn a_ceiling_across_bonuses_that_brings_the_trigger_counts_it() {
    let (p, s, q) = ODDS;
    let held = staged(p, s, q);
    let machine = AtRules {
        ceiling_at: CeilingAt::Triggered,
        ..angel(800, Some(1_600))
    };
    let found = cycle(&machine, Odds::of(&held), &[1.0]);
    let (played, triggers, ceiled) = played_out(ODDS, (800, 1_600), (0, 0), true);
    assert!(
        near(found.games, played),
        "{} against {played}",
        found.games
    );
    assert!(near(found.triggers, triggers));
    assert!(
        near(found.ceiled, ceiled),
        "{} against {ceiled}",
        found.ceiled
    );
    assert!(ceiled > 0.0);
}

#[test]
fn a_ceiling_across_bonuses_too_far_to_reach_leaves_the_cycle_as_it_was() {
    let (p, s, q) = ODDS;
    let held = staged(p, s, q);
    let far = cycle(&angel(800, Some(50_000)), Odds::of(&held), &[1.0]);
    let without = cycle(&angel(800, None), Odds::of(&held), &[1.0]);
    assert!(
        near(far.games, without.games),
        "{} against {}",
        far.games,
        without.games
    );
    assert!(near(far.triggers, without.triggers));
    let near_by = cycle(&angel(800, Some(1_600)), Odds::of(&held), &[1.0]);
    assert!(near_by.games < without.games - 1.0);
}

#[test]
fn the_hunt_from_the_at_plays_the_cycle() {
    let (p, s, q) = ODDS;
    let held = staged(p, s, q);
    let machine = angel(800, Some(1_600));
    let found = cycle(&machine, Odds::of(&held), &[1.0]);
    let hunted = hunt(start(0, 0, 0), &machine, &held).expect("comes");
    assert!(
        near(hunted.games, found.games),
        "{} against {}",
        hunted.games,
        found.games
    );
    assert!(near(hunted.at_medals, PAYOUT), "{}", hunted.at_medals);
}

/// A seat so many games after the last bonus, and so many after the AT across it.
fn past_a_bonus(since_bonus: u32, since_at: u32) -> PathStart {
    PathStart {
        since_at_across_bonuses: Some(since_at),
        ..start(since_bonus, since_bonus, 0)
    }
}

#[test]
fn a_seat_past_bonuses_is_hunted_to_the_ceiling_counted_from_the_at() {
    let (p, s, q) = ODDS;
    let held = staged(p, s, q);
    let machine = angel(800, Some(1_600));
    for (since_bonus, since_at) in [(100, 1_500), (700, 1_500), (40, 1_590), (300, 900)] {
        let hunted = hunt(past_a_bonus(since_bonus, since_at), &machine, &held).expect("comes");
        let (played, _, ceiled) = played_out(
            ODDS,
            (800, 1_600),
            (since_at as usize, since_bonus as usize),
            false,
        );
        assert!(
            near(hunted.games, played),
            "{since_bonus}/{since_at}: {} against {played}",
            hunted.games
        );
        assert!(near(hunted.at_medals, PAYOUT), "{}", hunted.at_medals);
        assert!(hunted.by_ceiling >= ceiled - 1e-9);
    }
    let unknown = hunt(start(100, 100, 0), &machine, &held).expect("comes");
    let told = hunt(past_a_bonus(100, 100), &machine, &held).expect("comes");
    assert_eq!(unknown, told);
    let near_it = hunt(past_a_bonus(100, 1_500), &machine, &held).expect("comes");
    assert!(near_it.games <= 100.0 + 1e-9);
    assert!(near_it.medals > unknown.medals);
}

fn legs(each: &[(u32, LegEnd)]) -> Vec<Leg> {
    each.iter()
        .map(|(games, end)| Leg {
            games: *games,
            end: *end,
        })
        .collect()
}

#[test]
fn a_walk_wins_the_at_on_the_ceiling_across_bonuses_whatever_play_is_in() {
    let (p, s, q) = ODDS;
    let held = staged(p, s, q);
    let path = |last: LegEnd| Path {
        start: start(0, 0, 0),
        legs: legs(&[(700, LegEnd::Bonus), (299, LegEnd::Going), (1, last)]),
    };
    let machine = angel(800, Some(1_000));
    let won = walk(&path(LegEnd::WonAt(AtSeen::default())), &machine, &held);
    let going = walk(&path(LegEnd::Going), &machine, &held);
    assert_eq!(going.log_likelihood, f64::NEG_INFINITY);
    let without = walk(
        &path(LegEnd::WonAt(AtSeen::default())),
        &angel(800, None),
        &held,
    );
    let last_game = |walked: f64, before: f64| (walked - before).exp();
    let before = walk(
        &Path {
            start: start(0, 0, 0),
            legs: legs(&[(700, LegEnd::Bonus), (299, LegEnd::Going)]),
        },
        &machine,
        &held,
    );
    assert!(near(
        last_game(won.log_likelihood, before.log_likelihood),
        1.0
    ));
    assert!(last_game(without.log_likelihood, before.log_likelihood) < 0.01);
    assert!(won.medals > without.medals);
}

#[test]
fn a_history_told_by_its_totals_meets_the_ceiling_across_bonuses() {
    let (p, s, q) = ODDS;
    let held = staged(p, s, q);
    let machine = angel(800, Some(1_000));
    let told = |games: u32, won: bool| ToldPath {
        after_reset: false,
        since_at: 0,
        legs: vec![ToldLeg {
            games,
            won,
            misses: None,
        }],
    };
    assert_eq!(
        told_log_likelihood(&told(1_000, false), &machine, &held),
        f64::NEG_INFINITY
    );
    assert!(told_log_likelihood(&told(1_000, true), &machine, &held).is_finite());
}

/// The CZ machine whose CZ's success brings a bonus that starts play again
/// when it misses the AT, with an AT間天井 of 1000 games across those
/// bonuses.
fn restarting_spec() -> Spec {
    let mut spec = cz_spec();
    spec.components
        .bonus_share
        .insert(id("cz"), shares(5_000, 5_000));
    spec.components.restart.insert(id("cz"));
    spec.components
        .ceiling_across_bonuses
        .insert(id("at"), games(1_000));
    spec
}

#[test]
fn a_ceiling_across_bonuses_is_carried_into_the_rules() {
    let normalized = normalize(&restarting_spec()).expect("normalises");
    let rules = normalized.at_rules.expect("an AT machine");
    assert_eq!(rules.ceiling_across_bonuses, Some(games(1_000)));
    assert!(rules.restarts());
}

#[test]
fn a_ceiling_across_bonuses_needs_bonuses_that_start_play_again() {
    let mut counted = restarting_spec();
    counted.components.restart.clear();
    assert_eq!(
        normalize(&counted),
        Err(SpecError::CeilingAcrossBonusesWithoutRestart { entity: id("at") })
    );
    let mut on_cz = restarting_spec();
    on_cz.components.ceiling_across_bonuses.clear();
    on_cz
        .components
        .ceiling_across_bonuses
        .insert(id("cz"), games(1_000));
    assert_eq!(
        normalize(&on_cz),
        Err(SpecError::MissingComponent {
            entity: id("cz"),
            component: Component::At
        })
    );
}

#[test]
fn a_ceiling_across_bonuses_is_an_at_ceiling_the_trigger_may_be_brought_on() {
    let mut spec = restarting_spec();
    spec.components.ceiling.remove(&id("at"));
    spec.components.reset_ceiling.remove(&id("at"));
    spec.components.ceiling_triggers.insert(id("at"));
    assert!(normalize(&spec).is_ok());
}
