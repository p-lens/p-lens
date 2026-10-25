//! The 遊タイム, solved by hand: 1/100, every jackpot 10R and back to the regular game,
//! and after 100 spins without one a 時短 of 100 spins at 1/100.
#![allow(clippy::expect_used)]

mod support;

use pachinko_domain::conditions::{
    BallValue, CalculationConditions, PlayConditions, RoundPayout, SpinPerformance, SupportGain,
};
use pachinko_domain::quantity::SpinCount;
use pachinko_domain::spec::{Next, ReliefDrive, Spec};
use pachinko_engine::analysis::analyze;
use pachinko_engine::error::{Location, SpecError};
use pachinko_engine::hyena_hunt::hyena_hunt;
use pachinko_engine::normalize::normalize;
use pachinko_engine::relief_drive::Restart;
use support::*;

fn with_relief_drive(to_mode: &str) -> Spec {
    let mut spec = machine(
        one_in(100),
        vec![share(10_000, 10, Next::Regular)],
        vec![mode(
            "遊タイム",
            rapid(100),
            vec![share(10_000, 10, Next::Regular)],
            Next::Regular,
        )],
    );
    spec.components.relief_drive.insert(
        id("regular"),
        ReliefDrive {
            gauge: SpinCount::new(nonzero(100)),
            to: id(to_mode),
        },
    );
    spec
}

const FROM_SPEC: CalculationConditions = CalculationConditions {
    round_payout: RoundPayout::FromSpec,
    support_gain: SupportGain::NONE,
};

fn play() -> PlayConditions {
    PlayConditions {
        spin_performance: SpinPerformance::new(20.0).expect("a rate"),
        ball_value: BallValue::new(4.0).expect("a value"),
    }
}

#[test]
fn a_mode_reached_only_by_the_relief_drive_is_reached() {
    assert!(normalize(&with_relief_drive("遊タイム")).is_ok());
    let mut without = with_relief_drive("遊タイム");
    without.components.relief_drive.clear();
    assert_eq!(
        normalize(&without),
        Err(SpecError::UnreachableState {
            mode: id("遊タイム")
        })
    );
}

#[test]
fn a_relief_drive_into_no_mode_is_refused() {
    assert_eq!(
        normalize(&with_relief_drive("ない")),
        Err(SpecError::UnknownMode {
            at: Location::Regular,
            mode: id("ない")
        })
    );
}

/// Missed, the 遊タイム does not come again until a jackpot: after one that
/// brought nothing, regular play waits for a jackpot with no relief drive at all.
#[test]
fn the_round_chance_weighs_restarting_counted_and_restarting_spent() {
    let analysis = analyze(
        &normalize(&with_relief_drive("遊タイム")).expect("normalises"),
        &FROM_SPEC,
    )
    .expect("solves");
    let reach = 0.99_f64.powi(100);
    let after = (1.0 - reach) * 10.0;
    let relief_drive = analysis.relief_drive.as_ref().expect("a relief drive");
    assert!(close(relief_drive.reach_probability, reach));
    assert!(close(relief_drive.rounds_after, after));
    let filled = 1.0 / (1.0 + reach * reach);
    let spent = 1.0 - filled;
    let weight_of = |restart: Restart| {
        relief_drive
            .restarts
            .iter()
            .find(|figures| figures.restart == restart)
            .map(|figures| figures.weight)
    };
    assert!(close(
        weight_of(Restart::Filled(0)).expect("from nothing"),
        filled
    ));
    assert!(close(weight_of(Restart::Spent).expect("spent"), spent));
    let spins = filled * (1.0 - reach) / 0.01 + spent * 100.0;
    let rounds = filled * ((1.0 - reach) * 10.0 + reach * after) + spent * 10.0;
    assert!(
        close(analysis.round_chance.value(), spins / rounds),
        "{}",
        analysis.round_chance.value()
    );
}

/// A 時短 after a jackpot plays at the regular game's chance, so its spins
/// fill the relief gauge: running it out leaves the gauge at 50.
#[test]
fn a_rapid_mode_run_out_fills_the_relief_gauge() {
    let mut spec = with_relief_drive("遊タイム");
    spec.components
        .allotment
        .insert(id("regular"), vec![share(10_000, 10, to("時短"))]);
    let spec = spawn(
        spec,
        mode(
            "時短",
            rapid(50),
            vec![share(10_000, 10, to("時短"))],
            Next::Regular,
        ),
    );
    let analysis = analyze(&normalize(&spec).expect("normalises"), &FROM_SPEC).expect("solves");
    let restarts: Vec<Restart> = analysis
        .relief_drive
        .expect("a relief drive")
        .restarts
        .iter()
        .filter(|figures| figures.weight > 0.0)
        .map(|figures| figures.restart)
        .collect();
    assert!(restarts.contains(&Restart::Filled(50)), "{restarts:?}");
    assert!(restarts.contains(&Restart::Spent), "{restarts:?}");
}

/// From every point of a combo play starts again one way or another: the
/// chances given for each point come to one. In the unbroken 遊タイム a miss
/// leaves it spent; in the 時短 a jackpot won has broken, a miss leaves the
/// gauge at 50.
#[test]
fn every_point_of_a_combo_ends_in_some_restart() {
    let mut spec = with_relief_drive("遊タイム");
    spec.components
        .allotment
        .insert(id("regular"), vec![share(10_000, 10, to("時短"))]);
    let spec = spawn(
        spec,
        mode(
            "時短",
            rapid(50),
            vec![share(10_000, 10, to("時短"))],
            Next::Regular,
        ),
    );
    let analysis = analyze(&normalize(&spec).expect("normalises"), &FROM_SPEC).expect("solves");
    let endings = analysis.relief_drive.expect("a relief drive").endings;
    assert!(endings.iter().any(|ending| ending.unbroken));
    assert!(endings.iter().any(|ending| !ending.unbroken));
    for ending in &endings {
        let whole: f64 = ending.chances.iter().map(|(_, chance)| chance).sum();
        assert!((whole - 1.0).abs() < 1e-12, "{ending:?}");
    }
    let miss = 0.99_f64.powi(100);
    let unbroken = endings
        .iter()
        .find(|ending| ending.unbroken)
        .expect("the 遊タイム's first run");
    let spent = unbroken
        .chances
        .iter()
        .find(|(restart, _)| *restart == Restart::Spent)
        .map_or(0.0, |(_, chance)| *chance);
    assert!((spent - miss).abs() < 1e-12, "{spent} {miss}");
}

#[test]
fn hunting_from_initial_spins_waits_only_for_what_is_left() {
    let spec = normalize(&with_relief_drive("遊タイム")).expect("normalises");
    let balls = analyze(&spec, &FROM_SPEC)
        .expect("solves")
        .balls_per_round
        .value();
    let after = (1.0 - 0.99_f64.powi(100)) * 10.0;
    let reach = 0.99_f64.powi(40);
    let spins_by_hand = (1.0 - reach) / 0.01;
    let rounds_by_hand = (1.0 - reach) * 10.0 + reach * after;
    let found = hyena_hunt(&spec, &FROM_SPEC, 60, play()).expect("solves");
    assert!(close(found.relief_drive_probability, reach));
    assert!(close(found.spins, spins_by_hand));
    assert!(close(found.rounds, rounds_by_hand));
    assert!(close(
        found.yen,
        rounds_by_hand * balls * 4.0 - spins_by_hand * 50.0
    ));
    let at = hyena_hunt(&spec, &FROM_SPEC, 100, play()).expect("solves");
    assert!(close(at.relief_drive_probability, 1.0));
    assert!(close(at.spins, 0.0));
    assert!(close(at.rounds, after));
}

#[test]
fn hunting_past_the_relief_drive_finds_it_spent_and_waits_for_a_jackpot_alone() {
    let spec = normalize(&with_relief_drive("遊タイム")).expect("normalises");
    let analysis = analyze(&spec, &FROM_SPEC).expect("solves");
    let past = hyena_hunt(&spec, &FROM_SPEC, 150, play()).expect("solves");
    assert!(close(past.relief_drive_probability, 0.0));
    assert!(close(past.spins, 100.0));
    assert!(close(past.rounds, analysis.average_rounds));
    let fresh = hyena_hunt(&spec, &FROM_SPEC, 0, play()).expect("solves");
    assert!(past.yen < fresh.yen);
}

#[test]
fn without_a_relief_drive_hyena_hunting_is_a_first_jackpot_from_anywhere() {
    let spec = normalize(&made_up()).expect("normalises");
    let analysis = analyze(&spec, &FROM_SPEC).expect("solves");
    let found = hyena_hunt(&spec, &FROM_SPEC, 500, play()).expect("solves");
    assert!(close(found.spins, 100.0));
    assert!(close(found.rounds, analysis.average_rounds));
    assert!(close(found.relief_drive_probability, 0.0));
}
