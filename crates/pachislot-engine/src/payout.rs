//! What an AT gains, under the 有利区間's cap. An AT's medals follow its
//! setting's law; an AT that would gain more than the headroom left — the
//! cap less what the 有利区間 already holds — gains the headroom and ends
//! there, completing the 有利区間. One that falls short leaves what it
//! gained held for the games the 有利区間 carries on after it, which an AT
//! won in them starts from.

use pachislot_domain::normalized::PayoutLaw;

/// Sets past which an AT's chance of carrying on is taken as gone.
const MOST_SETS: u32 = 100_000;

/// The medals an AT gains below a headroom, each with its chance; what is
/// left of one is the chance it reaches the headroom. Without a headroom,
/// every outcome a law has, down to where its chances run out.
pub fn below(law: &PayoutLaw, headroom: Option<f64>) -> Vec<(f64, f64)> {
    let fits = |medals: f64| headroom.is_none_or(|headroom| medals < headroom);
    match law {
        PayoutLaw::Fixed(medals) => [(medals.get(), 1.0)]
            .into_iter()
            .filter(|(medals, _)| fits(*medals))
            .collect(),
        PayoutLaw::Sets {
            first,
            set,
            continuation_rate,
        } => {
            let continuation_rate = continuation_rate.value();
            (0..MOST_SETS)
                .map(|sets| {
                    (
                        first.get() + f64::from(sets) * set.get(),
                        set_chance(continuation_rate, sets),
                    )
                })
                .take_while(|(medals, chance)| fits(*medals) && *chance > f64::MIN_POSITIVE)
                .collect()
        }
        PayoutLaw::Table(rows) => rows
            .iter()
            .map(|(medals, chance)| (medals.get(), chance.value()))
            .filter(|(medals, _)| fits(*medals))
            .collect(),
    }
}

/// The chance an AT paid in sets carries on to exactly `sets` past its first.
pub fn set_chance(continuation_rate: f64, sets: u32) -> f64 {
    continuation_rate.powi(i32::try_from(sets).unwrap_or(i32::MAX)) * (1.0 - continuation_rate)
}

/// What an AT comes to at a headroom: the medals it gains on average, and
/// the chance it reaches the headroom and completes the 有利区間.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Capped {
    pub gain: f64,
    pub completion: f64,
}

/// An AT's medals on average with no cap: in closed form for sets.
pub fn mean(law: &PayoutLaw) -> f64 {
    match law {
        PayoutLaw::Fixed(medals) => medals.get(),
        PayoutLaw::Sets {
            first,
            set,
            continuation_rate,
        } => {
            let continuation_rate = continuation_rate.value();
            first.get() + set.get() * continuation_rate / (1.0 - continuation_rate)
        }
        PayoutLaw::Table(rows) => rows
            .iter()
            .map(|(medals, chance)| medals.get() * chance.value())
            .sum(),
    }
}

/// An AT at a headroom, or with none where the machine has no cap.
pub fn capped(law: &PayoutLaw, headroom: Option<f64>) -> Capped {
    let Some(headroom) = headroom else {
        return Capped {
            gain: mean(law),
            completion: 0.0,
        };
    };
    let short = below(law, Some(headroom));
    let completion = (1.0 - short.iter().map(|(_, chance)| chance).sum::<f64>()).max(0.0);
    Capped {
        gain: short
            .iter()
            .map(|(medals, chance)| medals * chance)
            .sum::<f64>()
            + headroom * completion,
        completion,
    }
}

/// The headroom an AT has when won `since` regular games after one that
/// left `held` medals in a 有利区間 carrying on for `window` games: the cap
/// less what is held, the regular games' loss since taken off what is held;
/// the whole cap once the 有利区間 has ended. None without a cap.
pub fn headroom(
    cap: Option<f64>,
    held: Option<f64>,
    window: Option<u32>,
    since: u32,
    loss: f64,
) -> Option<f64> {
    let cap = cap?;
    let carried = held.filter(|_| window.is_some_and(|window| since < window));
    Some(carried.map_or(cap, |held| {
        (cap - (held - loss * f64::from(since)).max(0.0)).max(0.0)
    }))
}

/// What an AT comes to, on average over every AT play goes through: the
/// share of them that complete the 有利区間, and the medals one gains.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CapFigures {
    pub completion: f64,
    pub gain: f64,
}

/// Mass left in a 有利区間 below which it is taken as ended.
const SPENT: f64 = 1e-14;

/// Rounds at which a 有利区間 is taken as ended whatever mass is left.
const MOST_ROUNDS: u32 = 2_000;

/// What each AT held in a 有利区間 comes to, a 有利区間 at a time: it starts
/// with a fresh AT; each AT that falls short of the cap carries what it
/// gained on, and the next AT — won on the `g`th game after it at the
/// chance `arrivals[g − 1]`, within the window — starts from that, less the
/// regular games' loss; the 有利区間 ends at the cap, or when the window
/// passes with no AT. What is held is counted in whole medals, so a round
/// costs the cap times the window and the outcomes, never more.
pub fn cap_figures(
    law: &PayoutLaw,
    cap: Option<f64>,
    window: Option<u32>,
    arrivals: &[f64],
    loss: f64,
) -> CapFigures {
    let fresh = capped(law, cap);
    let (Some(cap), Some(_)) = (cap, window) else {
        return CapFigures {
            completion: fresh.completion,
            gain: fresh.gain,
        };
    };
    let outcomes = below(law, Some(cap));
    let first = landed(&outcomes, 0, 1.0, vec![0.0; whole(cap) + 1]);
    let (_, ats, completed, gained) = (0..MOST_ROUNDS)
        .try_fold(
            (first, 1.0_f64, fresh.completion, fresh.gain),
            |(held, ats, completed, gained), _| {
                if held.iter().sum::<f64>() < SPENT {
                    return Err((held, ats, completed, gained));
                }
                let next = round_of(&outcomes, cap, &held, arrivals, loss);
                Ok((
                    next.held,
                    ats + next.ats,
                    completed + next.completed,
                    gained + next.gained,
                ))
            },
        )
        .unwrap_or_else(|stopped| stopped);
    CapFigures {
        completion: completed / ats,
        gain: gained / ats,
    }
}

/// A count of medals, rounded to the whole medal and never below none.
#[allow(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "medals held are below the cap, far inside a usize"
)]
fn whole(medals: f64) -> usize {
    medals.max(0.0).round() as usize
}

/// One AT more in every 有利区間 still carrying on.
struct Round {
    held: Vec<f64>,
    ats: f64,
    completed: f64,
    gained: f64,
}

/// The mass of ATs won in the window, by the whole medals held when each is
/// won: what an AT left, less the regular games' loss since.
#[allow(
    clippy::cast_precision_loss,
    reason = "medals held are far below where a float loses whole numbers"
)]
fn arriving(held: &[f64], arrivals: &[f64], loss: f64) -> Vec<f64> {
    held.iter()
        .enumerate()
        .filter(|(_, mass)| **mass > 0.0)
        .fold(vec![0.0; held.len()], |mut arriving, (medals, mass)| {
            arrivals.iter().zip(0_u32..).for_each(|(arrival, since)| {
                let start = whole(medals as f64 - loss * f64::from(since));
                if let Some(slot) = arriving.get_mut(start) {
                    *slot += mass * arrival;
                }
            });
            arriving
        })
}

#[allow(
    clippy::cast_precision_loss,
    reason = "medals held are far below where a float loses whole numbers"
)]
fn round_of(outcomes: &[(f64, f64)], cap: f64, held: &[f64], arrivals: &[f64], loss: f64) -> Round {
    arriving(held, arrivals, loss)
        .into_iter()
        .enumerate()
        .filter(|(_, mass)| *mass > 0.0)
        .fold(
            Round {
                held: vec![0.0; held.len()],
                ats: 0.0,
                completed: 0.0,
                gained: 0.0,
            },
            |round, (start, mass)| {
                let headroom = (cap - start as f64).max(0.0);
                let short: Vec<(f64, f64)> = outcomes
                    .iter()
                    .copied()
                    .filter(|(medals, _)| *medals < headroom)
                    .collect();
                let completion =
                    (1.0 - short.iter().map(|(_, chance)| chance).sum::<f64>()).max(0.0);
                let gain = short
                    .iter()
                    .map(|(medals, chance)| medals * chance)
                    .sum::<f64>()
                    + headroom * completion;
                Round {
                    held: landed(&short, start, mass, round.held),
                    ats: round.ats + mass,
                    completed: round.completed + mass * completion,
                    gained: round.gained + mass * gain,
                }
            },
        )
}

/// What ATs short of the cap leave held, in whole medals, added to what is.
#[allow(
    clippy::cast_precision_loss,
    reason = "medals held are far below where a float loses whole numbers"
)]
fn landed(short: &[(f64, f64)], start: usize, mass: f64, held: Vec<f64>) -> Vec<f64> {
    short.iter().fold(held, |mut held, (medals, chance)| {
        if let Some(slot) = held.get_mut(whole(start as f64 + medals)) {
            *slot += mass * chance;
        }
        held
    })
}
