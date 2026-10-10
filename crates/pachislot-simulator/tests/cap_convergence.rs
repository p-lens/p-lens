//! The 有利区間 sampled AT by AT, held to the exact figures: the share of
//! ATs that reach the cap and the medals one gains, each within five
//! standard errors of what the engine works out.

#![allow(clippy::expect_used, clippy::indexing_slicing)]

use pachislot_domain::normalized::PayoutLaw;
use pachislot_domain::probability::Probability;
use pachislot_domain::spec::Medals;
use pachislot_engine::payout::cap_figures;
use pachislot_simulator::rng::{Rng, Seed};

const CAP: f64 = 2_400.0;
const LOSS: f64 = 2.0;
const ARRIVALS: [f64; 3] = [0.3, 0.2, 0.25];
const ZONES: u32 = 200_000;

fn medals(value: f64) -> Medals {
    Medals::new(value).expect("medals")
}

/// The sets an AT carries on to past its first.
fn sets(rng: Rng, continuation_rate: f64) -> (u32, Rng) {
    (0_u32..)
        .try_fold(rng, |rng, sets| {
            let (unit, rng) = rng.next_unit();
            if unit < continuation_rate {
                Ok(rng)
            } else {
                Err((sets, rng))
            }
        })
        .expect_err("an AT ends")
}

/// The game of the window the next AT is won on, if one is.
fn arrival(rng: Rng) -> (Option<u32>, Rng) {
    let (unit, rng) = rng.next_unit();
    let found = ARRIVALS
        .iter()
        .scan(0.0, |reached, chance| {
            *reached += chance;
            Some(*reached)
        })
        .zip(0_u32..)
        .find(|(reached, _)| unit < *reached)
        .map(|(_, since)| since);
    (found, rng)
}

/// ATs, completions, medals and squared medals over a 有利区間.
fn zone(rng: Rng) -> ((f64, f64, f64, f64), Rng) {
    let step = |(start, tally, rng): (f64, (f64, f64, f64, f64), Rng)| {
        let (carried, rng) = sets(rng, 0.8);
        let paid = 300.0 + 100.0 * f64::from(carried);
        let headroom = CAP - start;
        let (ats, done, gained, squared) = tally;
        if paid >= headroom {
            return Err((
                (
                    ats + 1.0,
                    done + 1.0,
                    gained + headroom,
                    squared + headroom * headroom,
                ),
                rng,
            ));
        }
        let tally = (ats + 1.0, done, gained + paid, squared + paid * paid);
        let (next, rng) = arrival(rng);
        next.map_or(Err((tally, rng)), |since| {
            Ok((
                (start + paid - LOSS * f64::from(since)).max(0.0),
                tally,
                rng,
            ))
        })
    };
    std::iter::successors(
        Some(Ok((0.0, (0.0, 0.0, 0.0, 0.0), rng))),
        |state| match state {
            Ok(state) => Some(step(*state)),
            Err(_) => None,
        },
    )
    .last()
    .and_then(Result::err)
    .expect("a 有利区間 ends")
}

#[test]
fn the_exact_cap_figures_meet_a_sampled_有利区間() {
    let law = PayoutLaw::Sets {
        first: medals(300.0),
        set: medals(100.0),
        continuation_rate: Probability::new(0.8).expect("a continuation rate"),
    };
    let exact = cap_figures(&law, Some(CAP), Some(3), &ARRIVALS, LOSS);
    let ((ats, done, gained, squared), _) = (0..ZONES).fold(
        ((0.0, 0.0, 0.0, 0.0), Rng::from_seed(Seed(7))),
        |(sum, rng), _| {
            let (one, rng) = zone(rng);
            (
                (sum.0 + one.0, sum.1 + one.1, sum.2 + one.2, sum.3 + one.3),
                rng,
            )
        },
    );
    let completion = done / ats;
    let gain = gained / ats;
    let completion_error = (completion * (1.0 - completion) / ats).sqrt();
    let gain_error = ((squared / ats - gain * gain) / ats).sqrt();
    assert!((completion - exact.completion).abs() < 5.0 * completion_error);
    assert!((gain - exact.gain).abs() < 5.0 * gain_error);
}
