#![allow(clippy::expect_used)]

mod support;

use pachinko_domain::quantity::SpinCount;
use pachinko_domain::spec::{Component, Next, ReliefDrive};
use pachinko_engine::error::{Location, ProbabilityProblem, SpecError, Unsupported};
use pachinko_engine::normalize::{STATE_LIMIT, normalize};
use support::*;

fn rush(allotment: Vec<pachinko_domain::spec::Allotment>) -> TestMode {
    mode("RUSH", rushing(80), allotment, Next::Regular)
}

#[test]
fn an_allotment_must_come_to_exactly_100_percent() {
    let spec = machine(
        one_in(100),
        vec![share(5000, 10, Next::Regular), share(4000, 10, to("RUSH"))],
        vec![rush(vec![share(10_000, 10, to("RUSH"))])],
    );
    assert_eq!(
        normalize(&spec),
        Err(SpecError::InvalidDistribution {
            at: Location::Regular,
            sum: 9000
        })
    );
}

#[test]
fn a_share_of_nothing_is_refused_even_when_the_rest_sum_right() {
    let spec = machine(
        one_in(100),
        vec![share(10_000, 10, to("RUSH")), share(0, 10, Next::Regular)],
        vec![rush(vec![share(10_000, 10, to("RUSH"))])],
    );
    assert_eq!(
        normalize(&spec),
        Err(SpecError::InvalidDistribution {
            at: Location::Regular,
            sum: 10_000
        })
    );
}

#[test]
fn a_mode_named_nowhere_is_unknown() {
    let spec = machine(one_in(100), vec![share(10_000, 10, to("LT"))], vec![]);
    assert_eq!(
        normalize(&spec),
        Err(SpecError::UnknownMode {
            at: Location::Regular,
            mode: id("LT")
        })
    );
}

#[test]
fn two_modes_of_one_name_are_refused() {
    let spec = machine(
        one_in(100),
        vec![share(10_000, 10, to("RUSH"))],
        vec![
            rush(vec![share(10_000, 10, to("RUSH"))]),
            rush(vec![share(10_000, 10, to("RUSH"))]),
        ],
    );
    assert_eq!(
        normalize(&spec),
        Err(SpecError::DuplicateMode { mode: id("RUSH") })
    );
}

#[test]
fn a_mode_nothing_leads_to_is_unreachable() {
    let spec = machine(
        one_in(100),
        vec![share(10_000, 10, Next::Regular)],
        vec![rush(vec![share(10_000, 10, to("RUSH"))])],
    );
    assert_eq!(
        normalize(&spec),
        Err(SpecError::UnreachableState { mode: id("RUSH") })
    );
}

#[test]
fn a_loop_that_never_returns_to_regular_has_no_theoretical_value() {
    let endless = mode(
        "確変",
        Kind::UntilHit,
        vec![share(10_000, 10, to("確変"))],
        Next::Regular,
    );
    let spec = machine(
        one_in(100),
        vec![share(10_000, 10, to("確変"))],
        vec![endless],
    );
    assert_eq!(
        normalize(&spec),
        Err(SpecError::NonAbsorbingModel { mode: id("確変") })
    );
}

#[test]
fn a_regular_game_that_never_hits_is_a_mistake() {
    let spec = machine(percent(0), vec![share(10_000, 10, Next::Regular)], vec![]);
    assert_eq!(
        normalize(&spec),
        Err(SpecError::InvalidProbability {
            at: Location::Regular,
            problem: ProbabilityProblem::Zero
        })
    );
}

#[test]
fn a_lucky_trigger_cannot_lead_to_its_own_mode() {
    let spec = machine(
        one_in(100),
        vec![share(10_000, 10, to("RUSH"))],
        vec![triggering(
            rush(vec![share(10_000, 10, to("RUSH"))]),
            3,
            "RUSH",
        )],
    );
    assert_eq!(
        normalize(&spec),
        Err(SpecError::UnsupportedSpec {
            reason: Unsupported::LuckyTriggerToItself
        })
    );
}

#[test]
fn a_lucky_trigger_cannot_be_the_jackpot_that_entered_the_mode() {
    let lt = mode(
        "LT",
        rushing(50),
        vec![share(10_000, 10, to("LT"))],
        Next::Regular,
    );
    let spec = machine(
        one_in(100),
        vec![share(10_000, 10, to("RUSH"))],
        vec![
            triggering(rush(vec![share(10_000, 10, to("RUSH"))]), 1, "LT"),
            lt,
        ],
    );
    assert_eq!(
        normalize(&spec),
        Err(SpecError::UnsupportedSpec {
            reason: Unsupported::LuckyTriggerOnEntry
        })
    );
}

#[test]
fn a_spec_too_large_to_expand_is_declined() {
    let lt = mode(
        "LT",
        rushing(50),
        vec![share(10_000, 10, to("LT"))],
        Next::Regular,
    );
    let spec = machine(
        one_in(100),
        vec![share(10_000, 10, to("RUSH"))],
        vec![
            triggering(rush(vec![share(10_000, 10, to("RUSH"))]), 301, "LT"),
            lt,
        ],
    );
    assert_eq!(
        normalize(&spec),
        Err(SpecError::UnsupportedSpec {
            reason: Unsupported::TooManyStates {
                states: 301,
                limit: STATE_LIMIT
            }
        })
    );
}

#[test]
fn a_valid_spec_normalises_into_states_that_each_sum_to_one() {
    let normalized = normalize(&made_up()).expect("the made-up machine normalises");
    let entry: f64 = normalized
        .entry
        .iter()
        .map(|outcome| outcome.probability.value())
        .sum();
    assert!(close(entry, 1.0));
    assert!(normalized.states.iter().all(|state| {
        close(
            state
                .outcomes
                .iter()
                .map(|outcome| outcome.probability.value())
                .sum(),
            1.0,
        )
    }));
    assert_eq!(normalized.net_balls_per_round, 140);
}

#[test]
fn a_world_needs_exactly_one_regular_game() {
    let mut none = made_up();
    none.components.regular_game.clear();
    assert_eq!(normalize(&none), Err(SpecError::NoRegularGame));
    let mut two = made_up();
    let game = *two
        .components
        .regular_game
        .values()
        .next()
        .expect("a regular game");
    two.components.regular_game.insert(id("RUSH"), game);
    assert_eq!(normalize(&two), Err(SpecError::SeveralRegularGames));
}

#[test]
fn a_mode_is_refused_when_its_components_do_not_make_one() {
    let mut kindless = made_up();
    kindless.components.rushing.clear();
    assert_eq!(
        normalize(&kindless),
        Err(SpecError::MissingKind { entity: id("RUSH") })
    );
    let mut twice = made_up();
    twice.components.until_hit.insert(id("RUSH"));
    assert_eq!(
        normalize(&twice),
        Err(SpecError::ConflictingComponents {
            entity: id("RUSH"),
            first: Component::Rushing,
            second: Component::UntilHit,
        })
    );
    let mut aimless = made_up();
    aimless.components.on_miss.clear();
    assert_eq!(
        normalize(&aimless),
        Err(SpecError::MissingComponent {
            entity: id("RUSH"),
            component: Component::OnMiss,
        })
    );
}

#[test]
fn a_component_astray_is_refused_by_name() {
    let mut relief_drive_on_a_mode = made_up();
    relief_drive_on_a_mode.components.relief_drive.insert(
        id("RUSH"),
        ReliefDrive {
            gauge: SpinCount::new(nonzero(950)),
            to: id("RUSH"),
        },
    );
    assert_eq!(
        normalize(&relief_drive_on_a_mode),
        Err(SpecError::StrayComponent {
            entity: id("RUSH"),
            component: Component::ReliefDrive,
        })
    );
    let mut nobody = made_up();
    nobody.components.label.insert(id("LT"), "LT".to_owned());
    assert_eq!(
        normalize(&nobody),
        Err(SpecError::StrayComponent {
            entity: id("LT"),
            component: Component::Label,
        })
    );
}
