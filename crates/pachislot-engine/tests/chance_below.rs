#![allow(clippy::expect_used, clippy::indexing_slicing, clippy::float_cmp)]

mod support;

use pachislot_domain::conditions::{PayoutBasis, PayoutRate};
use pachislot_domain::normalized::NormalizedSpec;
use pachislot_domain::probability::{Denominator, ProbabilitySource};
use pachislot_domain::setting_level::PerSettingLevel;
use pachislot_domain::spec::{Component, Spec};
use pachislot_engine::analysis::analyze;
use pachislot_engine::error::SpecError;
use pachislot_engine::normalize::normalize;
use std::num::NonZeroU32;
use support::{at_spec, cz_spec, id, mode_spec, one_in, per, setting_level};

fn near(left: f64, right: f64) -> bool {
    (left - right).abs() <= 1e-9 * left.abs().max(right.abs()).max(1.0)
}

/// What a chance `p` a game below a ceiling of `ceiling` games comes to with
/// the ceiling: one over the games between two, `(1 − (1 − p)^C) / p`.
fn combined(p: f64, ceiling: i32) -> f64 {
    p / (1.0 - (1.0 - p).powi(ceiling))
}

/// The CZ machine with its CZ given at 1/333.8 and 1/280 a game below its
/// ceilings, in place of its 合算.
fn below() -> Spec {
    let mut spec = cz_spec();
    spec.components.first_hit.remove(&id("cz"));
    spec.components
        .chance
        .insert(id("cz"), per(one_in(33_380), one_in(28_000)));
    spec
}

/// Each setting's 機械割 as measured, to analyse a machine without its 純増.
fn measured() -> PayoutBasis {
    let rate = |points| PayoutRate::from_basis_points(points).expect("a rate");
    PayoutBasis::Measured(PerSettingLevel(vec![
        (setting_level(1), rate(9_700)),
        (setting_level(6), rate(11_000)),
    ]))
}

#[test]
fn a_cz_given_below_its_ceilings_is_taken_as_it_is_and_its_combined_worked_out() {
    let normalized = normalize(&below()).expect("normalises");
    let figures = analyze(&normalized, &measured()).expect("analyses");
    for (index, chance) in [1.0 / 333.8, 1.0 / 280.0].into_iter().enumerate() {
        let table = normalized.tables[index].at.as_ref().expect("an AT");
        assert_eq!(table.chance.value(), chance);
        let worked = figures.setting_levels[index].bonuses[0].chance;
        assert!(near(worked, combined(chance, 600)), "{worked}");
        assert!(worked > chance);
    }
}

#[test]
fn a_combined_worked_out_reads_back_to_the_chance_it_came_from() {
    let normalized = normalize(&below()).expect("normalises");
    let mut published = cz_spec();
    published.components.first_hit.insert(
        id("cz"),
        per(round_trip(&normalized, 0), round_trip(&normalized, 1)),
    );
    let read = normalize(&published).expect("normalises");
    for index in 0..2 {
        let given = normalized.tables[index].at.as_ref().expect("an AT").chance;
        let back = read.tables[index].at.as_ref().expect("an AT").chance;
        assert!(
            (given.value() - back.value()).abs() < 1e-6 * given.value(),
            "{} against {}",
            given.value(),
            back.value()
        );
    }
}

/// The 合算 a table's chance comes to, written as a sheet could: ten
/// thousand in so many hundredths, as near as they come to it.
#[allow(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "a published figure in hundredths, far inside a u32"
)]
fn round_trip(normalized: &NormalizedSpec, index: usize) -> ProbabilitySource {
    let chance = normalized.tables[index]
        .at
        .as_ref()
        .expect("an AT")
        .chance
        .value();
    let hundredths = (1_000_000.0 / combined(chance, 600)).round() as u32;
    ProbabilitySource::Ratio {
        numerator: 10_000,
        denominator: Denominator::from_hundredths(NonZeroU32::new(hundredths).expect("non-zero")),
    }
}

#[test]
fn a_chance_too_rare_for_a_combined_is_a_fine_chance_below_the_ceiling() {
    let mut published = cz_spec();
    published
        .components
        .first_hit
        .insert(id("cz"), per(one_in(70_000), one_in(28_000)));
    assert_eq!(
        normalize(&published),
        Err(SpecError::FirstHitBeyondCeiling {
            at: id("cz"),
            setting_level: setting_level(1),
        })
    );
    let mut given = below();
    given
        .components
        .chance
        .insert(id("cz"), per(one_in(70_000), one_in(28_000)));
    let normalized = normalize(&given).expect("normalises");
    assert_eq!(
        normalized.tables[0]
            .at
            .as_ref()
            .expect("an AT")
            .chance
            .value(),
        1.0 / 700.0
    );
}

#[test]
fn an_at_won_directly_may_be_given_below_its_ceiling_too() {
    let mut spec = at_spec();
    spec.components.first_hit.remove(&id("at"));
    spec.components
        .chance
        .insert(id("at"), per(one_in(50_000), one_in(40_000)));
    let normalized = normalize(&spec).expect("normalises");
    let analysis = analyze(&normalized, &measured()).expect("analyses");
    for (index, chance) in [1.0 / 500.0, 1.0 / 400.0].into_iter().enumerate() {
        assert_eq!(
            normalized.tables[index]
                .at
                .as_ref()
                .expect("an AT")
                .chance
                .value(),
            chance
        );
        assert!(near(
            analysis.setting_levels[index].bonuses[0].chance,
            combined(chance, 1_000)
        ));
    }
}

#[test]
fn a_machine_of_modes_takes_the_chance_given_below_in_every_mode_without_its_own() {
    let mut spec = mode_spec();
    spec.components.first_hit.remove(&id("at"));
    spec.components
        .chance
        .insert(id("at"), per(one_in(50_000), one_in(40_000)));
    let normalized = normalize(&spec).expect("normalises");
    assert_eq!(
        normalized.tables[1]
            .at
            .as_ref()
            .expect("an AT")
            .chance
            .value(),
        1.0 / 400.0
    );
}

#[test]
fn a_chance_below_and_a_combined_are_one_or_the_other() {
    let mut both = below();
    both.components
        .first_hit
        .insert(id("cz"), per(one_in(15_000), one_in(12_000)));
    assert_eq!(
        normalize(&both),
        Err(SpecError::ConflictingComponents {
            entity: id("cz"),
            first: Component::Chance,
            second: Component::FirstHit,
        })
    );
    let mut neither = below();
    neither.components.chance.remove(&id("cz"));
    assert_eq!(
        normalize(&neither),
        Err(SpecError::MissingComponent {
            entity: id("cz"),
            component: Component::FirstHit,
        })
    );
}
