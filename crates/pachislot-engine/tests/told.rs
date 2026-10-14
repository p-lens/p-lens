#![allow(clippy::expect_used, clippy::indexing_slicing)]

mod support;

use pachislot_domain::normalized::{AtTable, NormalizedSpec};
use pachislot_domain::observation::{ToldLeg, ToldPath};
use pachislot_engine::at::told_log_likelihood;
use pachislot_engine::normalize::normalize;
use pachislot_engine::posterior::posterior_told;
use support::{at_spec, cz_spec, setting_level};

fn spec_of(cz: bool) -> NormalizedSpec {
    normalize(&if cz { cz_spec() } else { at_spec() }).expect("normalises")
}

fn table(spec: &NormalizedSpec, setting: u8) -> &AtTable {
    spec.table(setting_level(setting))
        .and_then(|table| table.at.as_ref())
        .expect("an AT machine's table")
}

fn likelihood(spec: &NormalizedSpec, setting: u8, after_reset: bool, legs: Vec<ToldLeg>) -> f64 {
    told_log_likelihood(
        &ToldPath {
            after_reset,
            since_at: 0,
            legs,
        },
        spec.at_rules.as_ref().expect("AT rules"),
        table(spec, setting),
    )
    .exp()
}

fn leg(games: u32, won: bool, misses: Option<u32>) -> ToldLeg {
    ToldLeg { games, won, misses }
}

#[test]
fn a_leg_whose_misses_are_not_told_is_every_number_it_might_have_had() {
    let spec = spec_of(true);
    for (games, won) in [(150, true), (420, true), (420, false), (90, false)] {
        let unknown = likelihood(&spec, 1, false, vec![leg(games, won, None)]);
        let summed: f64 = (0..40)
            .map(|misses| likelihood(&spec, 1, false, vec![leg(games, won, Some(misses))]))
            .sum();
        assert!(
            (unknown - summed).abs() < 1e-9 * unknown.max(1e-300),
            "{games} games, won {won}: {unknown} against {summed}"
        );
    }
}

#[test]
fn a_leg_told_its_misses_reads_closer_than_one_that_was_not() {
    let spec = spec_of(true);
    let told = |misses| {
        posterior_told(
            &spec,
            None,
            &ToldPath {
                after_reset: false,
                since_at: 0,
                legs: vec![leg(300, true, misses)],
            },
        )
        .expect("infers")
        .setting_levels
    };
    let unknown = told(None);
    let none_missed = told(Some(0));
    assert_ne!(unknown, none_missed);
}

#[test]
fn early_ats_lean_to_the_setting_that_brings_them_sooner() {
    let spec = spec_of(false);
    let read = |games: u32| {
        posterior_told(
            &spec,
            None,
            &ToldPath {
                after_reset: false,
                since_at: 0,
                legs: vec![
                    leg(games, true, None),
                    leg(games, true, None),
                    leg(games, true, None),
                ],
            },
        )
        .expect("infers")
        .setting_levels
        .last()
        .map(|(_, share)| *share)
        .expect("a high setting")
    };
    assert!(read(80) > read(600));
}

#[test]
fn a_leg_goes_on_past_no_at_ceiling() {
    let spec = spec_of(false);
    let total: f64 = (1..=3000)
        .map(|games| likelihood(&spec, 1, false, vec![leg(games, true, None)]))
        .sum();
    assert!(total <= 1.0 + 1e-9, "{total}");
}

#[test]
fn a_cabinet_sat_down_at_is_read_given_its_at_had_not_come() {
    let spec = spec_of(true);
    let rules = spec.at_rules.as_ref().expect("AT rules");
    let at = table(&spec, 1);
    let told = |since_at, games, won| {
        told_log_likelihood(
            &ToldPath {
                after_reset: false,
                since_at,
                legs: vec![leg(games, won, None)],
            },
            rules,
            at,
        )
        .exp()
    };
    let whole = told(0, 500, true);
    let before = told(0, 200, false);
    assert!((told(200, 300, true) - whole / before).abs() < 1e-12);
}
