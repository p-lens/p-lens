//! Spec builders for the engine's tests: small, hand-checkable machines.
//! A builder given a bad literal is a mistake in the test, so it fails loudly.
#![allow(clippy::expect_used, clippy::missing_panics_doc, dead_code)]

use std::num::NonZeroU32;

use pachinko_domain::probability::{BasisPoints, Denominator, ProbabilitySource};
use pachinko_domain::quantity::{PayoutRule, RoundCount, SpinCount};
use pachinko_domain::spec::{
    Allotment, Components, LeftoverQueue, LuckyTrigger, ModeId, Next, OtherRounds, Rapid,
    RegularGame, RegularPlay, Resources, Rushing, Spec, SpecialTime,
};

pub fn nonzero(value: u32) -> NonZeroU32 {
    NonZeroU32::new(value).expect("test counts are not zero")
}

pub fn id(name: &str) -> ModeId {
    ModeId::new(name).expect("test mode names are not empty")
}

pub fn one_in(denominator: u32) -> ProbabilitySource {
    ProbabilitySource::Ratio {
        numerator: 1,
        denominator: Denominator::from_hundredths(nonzero(denominator * 100)),
    }
}

pub fn percent(points: u32) -> ProbabilitySource {
    ProbabilitySource::Percent(
        BasisPoints::new(points * 100).expect("test percentages are at most 100"),
    )
}

pub fn share(points: u32, rounds: u32, next: Next) -> Allotment {
    Allotment {
        share: BasisPoints::new(points).expect("test shares are at most 100%"),
        rounds: RoundCount::new(nonzero(rounds)),
        next,
        prize_balls: None,
        count: None,
        other_rounds: Vec::new(),
        jackpots: NonZeroU32::MIN,
    }
}

/// A share whose rounds open an attacker of its own prize.
pub fn share_paying(points: u32, rounds: u32, prize: u32, next: Next) -> Allotment {
    Allotment {
        prize_balls: Some(nonzero(prize)),
        ..share(points, rounds, next)
    }
}

/// Rounds of a jackpot through another attacker: its own prize and count.
pub fn other_rounds(rounds: u32, prize: u32, count: u32) -> OtherRounds {
    OtherRounds {
        rounds: RoundCount::new(nonzero(rounds)),
        prize_balls: Some(nonzero(prize)),
        count: Some(nonzero(count)),
    }
}

pub fn to(name: &str) -> Next {
    Next::Mode(id(name))
}

/// A mode's kind as a spec sheet gives it: the one kind component its entity has.
#[derive(Clone, Copy, Debug)]
pub enum Kind {
    SpecialTime(SpecialTime),
    Rapid(Rapid),
    LeftoverQueue(LeftoverQueue),
    Rushing(Rushing),
    UntilHit,
}

/// A mode as a test writes it, before it is spawned as an entity.
#[derive(Clone, Debug)]
pub struct TestMode {
    pub id: ModeId,
    pub label: String,
    pub kind: Kind,
    pub allotment: Vec<Allotment>,
    pub on_miss: Next,
    pub lucky_trigger: Option<LuckyTrigger>,
}

pub fn mode(name: &str, kind: Kind, allotment: Vec<Allotment>, on_miss: Next) -> TestMode {
    TestMode {
        id: id(name),
        label: name.to_owned(),
        kind,
        allotment,
        on_miss,
        lucky_trigger: None,
    }
}

pub fn triggering(mode: TestMode, at_combo: u32, target: &str) -> TestMode {
    TestMode {
        lucky_trigger: Some(LuckyTrigger {
            at_combo: nonzero(at_combo),
            to: id(target),
        }),
        ..mode
    }
}

pub fn special_time(count: u32, chance: ProbabilitySource) -> Kind {
    Kind::SpecialTime(SpecialTime {
        spins: SpinCount::new(nonzero(count)),
        chance,
    })
}

pub fn rapid(count: u32) -> Kind {
    Kind::Rapid(Rapid {
        spins: SpinCount::new(nonzero(count)),
    })
}

pub fn leftover_queue(draws: u32) -> Kind {
    Kind::LeftoverQueue(LeftoverQueue {
        draws: SpinCount::new(nonzero(draws)),
    })
}

pub fn rushing(points: u32) -> Kind {
    Kind::Rushing(Rushing {
        continuation_rate: percent(points),
    })
}

/// 15 balls a count, 10 counts: 140 balls gained per round.
pub fn payout() -> PayoutRule {
    PayoutRule {
        prize_balls: nonzero(15),
        count: nonzero(10),
    }
}

/// The world a regular game and its modes make: an entity `regular` with the
/// regular game's components, and an entity per mode with its own.
pub fn assemble(regular: &RegularPlay, modes: Vec<TestMode>) -> Spec {
    let regular_id = id("regular");
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
    let world = Spec {
        entities: vec![regular_id],
        components,
        resources: Resources { payout: payout() },
    };
    modes.into_iter().fold(world, spawn)
}

/// The world with one more mode: an entity, and each component the mode has.
pub fn spawn(mut world: Spec, mode: TestMode) -> Spec {
    let components = &mut world.components;
    components.label.insert(mode.id.clone(), mode.label);
    components.allotment.insert(mode.id.clone(), mode.allotment);
    components.on_miss.insert(mode.id.clone(), mode.on_miss);
    match mode.kind {
        Kind::SpecialTime(special) => {
            components.special_time.insert(mode.id.clone(), special);
        }
        Kind::Rapid(rapid) => {
            components.rapid.insert(mode.id.clone(), rapid);
        }
        Kind::LeftoverQueue(queue) => {
            components.leftover_queue.insert(mode.id.clone(), queue);
        }
        Kind::Rushing(rushing) => {
            components.rushing.insert(mode.id.clone(), rushing);
        }
        Kind::UntilHit => {
            components.until_hit.insert(mode.id.clone());
        }
    }
    if let Some(trigger) = mode.lucky_trigger {
        components.lucky_trigger.insert(mode.id.clone(), trigger);
    }
    world.entities.push(mode.id);
    world
}

pub fn machine(
    regular: ProbabilitySource,
    allotment: Vec<Allotment>,
    modes: Vec<TestMode>,
) -> Spec {
    assemble(
        &RegularPlay {
            chance: regular,
            allotment,
            relief_drive: None,
        },
        modes,
    )
}

/// The made-up machine of the design: 1/100; half the first jackpots 10R and done,
/// half 10R into a RUSH that continues 80% of the time with 10R each.
pub fn made_up() -> Spec {
    machine(
        one_in(100),
        vec![share(5000, 10, Next::Regular), share(5000, 10, to("RUSH"))],
        vec![mode(
            "RUSH",
            rushing(80),
            vec![share(10_000, 10, to("RUSH"))],
            Next::Regular,
        )],
    )
}

pub fn close(left: f64, right: f64) -> bool {
    (left - right).abs() < 1e-9 * right.abs().max(1.0)
}
