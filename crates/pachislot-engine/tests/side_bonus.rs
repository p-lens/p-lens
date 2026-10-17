#![allow(clippy::expect_used, clippy::indexing_slicing, clippy::float_cmp)]

mod support;

use std::num::NonZeroU32;

use pachislot_domain::conditions::PayoutBasis;
use pachislot_domain::normalized::{AtRules, AtTable, SideBonusRule, TriggerPayout};
use pachislot_domain::observation::{Leg, LegEnd, Path, PathStart};
use pachislot_domain::probability::Probability;
use pachislot_domain::spec::{Component, Spec};
use pachislot_engine::analysis::analyze;
use pachislot_engine::at::walk;
use pachislot_engine::error::SpecError;
use pachislot_engine::hunt::hunt;
use pachislot_engine::normalize::normalize;
use support::{at_spec, cz_spec, id, medals, mode, one_in, per, rules, start, table};

fn near(left: f64, right: f64) -> bool {
    (left - right).abs() <= 1e-9 * left.abs().max(right.abs()).max(1.0)
}

const CEILING: u32 = 300;
const MEDALS: f64 = 100.0;

/// The CZ machine, its AT gaining 4 a game, with a side bonus beside its
/// CZ: 1/500 a game under setting 1 and 1/400 under setting 6 below its
/// ceiling of `CEILING` games, paying `MEDALS` over 25 games of its own.
fn sided() -> Spec {
    let mut spec = cz_spec();
    spec.components.net_per_game.insert(id("at"), medals(4.0));
    spec.entities.push(id("fran"));
    spec.components.side_bonus.insert(id("fran"));
    spec.components
        .chance
        .insert(id("fran"), per(one_in(50_000), one_in(40_000)));
    spec.components
        .ceiling
        .insert(id("fran"), NonZeroU32::new(CEILING).expect("a ceiling"));
    spec.components.payout.insert(id("fran"), medals(MEDALS));
    spec.components.net_per_game.insert(id("fran"), medals(4.0));
    spec
}

/// The games between two side bonuses at `chance` below the ceiling.
fn between(chance: f64) -> f64 {
    (1.0 - (1.0 - chance).powi(i32::try_from(CEILING).expect("a count"))) / chance
}

#[test]
fn a_side_bonus_pays_over_a_cycle_one_over_the_games_between_two_and_changes_nothing_else() {
    let normalized = normalize(&sided()).expect("normalises");
    let mut plain_spec = cz_spec();
    plain_spec
        .components
        .net_per_game
        .insert(id("at"), medals(4.0));
    let plain = normalize(&plain_spec).expect("normalises");
    let analysis = analyze(&normalized, &PayoutBasis::FromSpec).expect("analyses");
    let unsided = analyze(&plain, &PayoutBasis::FromSpec).expect("analyses");
    for (index, chance) in [1.0 / 500.0, 1.0 / 400.0].into_iter().enumerate() {
        let table = normalized.tables[index].at.as_ref().expect("an AT");
        let other = plain.tables[index].at.as_ref().expect("an AT");
        assert!(near(table.side_chance.value(), chance));
        assert_eq!(table.chance, other.chance);
        let figures = &analysis.setting_levels[index];
        let bare = &unsided.setting_levels[index];
        assert_eq!(figures.bonuses, bare.bonuses);
        let games = 1.0 / figures.bonuses[1].chance;
        let at = figures.at.expect("an AT figure");
        let bonuses = games / between(chance);
        assert!(near(at.side_bonuses, bonuses));
        let staked = 3.0 * (games + bonuses * MEDALS / 4.0 + 600.0 / 4.0);
        let out = staked - 50.0 / 40.0 * games + 600.0 + bonuses * MEDALS;
        assert!(near(figures.payout_rate, out / staked));
        assert!(figures.payout_rate > bare.payout_rate);
    }
    assert_eq!(
        normalized.at_rules.as_ref().map(|rules| &rules.side_bonus),
        Some(&Some(SideBonusRule {
            id: id("fran"),
            ceiling: NonZeroU32::new(CEILING),
            payout: TriggerPayout {
                medals: medals(MEDALS),
                net_per_game: Some(medals(4.0)),
            },
        }))
    );
}

#[test]
fn a_side_bonus_published_with_its_ceiling_is_read_back_to_its_chance_below_it() {
    let mut spec = sided();
    let below = spec
        .components
        .chance
        .remove(&id("fran"))
        .expect("a chance");
    spec.components
        .first_hit
        .insert(id("fran"), per(one_in(25_000), one_in(20_000)));
    let normalized = normalize(&spec).expect("normalises");
    for (index, published) in [1.0 / 250.0, 1.0 / 200.0].into_iter().enumerate() {
        let chance = normalized.tables[index]
            .at
            .as_ref()
            .expect("an AT")
            .side_chance
            .value();
        assert!(chance < published);
        assert!(near(1.0 / between(chance), published));
    }
    spec.components
        .first_hit
        .insert(id("fran"), per(one_in(40_000), one_in(20_000)));
    assert_eq!(
        normalize(&spec),
        Err(SpecError::FirstHitBeyondCeiling {
            at: id("fran"),
            setting_level: support::setting_level(1),
        })
    );
    spec.components.chance.insert(id("fran"), below);
    assert_eq!(
        normalize(&spec),
        Err(SpecError::ConflictingComponents {
            entity: id("fran"),
            first: Component::Chance,
            second: Component::FirstHit,
        })
    );
}

#[test]
fn a_side_bonus_stands_only_beside_an_at_and_alone() {
    let mut bonuses = support::made_up_spec();
    bonuses.entities.push(id("fran"));
    bonuses.components.side_bonus.insert(id("fran"));
    bonuses
        .components
        .chance
        .insert(id("fran"), per(one_in(50_000), one_in(40_000)));
    bonuses.components.payout.insert(id("fran"), medals(MEDALS));
    assert_eq!(
        normalize(&bonuses),
        Err(SpecError::SideBonusWithoutAt { entity: id("fran") })
    );
    let mut two = sided();
    two.entities.push(id("other"));
    two.components.side_bonus.insert(id("other"));
    two.components
        .chance
        .insert(id("other"), per(one_in(50_000), one_in(40_000)));
    two.components.payout.insert(id("other"), medals(MEDALS));
    assert_eq!(
        normalize(&two),
        Err(SpecError::SideBonusNotAlone {
            entity: id("other")
        })
    );
    let mut unpaid = sided();
    unpaid.components.payout.remove(&id("fran"));
    assert_eq!(
        normalize(&unpaid),
        Err(SpecError::MissingComponent {
            entity: id("fran"),
            component: Component::Payout,
        })
    );
}

const AT: f64 = 0.004;
const SIDE: f64 = 0.002;

/// An AT won directly at `AT` a game, no ceiling, beside a side bonus at
/// `SIDE` a game below its ceiling of `CEILING`, paying `MEDALS`.
fn machine() -> (AtRules, AtTable) {
    let rules = AtRules {
        side_bonus: Some(SideBonusRule {
            id: id("fran"),
            ceiling: NonZeroU32::new(CEILING),
            payout: TriggerPayout {
                medals: medals(MEDALS),
                net_per_game: None,
            },
        }),
        ..rules(None, vec![mode("at", 0)])
    };
    let table = AtTable {
        side_chance: Probability::new(SIDE).expect("a chance"),
        ..table(AT, 1.0, vec![1.0], vec![1.0])
    };
    (rules, table)
}

/// The side bonus's chance on each of the first `games` games from a seat
/// so many games since the last.
fn brute(since: u32, games: usize) -> Vec<f64> {
    support::side_chances(SIDE, CEILING as usize, since, games)
}

fn path(since_side_bonus: Option<u32>, games: u32) -> Path {
    Path {
        start: PathStart {
            since_side_bonus,
            ..start(0, 0, 0)
        },
        legs: vec![Leg {
            games,
            end: LegEnd::Going,
        }],
    }
}

#[test]
fn a_walk_pays_the_side_bonus_at_its_chance_from_the_seat_on() {
    let (rules, table) = machine();
    let bare = AtRules {
        side_bonus: None,
        ..rules.clone()
    };
    for since in [0, 120, 299, 900] {
        for games in [1, 180, 700] {
            let expected: f64 = brute(since, games as usize).iter().sum::<f64>() * MEDALS;
            let gained = walk(&path(Some(since), games), &rules, &table).medals
                - walk(&path(Some(since), games), &bare, &table).medals;
            assert!(near(gained, expected), "{gained} against {expected}");
        }
    }
    let long_run = 1.0 / between(SIDE);
    let unsaid = walk(&path(None, 700), &rules, &table).medals
        - walk(&path(None, 700), &bare, &table).medals;
    assert!(near(unsaid, 700.0 * long_run * MEDALS));
    assert_eq!(
        walk(&path(Some(120), 700), &bare, &table),
        walk(&path(None, 700), &bare, &table)
    );
}

#[test]
fn a_hunt_pays_the_side_bonus_on_each_game_it_is_still_played_walked_or_chained() {
    let (rules, plain) = machine();
    let own = vec![Probability::new(1.0).expect("a rate")];
    let chained = AtTable {
        successes: own,
        ..plain.clone()
    };
    let horizon = 20_000;
    for table in [plain, chained] {
        for since in [0, 150, 299] {
            let expected: f64 = brute(since, horizon)
                .iter()
                .enumerate()
                .map(|(game, chance)| {
                    (1.0 - AT).powi(i32::try_from(game).expect("a count")) * chance
                })
                .sum::<f64>()
                * MEDALS;
            let hunted = hunt(
                PathStart {
                    since_side_bonus: Some(since),
                    ..start(0, 0, 0)
                },
                &rules,
                &table,
            )
            .expect("comes");
            assert!(
                near(hunted.side_medals, expected),
                "{} against {expected}",
                hunted.side_medals
            );
            assert!(near(
                hunted.medals,
                hunted.at_medals + hunted.side_medals - support::LOSS * hunted.games
            ));
        }
        let unsaid = hunt(start(0, 0, 0), &rules, &table).expect("comes");
        assert!(near(
            unsaid.side_medals,
            unsaid.games / between(SIDE) * MEDALS
        ));
    }
}

#[test]
fn a_machine_without_a_side_bonus_hunts_as_it_did_whatever_the_seat_says_of_one() {
    let spec = at_spec();
    let normalized = normalize(&spec).expect("normalises");
    let rules = normalized.at_rules.as_ref().expect("rules");
    let table = normalized.tables[0].at.as_ref().expect("an AT");
    let said = PathStart {
        since_side_bonus: Some(40),
        ..start(10, 10, 0)
    };
    assert_eq!(
        hunt(said, rules, table),
        hunt(start(10, 10, 0), rules, table)
    );
    assert_eq!(
        hunt(start(10, 10, 0), rules, table).map(|hunted| hunted.side_medals),
        Some(0.0)
    );
}

#[test]
fn a_stated_rate_beside_a_side_bonus_leaves_the_at_the_rest_and_comes_back() {
    let mut spec = sided();
    spec.components.payout.remove(&id("at"));
    let rate = |points| {
        pachislot_domain::conditions::PayoutRate::from_basis_points(points).expect("a rate")
    };
    spec.components.rate.insert(
        id("at"),
        pachislot_domain::setting_level::PerSettingLevel(vec![
            (support::setting_level(1), rate(9_800)),
            (support::setting_level(6), rate(11_000)),
        ]),
    );
    let normalized = normalize(&spec).expect("normalises");
    let analysis = analyze(&normalized, &PayoutBasis::FromSpec).expect("analyses");
    let mut bare = spec.clone();
    bare.components.side_bonus.clear();
    bare.entities.retain(|entity| *entity != id("fran"));
    bare.components.chance.remove(&id("fran"));
    bare.components.payout.remove(&id("fran"));
    bare.components.ceiling.remove(&id("fran"));
    bare.components.net_per_game.remove(&id("fran"));
    let without = analyze(
        &normalize(&bare).expect("normalises"),
        &PayoutBasis::FromSpec,
    )
    .expect("analyses");
    for (index, stated) in [0.98, 1.1].into_iter().enumerate() {
        let figures = &analysis.setting_levels[index];
        assert!(near(figures.payout_rate, stated));
        let gain = figures.at.expect("an AT figure").gain;
        assert!(gain < without.setting_levels[index].at.expect("an AT figure").gain);
    }
}

#[test]
fn a_side_bonus_without_a_ceiling_comes_at_its_chance_whatever_the_seat_says() {
    let (rules, table) = machine();
    let free = AtRules {
        side_bonus: rules.side_bonus.clone().map(|side| SideBonusRule {
            ceiling: None,
            ..side
        }),
        ..rules.clone()
    };
    let bare = AtRules {
        side_bonus: None,
        ..rules
    };
    for since in [None, Some(0), Some(5_000_000)] {
        let gained = walk(&path(since, 700), &free, &table).medals
            - walk(&path(since, 700), &bare, &table).medals;
        assert!(near(gained, 700.0 * SIDE * MEDALS), "{gained}");
    }
}
