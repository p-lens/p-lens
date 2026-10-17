#![allow(clippy::expect_used, clippy::indexing_slicing, clippy::float_cmp)]

mod support;

use std::num::NonZeroU32;

use pachislot_domain::normalized::AtRules;
use pachislot_domain::spec::{Component, Spec};
use pachislot_engine::at::cycle;
use pachislot_engine::error::SpecError;
use pachislot_engine::normalize::normalize;
use support::{cz_spec, drawn_misses_spec, id, mode_spec, odds};

fn games(count: u32) -> NonZeroU32 {
    NonZeroU32::new(count).expect("a count of games")
}

fn near(left: f64, right: f64) -> bool {
    (left - right).abs() <= 1e-9 * left.abs().max(right.abs()).max(1.0)
}

/// The CZ machine without a CZ天井: an AT間天井 of 1000 games, and a CZ
/// forced on the 800th game from the AT — the 400th after a setting change.
fn shortened_after_reset() -> Spec {
    let mut spec = cz_spec();
    spec.components.ceiling.clear();
    spec.components.reset_ceiling.clear();
    spec.components.ceiling.insert(id("at"), games(1_000));
    spec.components
        .since_at_ceiling
        .insert(id("cz"), games(800));
    spec.components
        .reset_since_at_ceiling
        .insert(id("cz"), games(400));
    spec
}

fn rules_of(spec: &Spec) -> AtRules {
    normalize(spec)
        .expect("normalises")
        .at_rules
        .expect("an AT machine")
}

#[test]
fn a_setting_change_plays_a_mode_of_its_own_with_the_shorter_ceiling_from_the_at() {
    let rules = rules_of(&shortened_after_reset());
    let forced: Vec<_> = rules
        .modes
        .iter()
        .map(|mode| (mode.since_at_ceiling, mode.at_ceiling))
        .collect();
    assert_eq!(
        forced,
        vec![
            (Some(games(800)), Some(games(1_000))),
            (Some(games(400)), Some(games(1_000)))
        ]
    );
}

#[test]
fn the_reset_modes_forced_cz_comes_on_its_own_game() {
    let rules = rules_of(&shortened_after_reset());
    let sure = odds(0.0, 1.0, 0.0);
    let after_at = cycle(&rules, sure, &[1.0, 0.0]);
    let after_reset = cycle(&rules, sure, &[0.0, 1.0]);
    assert!(near(after_at.games, 800.0), "{}", after_at.games);
    assert!(near(after_reset.games, 400.0), "{}", after_reset.games);
    assert!(near(after_reset.triggers, 1.0));
    let half = odds(0.0, 0.5, 0.0);
    let drawn = cycle(&rules, half, &[0.0, 1.0]);
    assert!(
        near(drawn.games, 0.5 * 400.0 + 0.5 * 1_000.0),
        "{}",
        drawn.games
    );
    assert!(near(drawn.triggers, 1.0));
}

#[test]
fn a_modes_own_ceiling_from_the_at_stands_in_place_of_the_czs() {
    let mut spec = drawn_misses_spec();
    spec.components.ceiling.insert(id("at"), games(1_000));
    spec.components
        .since_at_ceiling
        .insert(id("cz"), games(800));
    spec.components
        .since_at_ceiling
        .insert(id("m2"), games(300));
    let rules = rules_of(&spec);
    let forced: Vec<_> = rules
        .modes
        .iter()
        .map(|mode| mode.since_at_ceiling)
        .collect();
    assert_eq!(
        forced,
        vec![Some(games(300)), Some(games(800)), Some(games(800))]
    );
    let sure = odds(0.0, 1.0, 0.0);
    assert!(near(cycle(&rules, sure, &[1.0, 0.0, 0.0]).games, 300.0));
    assert!(near(cycle(&rules, sure, &[0.0, 1.0, 0.0]).games, 600.0));
}

#[test]
fn a_mode_may_carry_the_only_ceiling_from_the_at_and_make_its_cz_sure() {
    let mut spec = drawn_misses_spec();
    spec.components.ceiling.insert(id("at"), games(1_000));
    spec.components
        .since_at_ceiling
        .insert(id("m6"), games(500));
    spec.components.ceiling_wins.insert(id("cz"));
    let rules = rules_of(&spec);
    assert_eq!(
        rules
            .modes
            .iter()
            .map(|mode| mode.since_at_ceiling)
            .collect::<Vec<_>>(),
        vec![None, None, Some(games(500))]
    );
}

#[test]
fn a_ceiling_from_the_at_after_a_setting_change_needs_the_one_after_an_at() {
    let mut alone = shortened_after_reset();
    alone.components.since_at_ceiling.clear();
    assert_eq!(
        normalize(&alone),
        Err(SpecError::ResetSinceAtCeilingWithoutSinceAtCeiling { entity: id("cz") })
    );
}

#[test]
fn a_ceiling_from_the_at_after_a_setting_change_is_the_modes_own_on_a_machine_of_modes() {
    let mut spec = drawn_misses_spec();
    spec.components.ceiling.insert(id("at"), games(1_000));
    spec.components
        .since_at_ceiling
        .insert(id("cz"), games(800));
    spec.components
        .reset_since_at_ceiling
        .insert(id("cz"), games(400));
    assert_eq!(
        normalize(&spec),
        Err(SpecError::ResetSinceAtCeilingBesideModes { entity: id("cz") })
    );
}

#[test]
fn a_ceiling_from_the_at_belongs_to_a_cz_or_a_mode_of_a_cz_machine() {
    let mut moded = mode_spec();
    moded
        .components
        .since_at_ceiling
        .insert(id("heaven"), games(50));
    assert_eq!(
        normalize(&moded),
        Err(SpecError::NeedsCz {
            entity: id("heaven"),
            component: Component::SinceAtCeiling
        })
    );
    let mut on_at = shortened_after_reset();
    on_at
        .components
        .reset_since_at_ceiling
        .insert(id("at"), games(400));
    assert_eq!(
        normalize(&on_at),
        Err(SpecError::MissingComponent {
            entity: id("at"),
            component: Component::Cz
        })
    );
}

#[test]
fn the_reset_modes_ceiling_from_the_at_is_held_to_its_own_at_ceiling() {
    let mut beyond = shortened_after_reset();
    beyond.components.reset_ceiling.insert(id("at"), games(500));
    beyond
        .components
        .reset_since_at_ceiling
        .insert(id("cz"), games(600));
    assert_eq!(
        normalize(&beyond),
        Err(SpecError::SinceAtCeilingBeyondAtCeiling { entity: id("cz") })
    );
    let mut within = shortened_after_reset();
    within.components.reset_ceiling.insert(id("at"), games(500));
    assert!(normalize(&within).is_ok());
}
