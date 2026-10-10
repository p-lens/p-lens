#![allow(clippy::expect_used)]

use std::num::{NonZeroU32, NonZeroU64};

use pachinko_domain::conditions::{
    BallValue, CalculationConditions, PlayConditions, RoundPayout, SpinPerformance,
};
use pachinko_domain::normalized::NormalizedSpec;
use pachinko_domain::probability::{BasisPoints, Denominator, ProbabilitySource};
use pachinko_domain::quantity::{PayoutRule, RoundCount, SpinCount};
use pachinko_domain::spec::{
    Allotment, Components, ModeId, Next, Rapid, RegularGame, RegularPlay, ReliefDrive, Resources,
    Rushing, Spec,
};
use pachinko_engine::analysis::analyze;
use pachinko_engine::hyena_hunt::hyena_hunt;
use pachinko_engine::normalize::normalize;
use pachinko_simulator::estimate::{Estimate, advance_estimate};
use pachinko_simulator::hyena_hunt::{HyenaHunt, HyenaHuntSetup, advance_hyena_hunt};
use pachinko_simulator::rng::Seed;
use pachinko_simulator::session::SessionSetup;
use pachinko_simulator::simulation::{Plan, Progress, advance};

fn nonzero(value: u32) -> NonZeroU32 {
    NonZeroU32::new(value).expect("not zero")
}

/// A mode's kind as these tests write it: the one kind component its entity has.
#[derive(Clone, Copy)]
enum Kind {
    Rapid(Rapid),
    Rushing(Rushing),
}

/// A mode as these tests write it, before it is spawned as an entity.
struct TestMode {
    id: ModeId,
    label: String,
    kind: Kind,
    allotment: Vec<Allotment>,
    on_miss: Next,
}

/// The world a regular game and its modes make, paying 15 balls a count of 10:
/// an entity `regular` with the regular game's components, and one per mode.
fn world(regular: &RegularPlay, modes: &[TestMode]) -> Spec {
    let regular_id = ModeId::new("regular").expect("a name");
    let mut components = Components::default();
    components.regular_game.insert(
        regular_id.clone(),
        RegularGame {
            chance: regular.chance,
        },
    );
    components
        .allotment
        .insert(regular_id.clone(), regular.allotment.clone());
    if let Some(relief_drive) = &regular.relief_drive {
        components
            .relief_drive
            .insert(regular_id.clone(), relief_drive.clone());
    }
    for mode in modes {
        components.label.insert(mode.id.clone(), mode.label.clone());
        components
            .allotment
            .insert(mode.id.clone(), mode.allotment.clone());
        components
            .on_miss
            .insert(mode.id.clone(), mode.on_miss.clone());
        match mode.kind {
            Kind::Rapid(rapid) => {
                components.rapid.insert(mode.id.clone(), rapid);
            }
            Kind::Rushing(rushing) => {
                components.rushing.insert(mode.id.clone(), rushing);
            }
        }
    }
    Spec {
        entities: std::iter::once(regular_id)
            .chain(modes.iter().map(|mode| mode.id.clone()))
            .collect(),
        components,
        resources: Resources {
            payout: PayoutRule {
                prize_balls: nonzero(15),
                count: nonzero(10),
            },
        },
    }
}

fn rush() -> ModeId {
    ModeId::new("RUSH").expect("a name")
}

fn allot(points: u32, next: Next) -> Allotment {
    Allotment {
        share: BasisPoints::new(points).expect("a share"),
        rounds: RoundCount::new(nonzero(10)),
        next,
        prize_balls: None,
        count: None,
        other_rounds: Vec::new(),
    }
}

/// The made-up machine of the design: 1/100, half into an 80% RUSH, 10R everywhere.
fn made_up() -> NormalizedSpec {
    let spec = world(
        &RegularPlay {
            chance: ProbabilitySource::Ratio {
                numerator: 1,
                denominator: Denominator::from_hundredths(nonzero(10_000)),
            },
            allotment: vec![allot(5000, Next::Regular), allot(5000, Next::Mode(rush()))],
            relief_drive: None,
        },
        &[TestMode {
            id: rush(),
            label: "RUSH".to_owned(),
            kind: Kind::Rushing(Rushing {
                continuation_rate: ProbabilitySource::Percent(BasisPoints::new(8000).expect("80%")),
            }),
            allotment: vec![allot(10_000, Next::Mode(rush()))],
            on_miss: Next::Regular,
        }],
    );
    normalize(&spec).expect("the made-up machine normalises")
}

fn plan(sessions: u64, spins: u32) -> Plan {
    Plan {
        sessions: NonZeroU64::new(sessions).expect("sessions"),
        setup: SessionSetup {
            spins: SpinCount::new(nonzero(spins)),
            payout_scale: 1.0,
            play: PlayConditions {
                spin_performance: SpinPerformance::new(18.0).expect("a rate"),
                ball_value: BallValue::new(4.0).expect("a value"),
            },
        },
    }
}

fn run(spec: &NormalizedSpec, plan: &Plan, seed: u64, chunk: u64) -> Progress {
    let chunk = NonZeroU64::new(chunk).expect("a chunk");
    std::iter::successors(Some(Progress::start(Seed(seed))), |progress| {
        (!progress.is_finished(plan)).then(|| advance(spec, plan, progress, chunk))
    })
    .last()
    .expect("at least the start")
}

#[test]
fn the_same_seed_and_input_come_out_the_same() {
    let spec = made_up();
    let plan = plan(200, 2_000);
    assert_eq!(run(&spec, &plan, 7, 200), run(&spec, &plan, 7, 200));
    assert_ne!(
        run(&spec, &plan, 7, 200).aggregate,
        run(&spec, &plan, 8, 200).aggregate
    );
}

#[test]
fn running_in_chunks_changes_nothing() {
    let spec = made_up();
    let plan = plan(250, 2_000);
    assert_eq!(run(&spec, &plan, 11, 250), run(&spec, &plan, 11, 7));
}

#[test]
fn a_run_stops_at_the_end_of_its_plan() {
    let spec = made_up();
    let plan = plan(10, 1_000);
    assert_eq!(run(&spec, &plan, 3, 4).done(), 10);
}

#[test]
fn chains_converge_on_the_analytical_engine() {
    let spec = made_up();
    let progress = run(&spec, &plan(2_000, 10_000), 2026, 500);
    let analysis = analyze(
        &spec,
        &CalculationConditions {
            round_payout: RoundPayout::FromSpec,
        },
    )
    .expect("solves");
    let rounds = progress
        .aggregate
        .rounds_per_first_hit()
        .expect("first jackpots happened");
    let hits = progress
        .aggregate
        .average_combo()
        .expect("first jackpots happened");
    assert!(
        (rounds - analysis.average_rounds).abs() / analysis.average_rounds < 0.02,
        "rounds {rounds}"
    );
    assert!(
        (hits - analysis.average_combo).abs() / analysis.average_combo < 0.02,
        "hits {hits}"
    );
    assert_eq!(progress.aggregate.truncated_combos, 0);
}

#[test]
fn the_mean_result_lies_within_five_standard_errors_of_the_theoretical_value() {
    let spec = made_up();
    let plan = plan(4_000, 3_000);
    let progress = run(&spec, &plan, 99, 1_000);
    let analysis = analyze(
        &spec,
        &CalculationConditions {
            round_payout: RoundPayout::FromSpec,
        },
    )
    .expect("solves");
    let conditions = plan.setup.play;
    let yen_per_spin =
        spec.hit_chance.value() * analysis.average_payout.value() * conditions.ball_value.value()
            - 1000.0 / conditions.spin_performance.value();
    let expected = yen_per_spin * 3_000.0;
    let mean = progress.aggregate.mean_yen().expect("sessions ran");
    let standard_error = progress
        .aggregate
        .standard_deviation()
        .expect("sessions ran")
        / 4_000_f64.sqrt();
    assert!(
        (mean - expected).abs() < 5.0 * standard_error,
        "mean {mean}, expected {expected}, se {standard_error}"
    );
}

fn estimate(spec: &NormalizedSpec, cycles: u64, seed: u64, chunk: u64) -> Estimate {
    let cycles = NonZeroU64::new(cycles).expect("cycles");
    let chunk = NonZeroU64::new(chunk).expect("a chunk");
    std::iter::successors(Some(Estimate::start(Seed(seed))), |current| {
        (!current.is_finished(cycles)).then(|| advance_estimate(spec, cycles, current, chunk))
    })
    .last()
    .expect("at least the start")
}

#[test]
fn an_estimate_in_chunks_is_the_estimate_in_one_go() {
    let spec = made_up();
    assert_eq!(
        estimate(&spec, 3_000, 5, 3_000),
        estimate(&spec, 3_000, 5, 13)
    );
    assert_eq!(estimate(&spec, 3_000, 5, 64).tally.cycles, 3_000);
}

#[test]
fn the_estimated_round_chance_holds_the_exact_one_within_its_margin() {
    let spec = made_up();
    let exact = analyze(
        &spec,
        &CalculationConditions {
            round_payout: RoundPayout::FromSpec,
        },
    )
    .expect("solves")
    .round_chance
    .value();
    let tally = estimate(&spec, 200_000, 2026, 10_000).tally;
    let one_in = tally.round_chance_one_in().expect("rounds were won");
    let margin = tally.round_chance_margin().expect("a margin");
    assert!(
        (one_in - exact).abs() <= 2.0 * margin,
        "{one_in} ± {margin} against {exact}"
    );
    assert!(margin / exact < 0.01, "margin {margin}");
}

/// The made-up machine with a 遊タイム: after 150 spins without a jackpot, a 時短 of
/// 50 spins at 1/100 whose jackpots go as a first jackpot's do.
fn with_relief_drive() -> NormalizedSpec {
    let relief_drive_mode = ModeId::new("遊タイム").expect("a name");
    let spec = world(
        &RegularPlay {
            chance: ProbabilitySource::Ratio {
                numerator: 1,
                denominator: Denominator::from_hundredths(nonzero(10_000)),
            },
            allotment: vec![allot(5000, Next::Regular), allot(5000, Next::Mode(rush()))],
            relief_drive: Some(ReliefDrive {
                gauge: SpinCount::new(nonzero(150)),
                to: relief_drive_mode.clone(),
            }),
        },
        &[
            TestMode {
                id: rush(),
                label: "RUSH".to_owned(),
                kind: Kind::Rushing(Rushing {
                    continuation_rate: ProbabilitySource::Percent(
                        BasisPoints::new(8000).expect("80%"),
                    ),
                }),
                allotment: vec![allot(10_000, Next::Mode(rush()))],
                on_miss: Next::Regular,
            },
            TestMode {
                id: relief_drive_mode,
                label: "遊タイム".to_owned(),
                kind: Kind::Rapid(Rapid {
                    spins: SpinCount::new(nonzero(50)),
                }),
                allotment: vec![allot(5000, Next::Regular), allot(5000, Next::Mode(rush()))],
                on_miss: Next::Regular,
            },
        ],
    );
    normalize(&spec).expect("the made-up machine with a relief drive normalises")
}

const FROM_SPEC: CalculationConditions = CalculationConditions {
    round_payout: RoundPayout::FromSpec,
};

fn hyena_hunting_play() -> PlayConditions {
    PlayConditions {
        spin_performance: SpinPerformance::new(18.0).expect("a rate"),
        ball_value: BallValue::new(4.0).expect("a value"),
    }
}

fn hyena_hunted(
    spec: &NormalizedSpec,
    initial_spins: u32,
    trials: u64,
    seed: u64,
    chunk: u64,
) -> HyenaHunt {
    let setup = HyenaHuntSetup {
        initial_spins,
        payout_scale: 1.0,
        play: hyena_hunting_play(),
    };
    let trials = NonZeroU64::new(trials).expect("trials");
    let chunk = NonZeroU64::new(chunk).expect("a chunk");
    std::iter::successors(Some(HyenaHunt::start(Seed(seed))), |current| {
        (!current.is_finished(trials))
            .then(|| advance_hyena_hunt(spec, &setup, trials, current, chunk))
    })
    .last()
    .expect("at least the start")
}

#[test]
fn with_a_relief_drive_the_estimate_holds_the_exact_round_chance_within_its_margin() {
    let spec = with_relief_drive();
    let exact = analyze(&spec, &FROM_SPEC)
        .expect("solves")
        .round_chance
        .value();
    let tally = estimate(&spec, 200_000, 88, 10_000).tally;
    let one_in = tally.round_chance_one_in().expect("rounds were won");
    let margin = tally.round_chance_margin().expect("a margin");
    assert!(
        (one_in - exact).abs() <= 2.0 * margin,
        "{one_in} ± {margin} against {exact}"
    );
}

#[test]
fn a_hyena_hunt_in_chunks_is_the_hyena_hunt_in_one_go() {
    let spec = with_relief_drive();
    assert_eq!(
        hyena_hunted(&spec, 120, 2_000, 9, 2_000),
        hyena_hunted(&spec, 120, 2_000, 9, 17)
    );
}

#[test]
fn a_hyena_hunt_holds_the_exact_theoretical_value_within_its_margin_from_any_initial_spins() {
    let spec = with_relief_drive();
    for initial_spins in [0, 100, 140, 200] {
        let exact =
            hyena_hunt(&spec, &FROM_SPEC, initial_spins, hyena_hunting_play()).expect("solves");
        let tally = hyena_hunted(&spec, initial_spins, 200_000, 8_888, 10_000).tally;
        let mean = tally.aggregate.mean_yen().expect("sittings");
        let margin = tally.margin_yen().expect("a margin");
        assert!(
            (mean - exact.yen).abs() <= 2.0 * margin,
            "from {initial_spins}: {mean} ± {margin} against {}",
            exact.yen
        );
        let rate = tally.relief_drive_rate().expect("sittings");
        assert!(
            (rate - exact.relief_drive_probability).abs() < 0.01,
            "from {initial_spins}: relief drive {rate} against {}",
            exact.relief_drive_probability
        );
        let spins = tally.mean_spins().expect("sittings");
        assert!(
            (spins - exact.spins).abs() / exact.spins.max(1.0) < 0.02,
            "from {initial_spins}: spins {spins} against {}",
            exact.spins
        );
    }
}

/// A machine where everything about the 遊タイム happens often: 1/100, half
/// the first jackpots into a 時短 of 30 spins at 1/100 filling the gauge, and a
/// 遊タイム after only 120 spins into a 時短 of 40, missed often and so spent.
fn hard_relief_drive() -> NormalizedSpec {
    let regular = || ProbabilitySource::Ratio {
        numerator: 1,
        denominator: Denominator::from_hundredths(nonzero(10_000)),
    };
    let rapid = |name: &str, spins: u32| TestMode {
        id: ModeId::new(name).expect("a name"),
        label: name.to_owned(),
        kind: Kind::Rapid(Rapid {
            spins: SpinCount::new(nonzero(spins)),
        }),
        allotment: vec![
            allot(5000, Next::Regular),
            allot(5000, Next::Mode(ModeId::new("時短").expect("a name"))),
        ],
        on_miss: Next::Regular,
    };
    let spec = world(
        &RegularPlay {
            chance: regular(),
            allotment: vec![
                allot(5000, Next::Regular),
                allot(5000, Next::Mode(ModeId::new("時短").expect("a name"))),
            ],
            relief_drive: Some(ReliefDrive {
                gauge: SpinCount::new(nonzero(120)),
                to: ModeId::new("遊タイム").expect("a name"),
            }),
        },
        &[rapid("時短", 30), rapid("遊タイム", 40)],
    );
    normalize(&spec).expect("the hard relief drive normalises")
}

#[test]
fn counted_time_shortening_and_a_spent_relief_drive_agree_between_sampling_and_the_exact_figure() {
    let spec = hard_relief_drive();
    let exact = analyze(&spec, &FROM_SPEC)
        .expect("solves")
        .round_chance
        .value();
    let tally = estimate(&spec, 1_000_000, 120, 50_000).tally;
    let one_in = tally.round_chance_one_in().expect("rounds were won");
    let margin = tally.round_chance_margin().expect("a margin");
    assert!(
        (one_in - exact).abs() <= 3.0 * margin,
        "{one_in} ± {margin} against {exact}"
    );
}
