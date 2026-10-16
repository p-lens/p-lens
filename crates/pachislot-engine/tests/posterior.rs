#![allow(clippy::expect_used, clippy::indexing_slicing)]

mod support;

use pachislot_domain::distribution::Distribution;
use pachislot_domain::normalized::NormalizedSpec;
use pachislot_domain::observation::Segment;
use pachislot_domain::probability::BasisPoints;
use pachislot_domain::setting_level::PerSettingLevel;
use pachislot_engine::error::InferenceError;
use pachislot_engine::normalize::normalize;
use pachislot_engine::posterior::posterior;
use proptest::prelude::*;
use support::{close, id, made_up_spec, setting_level, watched_spec};

fn spec() -> NormalizedSpec {
    normalize(&made_up_spec()).expect("normalises")
}

fn counter(games: u32, big: u32, reg: u32) -> Segment {
    Segment {
        games,
        counts: vec![(id("big"), big), (id("reg"), reg)],
    }
}

fn prior(low: u32, high: u32) -> Distribution {
    Distribution(PerSettingLevel(vec![
        (setting_level(1), BasisPoints::new(low).expect("share")),
        (setting_level(6), BasisPoints::new(high).expect("share")),
    ]))
}

/// The multinomial written out for two outcomes and the rest.
fn by_hand(games: f64, big: f64, reg: f64, low_prior: f64) -> f64 {
    let log = |p_big: f64, p_reg: f64| {
        big * p_big.ln() + reg * p_reg.ln() + (games - big - reg) * (1.0 - p_big - p_reg).ln()
    };
    let low = low_prior * log(0.004, 0.0025).exp();
    let high = (1.0 - low_prior) * log(0.005, 0.004).exp();
    low / (low + high)
}

#[test]
fn bonuses_on_the_counter_update_an_even_prior_by_hand() {
    let found = posterior(&spec(), None, &[counter(1_000, 5, 3)], None).expect("infers");
    assert!(close(
        found.setting_levels[0].1,
        by_hand(1_000.0, 5.0, 3.0, 0.5)
    ));
    assert!(close(
        found.setting_levels[0].1 + found.setting_levels[1].1,
        1.0
    ));
}

#[test]
fn a_prior_weighs_the_same_likelihood() {
    let found = posterior(
        &spec(),
        Some(&prior(9_000, 1_000)),
        &[counter(1_000, 5, 3)],
        None,
    )
    .expect("infers");
    assert!(close(
        found.setting_levels[0].1,
        by_hand(1_000.0, 5.0, 3.0, 0.9)
    ));
}

#[test]
fn nothing_seen_gives_the_prior_back() {
    let found = posterior(&spec(), Some(&prior(7_500, 2_500)), &[], None).expect("infers");
    assert!(close(found.setting_levels[0].1, 0.75));
}

#[test]
fn a_setting_given_no_share_is_ruled_out() {
    let found = posterior(
        &spec(),
        Some(&prior(10_000, 0)),
        &[counter(1_000, 5, 3)],
        None,
    )
    .expect("infers");
    assert!(close(found.setting_levels[0].1, 1.0));
    assert!(close(found.setting_levels[1].1, 0.0));
}

#[test]
fn counting_parts_tells_more_than_counting_the_bonus() {
    let parts = Segment {
        games: 2_000,
        counts: vec![(id("big"), 9), (id("reg-solo"), 6), (id("reg-cherry"), 2)],
    };
    let found = posterior(&spec(), None, &[parts], None).expect("infers");
    let log = |p_big: f64, p_solo: f64, p_cherry: f64| {
        9.0 * p_big.ln()
            + 6.0 * p_solo.ln()
            + 2.0 * p_cherry.ln()
            + 1_983.0 * (1.0 - p_big - p_solo - p_cherry).ln()
    };
    let low = log(0.004, 0.002, 0.0005).exp();
    let high = log(0.005, 0.003, 0.001).exp();
    assert!(close(found.setting_levels[1].1, high / (low + high)));
}

#[test]
fn a_bonus_and_its_own_part_cannot_both_be_counted() {
    let both = Segment {
        games: 100,
        counts: vec![(id("reg"), 1), (id("reg-solo"), 1)],
    };
    assert_eq!(
        posterior(&spec(), None, &[both], None),
        Err(InferenceError::OverlappingCounts {
            segment: 0,
            id: id("reg")
        })
    );
}

#[test]
fn a_count_must_name_something_in_the_spec_and_fit_its_games() {
    let stray = Segment {
        games: 100,
        counts: vec![(id("bell"), 1)],
    };
    assert_eq!(
        posterior(&spec(), None, &[stray], None),
        Err(InferenceError::UnknownCount {
            segment: 0,
            id: id("bell")
        })
    );
    assert_eq!(
        posterior(&spec(), None, &[counter(10, 8, 3)], None),
        Err(InferenceError::CountsExceedGames { segment: 0 })
    );
}

#[test]
fn a_prior_must_be_the_machines_settings_summing_to_a_whole() {
    assert_eq!(
        posterior(&spec(), Some(&prior(5_000, 4_000)), &[], None),
        Err(InferenceError::InvalidPrior { sum: 9_000 })
    );
    let stray = Distribution(PerSettingLevel(vec![
        (setting_level(1), BasisPoints::new(5_000).expect("share")),
        (setting_level(3), BasisPoints::new(5_000).expect("share")),
    ]));
    assert_eq!(
        posterior(&spec(), Some(&stray), &[], None),
        Err(InferenceError::PriorMismatch {
            setting_level: setting_level(3)
        })
    );
}

#[test]
fn what_no_allowed_setting_could_give_is_contradictory() {
    let only_high = prior(0, 10_000);
    let never = normalize(&support::with_role(
        "bell",
        support::per(support::percent(10), support::percent(0)),
    ))
    .expect("normalises");
    let rang = Segment {
        games: 100,
        counts: vec![(id("bell"), 1)],
    };
    assert!(posterior(&never, None, std::slice::from_ref(&rang), None).is_ok());
    assert_eq!(
        posterior(&never, Some(&only_high), &[rang], None),
        Err(InferenceError::ContradictoryEvidence)
    );
}

proptest! {
    #[test]
    fn stretches_of_play_add_up_like_one(
        first in 0_u32..3_000, second in 0_u32..3_000,
        big in 0_u32..20, reg in 0_u32..20, more_big in 0_u32..20, more_reg in 0_u32..20,
    ) {
        prop_assume!(big + reg <= first && more_big + more_reg <= second);
        let apart = posterior(&spec(), None, &[counter(first, big, reg), counter(second, more_big, more_reg)], None)
            .expect("infers");
        let together = posterior(&spec(), None, &[counter(first + second, big + more_big, reg + more_reg)], None)
            .expect("infers");
        prop_assert!((apart.setting_levels[0].1 - together.setting_levels[0].1).abs() < 1e-9);
        prop_assert!((apart.setting_levels[0].1 + apart.setting_levels[1].1 - 1.0).abs() < 1e-9);
    }
}

fn watched() -> NormalizedSpec {
    normalize(&watched_spec()).expect("normalises")
}

fn stretch(games: u32, counts: &[(&str, u32)]) -> Segment {
    Segment {
        games,
        counts: counts
            .iter()
            .map(|(name, count)| (id(name), *count))
            .collect(),
    }
}

#[test]
fn a_bonus_watched_weighs_every_trial_of_it_by_hand() {
    let found = posterior(
        &watched(),
        None,
        &[stretch(1_000, &[("big", 5), ("reg", 3), ("big-suika", 4)])],
        None,
    )
    .expect("infers");
    let suika = |p: f64| 4.0 * p.ln() + 96.0 * (1.0 - p).ln();
    let low = by_hand(1_000.0, 5.0, 3.0, 0.5);
    let ratio = (suika(1.0 / 40.0) - suika(1.0 / 30.0)).exp();
    assert!(close(
        found.setting_levels[0].1,
        low * ratio / (low * ratio + (1.0 - low))
    ));
}

#[test]
fn a_watch_is_weighed_only_where_a_cue_of_it_is_counted_none_included() {
    let unwatched = posterior(
        &watched(),
        None,
        &[stretch(1_000, &[("big", 5), ("reg", 3)])],
        None,
    )
    .expect("infers");
    assert!(close(
        unwatched.setting_levels[0].1,
        by_hand(1_000.0, 5.0, 3.0, 0.5)
    ));
    let none_seen = posterior(
        &watched(),
        None,
        &[stretch(1_000, &[("big", 5), ("reg", 3), ("big-suika", 0)])],
        None,
    )
    .expect("infers");
    assert!(none_seen.setting_levels[0].1 > unwatched.setting_levels[0].1);
}

#[test]
fn a_certain_watch_weighs_the_trials_whose_cue_was_counted() {
    let found = posterior(
        &watched(),
        None,
        &[stretch(100, &[("lamp-blue", 3), ("lamp-red", 1)])],
        None,
    )
    .expect("infers");
    let low = 0.6_f64.powi(3) * 0.4;
    let high = 0.4_f64.powi(3) * 0.6;
    assert!(close(found.setting_levels[0].1, low / (low + high)));
}

#[test]
fn cues_are_no_regular_games_and_never_more_than_their_bonus_gives() {
    assert!(
        posterior(
            &watched(),
            None,
            &[stretch(10, &[("big", 1), ("big-suika", 5)])],
            None,
        )
        .is_ok()
    );
    assert_eq!(
        posterior(
            &watched(),
            None,
            &[stretch(1_000, &[("big", 1), ("big-suika", 21)])],
            None,
        ),
        Err(InferenceError::CuesExceedTrials {
            segment: 0,
            id: id("big-games")
        })
    );
}
