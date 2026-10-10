//! Sampling held to the exact figures: a sampled payout rate within its own
//! margin of the solved one, a simulated play's mean within five standard
//! errors of the solved theoretical value, and any chunking of a run giving what
//! one run gives.

#![allow(clippy::expect_used, clippy::indexing_slicing)]

#[path = "../../pachislot-engine/tests/support.rs"]
mod support;

use std::num::NonZeroU64;

use pachislot_domain::conditions::{PayoutBasis, PayoutRate, PlayConditions};
use pachislot_domain::probability::Probability;
use pachislot_domain::setting_level::PerSettingLevel;
use pachislot_engine::analysis::analyze;
use pachislot_engine::normalize::normalize;
use pachislot_engine::theoretical::theoretical_value;
use pachislot_simulator::estimate::{Estimate, advance_estimate};
use pachislot_simulator::game::models;
use pachislot_simulator::rng::Seed;
use pachislot_simulator::session::{Mix, Plan, Progress, advance};
use support::{made_up_spec, setting_level};

fn count(value: u64) -> NonZeroU64 {
    NonZeroU64::new(value).expect("non-zero")
}

fn play() -> PlayConditions {
    PlayConditions::new(
        1_000.0 / 56.0,
        20.0,
        Probability::new(0.5).expect("a share"),
        None,
    )
    .expect("conditions")
}

#[test]
fn a_sampled_payout_rate_holds_the_solved_one_within_its_margin() {
    let spec = normalize(&made_up_spec()).expect("normalises");
    let analysis = analyze(&spec, &PayoutBasis::FromSpec).expect("solves");
    let models = models(&spec, &analysis).expect("models");
    let estimate = advance_estimate(
        &models,
        count(400_000),
        &Estimate::start(Seed(11), &models),
        count(800_000),
    );
    estimate
        .tallies
        .iter()
        .zip(&analysis.setting_levels)
        .for_each(|(tally, exact)| {
            let sampled = 1.0 + tally.net_per_game().expect("a figure") / 3.0;
            let margin = tally.payout_rate_margin(3).expect("a margin");
            assert!(
                (sampled - exact.payout_rate).abs() < margin,
                "setting level {}: {sampled} against {} ± {margin}",
                exact.setting_level.get(),
                exact.payout_rate
            );
        });
}

#[test]
fn a_measured_rate_is_what_the_model_samples() {
    let spec = normalize(&made_up_spec()).expect("normalises");
    let rates = PerSettingLevel(vec![
        (
            setting_level(1),
            PayoutRate::from_basis_points(9_700).expect("a rate"),
        ),
        (
            setting_level(6),
            PayoutRate::from_basis_points(11_000).expect("a rate"),
        ),
    ]);
    let analysis = analyze(&spec, &PayoutBasis::Measured(rates)).expect("solves");
    let models = models(&spec, &analysis).expect("models");
    let estimate = advance_estimate(
        &models,
        count(300_000),
        &Estimate::start(Seed(5), &models),
        count(600_000),
    );
    let high = &estimate.tallies[1];
    let sampled = 1.0 + high.net_per_game().expect("a figure") / 3.0;
    assert!((sampled - 1.1).abs() < high.payout_rate_margin(3).expect("a margin"));
}

#[test]
fn a_simulated_play_averages_to_the_solved_theoretical_value() {
    let spec = normalize(&made_up_spec()).expect("normalises");
    let analysis = analyze(&spec, &PayoutBasis::FromSpec).expect("solves");
    let weights = vec![(setting_level(1), 0.3), (setting_level(6), 0.7)];
    let mix = Mix::new(models(&spec, &analysis).expect("models"), weights.clone()).expect("a mix");
    let plan = Plan {
        sessions: count(4_000),
        games: 2_000,
        bet: 3,
        play: play(),
    };
    let done = advance(&mix, &plan, &Progress::start(Seed(3)), count(4_000));
    let exact = theoretical_value(&analysis, 3, &weights, play(), 2_000).yen;
    let mean = done.aggregate.mean_yen().expect("a mean");
    let standard_error = done.aggregate.standard_deviation().expect("a spread") / 4_000_f64.sqrt();
    assert!(
        (mean - exact).abs() < 5.0 * standard_error,
        "{mean} against {exact} ± {standard_error}"
    );
}

#[test]
fn a_run_chunked_any_way_comes_out_the_same() {
    let spec = normalize(&made_up_spec()).expect("normalises");
    let analysis = analyze(&spec, &PayoutBasis::FromSpec).expect("solves");
    let models = models(&spec, &analysis).expect("models");
    let mix = Mix::new(
        models.clone(),
        vec![(setting_level(1), 0.5), (setting_level(6), 0.5)],
    )
    .expect("a mix");
    let plan = Plan {
        sessions: count(60),
        games: 500,
        bet: 3,
        play: play(),
    };
    let whole = advance(&mix, &plan, &Progress::start(Seed(9)), count(60));
    let pieces = (0..7).fold(Progress::start(Seed(9)), |progress, _| {
        advance(&mix, &plan, &progress, count(9))
    });
    assert_eq!(whole, pieces);
    let one = advance_estimate(
        &models,
        count(1_000),
        &Estimate::start(Seed(2), &models),
        count(2_000),
    );
    let many = (0..30).fold(Estimate::start(Seed(2), &models), |estimate, _| {
        advance_estimate(&models, count(1_000), &estimate, count(77))
    });
    assert_eq!(one, many);
}

#[test]
fn a_mix_needs_a_model_for_every_weighted_setting() {
    let spec = normalize(&made_up_spec()).expect("normalises");
    let analysis = analyze(&spec, &PayoutBasis::FromSpec).expect("solves");
    let models = models(&spec, &analysis).expect("models");
    assert!(Mix::new(models.clone(), vec![]).is_none());
    assert!(Mix::new(models.clone(), vec![(setting_level(3), 1.0)]).is_none());
    assert!(Mix::new(models, vec![(setting_level(6), 1.0)]).is_some());
}
