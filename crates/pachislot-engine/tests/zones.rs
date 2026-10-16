#![allow(clippy::expect_used, clippy::indexing_slicing, clippy::float_cmp)]

mod support;

use std::num::NonZeroU32;

use pachislot_domain::normalized::{AtTable, Gate, ModeRule};
use pachislot_domain::observation::{ToldLeg, ToldPath};
use pachislot_domain::probability::{BasisPoints, Probability};
use pachislot_domain::setting_level::PerSettingLevel;
use pachislot_domain::spec::Gate as SpecGate;
use pachislot_engine::at::{Odds, cycle, told_log_likelihood};
use pachislot_engine::error::SpecError;
use pachislot_engine::hunt::hunt;
use pachislot_engine::normalize::normalize;
use support::{
    ceiled, cz_spec, id, mode, mode_spec, odds, rules, setting_level, shares, start, table, through,
};

fn near(left: f64, right: f64) -> bool {
    (left - right).abs() <= 1e-9 * left.abs().max(right.abs()).max(1.0)
}

fn gate(game: u32, trigger: f64, at: f64) -> Gate {
    Gate {
        game: NonZeroU32::new(game).expect("a game"),
        trigger: Probability::new(trigger).expect("a share"),
        at: Probability::new(at).expect("a share"),
    }
}

fn zoned(chance: f64, success: f64, gates: &[Vec<Gate>]) -> Odds<'_> {
    Odds {
        gates,
        ..odds(chance, success, 0.0)
    }
}

fn gated_table(chance: f64, success: f64, gates: Vec<Gate>) -> AtTable {
    AtTable {
        gates: vec![gates],
        ..table(chance, success, vec![1.0], vec![1.0])
    }
}

#[test]
fn a_zone_that_draws_every_trigger_still_waiting_is_a_ceiling_counted_from_the_at() {
    let (p, q) = (0.004, 0.3);
    let forced = ModeRule {
        since_at_ceiling: NonZeroU32::new(400),
        ..ceiled("cz", 0, 900)
    };
    let by_ceiling = cycle(&rules(Some("cz"), vec![forced]), odds(p, q, 0.0), &[1.0]);
    let gates = [vec![gate(400, 1.0, 0.0)]];
    let by_zone = cycle(
        &rules(Some("cz"), vec![ceiled("cz", 0, 900)]),
        zoned(p, q, &gates),
        &[1.0],
    );
    assert!(near(by_ceiling.games, by_zone.games));
    assert!(near(by_ceiling.triggers, by_zone.triggers));
}

#[test]
fn a_zone_alone_brings_the_trigger_and_the_at_at_its_shares() {
    let machine = rules(Some("cz"), vec![ceiled("cz", 0, 300)]);
    let triggered = [vec![gate(100, 0.4, 0.0)]];
    let found = cycle(&machine, zoned(0.0, 1.0, &triggered), &[1.0]);
    assert!(near(found.triggers, 0.4));
    assert!(near(found.games, 0.4 * 100.0 + 0.6 * 300.0));
    let outright = [vec![gate(100, 0.0, 0.5)]];
    let found = cycle(&machine, zoned(0.0, 1.0, &outright), &[1.0]);
    assert!(near(found.triggers, 0.0));
    assert!(near(found.games, 0.5 * 100.0 + 0.5 * 300.0));
}

#[test]
fn a_hunt_from_just_after_an_at_with_zones_is_the_cycle() {
    let (p, q) = (0.005, 0.35);
    let gates = vec![
        gate(100, 0.4, 0.05),
        gate(200, 0.66, 0.0),
        gate(450, 0.1, 0.2),
    ];
    for (modes, misses) in [
        (vec![ceiled("cz", 0, 600)], NonZeroU32::new(3)),
        (vec![ceiled("cz", 250, 900)], None),
        (vec![mode("cz", 0)], NonZeroU32::new(2)),
    ] {
        let machine = rules(Some("cz"), through(modes, misses));
        let held = gated_table(p, q, gates.clone());
        let found = hunt(start(0, 0, 0), &machine, &held).expect("comes");
        let whole = cycle(&machine, Odds::of(&held), &[1.0]);
        assert!(
            near(found.games, whole.games),
            "{} against {}",
            found.games,
            whole.games
        );
    }
}

#[test]
fn a_leg_told_every_way_it_could_end_comes_to_certainty_with_zones() {
    let machine = rules(Some("cz"), through(vec![ceiled("cz", 0, 500)], None));
    let held = gated_table(0.004, 0.3, vec![gate(100, 0.5, 0.1), gate(300, 0.3, 0.0)]);
    let likely = |games, won| {
        told_log_likelihood(
            &ToldPath {
                after_reset: false,
                since_at: 0,
                legs: vec![ToldLeg {
                    games,
                    won,
                    misses: None,
                }],
            },
            &machine,
            &held,
        )
        .exp()
    };
    let won: f64 = (1..=500).map(|games| likely(games, true)).sum();
    assert!((won - 1.0).abs() < 1e-9, "{won}");
    let going = likely(250, false);
    let by_then: f64 = (1..=250).map(|games| likely(games, true)).sum();
    assert!((going + by_then - 1.0).abs() < 1e-9, "{}", going + by_then);
}

fn spec_gate(
    game: u32,
    trigger: PerSettingLevel<BasisPoints>,
    at: Option<PerSettingLevel<BasisPoints>>,
) -> SpecGate {
    SpecGate {
        game: NonZeroU32::new(game).expect("a game"),
        span: None,
        trigger,
        at,
    }
}

#[test]
fn a_mode_s_zones_are_normalised_setting_by_setting_and_a_cz_s_go_to_each_of_its_own_modes() {
    let mut moded = mode_spec();
    moded.entities.push(id("cz"));
    moded.components.cz = [id("cz")].into();
    moded.components.label.insert(id("cz"), "CZ".to_owned());
    moded.components.first_hit.remove(&id("at"));
    moded.components.first_hit.insert(
        id("cz"),
        support::per(support::one_in(15_000), support::one_in(12_000)),
    );
    moded
        .components
        .success
        .insert(id("cz"), shares(3_000, 4_000));
    moded.components.gates.insert(
        id("normal"),
        vec![spec_gate(500, shares(4_000, 6_600), Some(shares(0, 500)))],
    );
    let normalized = normalize(&moded).expect("normalises");
    let at = |level: usize| normalized.tables[level].at.as_ref().expect("an AT table");
    assert_eq!(at(0).gates[0], Vec::new());
    assert_eq!(at(0).gates[1], vec![gate(500, 0.4, 0.0)]);
    assert_eq!(at(1).gates[1], vec![gate(500, 0.66, 0.05)]);
    let mut plain = cz_spec();
    plain
        .components
        .gates
        .insert(id("cz"), vec![spec_gate(100, shares(2_000, 2_000), None)]);
    let normalized = normalize(&plain).expect("normalises");
    let gates = &normalized.tables[0].at.as_ref().expect("an AT table").gates;
    assert_eq!(gates.len(), 2);
    assert!(gates.iter().all(|each| *each == vec![gate(100, 0.2, 0.0)]));
}

#[test]
fn zones_are_refused_twice_on_a_game_beyond_the_whole_or_on_the_cz_beside_modes() {
    let mut twice = cz_spec();
    twice.components.gates.insert(
        id("cz"),
        vec![
            spec_gate(100, shares(2_000, 2_000), None),
            spec_gate(100, shares(1_000, 1_000), None),
        ],
    );
    assert_eq!(
        normalize(&twice),
        Err(SpecError::GateTwice {
            entity: id("cz"),
            game: NonZeroU32::new(100).expect("a game")
        })
    );
    let mut beyond = cz_spec();
    beyond.components.gates.insert(
        id("cz"),
        vec![spec_gate(
            100,
            shares(6_000, 6_000),
            Some(shares(5_000, 1_000)),
        )],
    );
    assert_eq!(
        normalize(&beyond),
        Err(SpecError::GateBeyondWhole {
            entity: id("cz"),
            game: NonZeroU32::new(100).expect("a game"),
            setting_level: setting_level(1)
        })
    );
    let mut moded = mode_spec();
    moded.entities.push(id("cz"));
    moded.components.cz = [id("cz")].into();
    moded.components.first_hit.remove(&id("at"));
    moded.components.first_hit.insert(
        id("cz"),
        support::per(support::one_in(15_000), support::one_in(12_000)),
    );
    moded
        .components
        .success
        .insert(id("cz"), shares(3_000, 4_000));
    moded
        .components
        .gates
        .insert(id("cz"), vec![spec_gate(100, shares(2_000, 2_000), None)]);
    assert_eq!(
        normalize(&moded),
        Err(SpecError::GatesBesideModes { entity: id("cz") })
    );
}

#[test]
fn a_zone_with_a_span_draws_its_shares_evenly_over_its_games_and_refuses_one_it_overlaps() {
    let mut spanned = cz_spec();
    spanned
        .components
        .ceiling
        .insert(id("at"), NonZeroU32::new(1_000).expect("a ceiling"));
    spanned.components.gates.insert(
        id("cz"),
        vec![SpecGate {
            span: NonZeroU32::new(66),
            ..spec_gate(1, shares(0, 0), Some(shares(2_470, 5_800)))
        }],
    );
    let normalized = normalize(&spanned).expect("normalises");
    let gates = &normalized.tables[0].at.as_ref().expect("an AT table").gates[0];
    assert_eq!(gates.len(), 66);
    assert_eq!(gates.first().map(|gate| gate.game.get()), Some(1));
    assert_eq!(gates.last().map(|gate| gate.game.get()), Some(66));
    let missed: f64 = gates.iter().map(|gate| 1.0 - gate.at.value()).product();
    assert!(near(1.0 - missed, 0.247), "{}", 1.0 - missed);
    let mut overlapping = spanned.clone();
    overlapping
        .components
        .gates
        .get_mut(&id("cz"))
        .expect("zones")
        .push(spec_gate(30, shares(1_000, 1_000), None));
    assert_eq!(
        normalize(&overlapping),
        Err(SpecError::GateTwice {
            entity: id("cz"),
            game: NonZeroU32::new(30).expect("a game")
        })
    );
}
