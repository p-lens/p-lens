//! 遊タイム狙い, solved exactly: sitting down at a cabinet whose count already
//! stands at so many spins since its last jackpot, playing until a first
//! jackpot — or the 遊タイム — and its combo are over, and leaving.

use pachinko_domain::conditions::{CalculationConditions, PlayConditions};

use crate::analysis::{Analysis, analyze};
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
