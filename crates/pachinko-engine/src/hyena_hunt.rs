//! 遊タイム狙い, solved exactly: sitting down at a cabinet whose count already
//! stands at so many spins since its last jackpot, playing until a first
//! jackpot — or the 遊タイム — and its combo are over, and leaving.

use std::collections::BTreeMap;

use pachinko_domain::conditions::{CalculationConditions, PlayConditions};

use crate::analysis::{Analysis, EarlyEndFigures, EarlyEndShareFigures, analyze};
use crate::error::SolveError;
use pachinko_domain::normalized::NormalizedSpec;

/// What sitting down at so many initial spins comes to, on average.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct HyenaHuntTheoreticalValue {
    /// Yen won, the balls exchanged at the ball value, less the cash spent.
    pub yen: f64,
    /// Spins paid for until the first jackpot or the 遊タイム and its combo
    /// are over: the regular game's, and those its combo plays at the heso.
    pub spins: f64,
    pub rounds: f64,
    /// The chance the count runs out before a jackpot.
    pub relief_drive_probability: f64,
}

/// Yen a play comes to: the balls its rounds gained, exchanged, less what its
/// spins paid for cost. Spins in a mode on the 電サポ cost nothing.
pub fn yen_of(balls: f64, spins: f64, play: PlayConditions) -> f64 {
    balls * play.ball_value.value() - spins * 1000.0 / play.spin_performance.value()
}

/// The theoretical value of sitting down at `initial_spins` since the last jackpot,
/// from a spec already analysed. Initial spins at the 遊タイム's count reach it
/// at once. Initial spins past it are a cabinet whose 遊タイム has come and
/// gone without a jackpot: it comes once between jackpots, so what is left is
/// the regular game alone, as on a machine that has none.
pub fn hyena_hunt_from(
    analysis: &Analysis,
    hit_chance: f64,
    initial_spins: u32,
    play: PlayConditions,
) -> HyenaHuntTheoreticalValue {
    if let Some(early_end) = &analysis.regular_early_end {
        let sitting = sitting_with_early_end(analysis, early_end, hit_chance, initial_spins);
        return HyenaHuntTheoreticalValue {
            yen: yen_of(sitting.balls, sitting.spins, play),
            spins: sitting.spins,
            rounds: sitting.rounds,
            relief_drive_probability: sitting.relief_drive,
        };
    }
    let ahead = analysis.relief_drive.as_ref().and_then(|relief_drive| {
        relief_drive
            .gauge
            .checked_sub(initial_spins)
            .map(|left| (relief_drive, left))
    });
    let entry_balls = analysis.average_payout.value();
    let (spins, rounds, balls, relief_drive_probability) = ahead.map_or(
        (
            1.0 / hit_chance + analysis.average_paid_spins,
            analysis.average_rounds,
            entry_balls,
            0.0,
        ),
        |(relief_drive, left)| {
            let reach = (1.0 - hit_chance).powf(f64::from(left));
            (
                (1.0 - reach) * (1.0 / hit_chance + analysis.average_paid_spins)
                    + reach * relief_drive.paid_spins_after,
                (1.0 - reach) * analysis.average_rounds + reach * relief_drive.rounds_after,
                (1.0 - reach) * entry_balls
                    + reach * relief_drive.balls_after * analysis.payout_scale,
                reach,
            )
        },
    );
    HyenaHuntTheoreticalValue {
        yen: yen_of(balls, spins, play),
        spins,
        rounds,
        relief_drive_probability,
    }
}

/// What a sitting comes to on average, until a jackpot or the 遊タイム.
#[derive(Clone, Copy, Debug, PartialEq)]
struct Sitting {
    spins: f64,
    rounds: f64,
    balls: f64,
    relief_drive: f64,
}

impl Sitting {
    const NOTHING: Self = Self {
        spins: 0.0,
        rounds: 0.0,
        balls: 0.0,
        relief_drive: 0.0,
    };

    #[must_use]
    fn plus(self, chance: f64, other: Self) -> Self {
        Self {
            spins: self.spins + chance * other.spins,
            rounds: self.rounds + chance * other.rounds,
            balls: self.balls + chance * other.balls,
            relief_drive: self.relief_drive + chance * other.relief_drive,
        }
    }
}

/// The spins of a wait gathered as one where a c時短 may cut it short.
const SITTING_STEP: u32 = 5;

/// A sitting on a regular game with a c時短: one that brings no jackpot brings
/// play back with the gauge further on, and the sitting goes on from there, so
/// each count's sitting is worked from those above it, the 遊タイム's first.
fn sitting_with_early_end(
    analysis: &Analysis,
    early_end: &EarlyEndFigures,
    hit_chance: f64,
    initial_spins: u32,
) -> Sitting {
    let either = hit_chance + (1.0 - hit_chance) * early_end.chance;
    let led_off = (1.0 - hit_chance) * early_end.chance / either;
    let jackpot = hit_chance / either;
    let scale = analysis.payout_scale;
    let first = Sitting {
        spins: analysis.average_paid_spins,
        rounds: analysis.average_rounds,
        balls: analysis.average_payout.value(),
        relief_drive: 0.0,
    };
    let won_from = |share: &EarlyEndShareFigures| Sitting {
        spins: share.yielded.paid_spins,
        rounds: share.yielded.rounds,
        balls: share.yielded.balls * scale,
        relief_drive: 0.0,
    };
    let reachable = analysis
        .relief_drive
        .as_ref()
        .filter(|relief_drive| initial_spins <= relief_drive.gauge);
    let Some(relief_drive) = reachable else {
        let once = early_end
            .shares
            .iter()
            .fold(Sitting::NOTHING.plus(jackpot, first), |sum, share| {
                sum.plus(led_off * share.share, won_from(share))
            });
        let again = 1.0
            - led_off
                * early_end
                    .shares
                    .iter()
                    .map(|share| share.share * share.misses)
                    .sum::<f64>();
        return Sitting {
            spins: (1.0 / either + once.spins) / again,
            rounds: once.rounds / again,
            balls: once.balls / again,
            relief_drive: 0.0,
        };
    };
    let gauge = relief_drive.gauge;
    let at_gauge = Sitting {
        spins: relief_drive.paid_spins_after,
        rounds: relief_drive.rounds_after,
        balls: relief_drive.balls_after * scale,
        relief_drive: 1.0,
    };
    let from = |filled: u32, above: &BTreeMap<u32, Sitting>| -> Sitting {
        let left = gauge.saturating_sub(filled);
        let neither = |spins: u32| (1.0 - either).powf(f64::from(spins));
        let reach = neither(left);
        let base = Sitting {
            spins: (1.0 - reach) / either,
            ..Sitting::NOTHING
        }
        .plus((1.0 - reach) * jackpot, first)
        .plus(reach, at_gauge);
        (0..left.div_ceil(SITTING_STEP)).fold(base, |sum, step| {
            let start = step * SITTING_STEP;
            let end = (start + SITTING_STEP).min(left);
            let chance = (neither(start) - neither(end)) * led_off;
            let middle = filled + start + (end - start).div_ceil(2);
            early_end.shares.iter().fold(sum, |sum, share| {
                #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
                let stands = (f64::from(middle) + share.fills).round() as u32;
                let back = stands.div_ceil(SITTING_STEP) * SITTING_STEP;
                let then = above.get(&back.min(gauge)).copied().unwrap_or(at_gauge);
                sum.plus(chance * share.share, won_from(share))
                    .plus(chance * share.share * share.misses, then)
            })
        })
    };
    let table = (1..=gauge / SITTING_STEP).rev().fold(
        BTreeMap::from([(gauge, at_gauge)]),
        |mut table, step| {
            let filled = step * SITTING_STEP;
            if filled < gauge {
                let sitting = from(filled, &table);
                table.insert(filled, sitting);
            }
            table
        },
    );
    if initial_spins == gauge {
        at_gauge
    } else {
        from(initial_spins, &table)
    }
}

/// The theoretical value of sitting down at `initial_spins` since the last jackpot.
///
/// # Errors
/// When the spec cannot be solved, as `analyze`.
pub fn hyena_hunt(
    spec: &NormalizedSpec,
    conditions: &CalculationConditions,
    initial_spins: u32,
    play: PlayConditions,
) -> Result<HyenaHuntTheoreticalValue, SolveError> {
    Ok(hyena_hunt_from(
        &analyze(spec, conditions)?,
        spec.hit_chance.value(),
        initial_spins,
        play,
    ))
}
