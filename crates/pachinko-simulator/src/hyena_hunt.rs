//! 遊タイム狙い, sampled: sitting down at a cabinet whose relief gauge already stands at
//! so many spins since its last jackpot, playing until a first jackpot — or
//! the 遊タイム — and its combo are over, and leaving. A gauge past the 遊タイム's
//! count is one already spent, which waits for a jackpot alone. Each trial is one such
//! sitting; the run gives the theoretical value with its margin, and the spread.

use std::num::NonZeroU64;

use pachinko_domain::conditions::PlayConditions;
use pachinko_domain::normalized::NormalizedSpec;

use crate::aggregate::Aggregate;
use crate::combo::{PayoutYield, ReliefGauge, WaitEnd, combo_following, wait_from};
use crate::rng::{Rng, Seed};
use crate::session::SessionResult;

/// How each sitting is played: from these initial spins, under these conditions, each
/// ball of the spec's payout yielding as `payout` says.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct HyenaHuntSetup {
    /// Regular-game spins since the cabinet's last jackpot, as its data counter
    /// shows on sitting down: played by whoever sat there before.
    pub initial_spins: u32,
    pub payout: PayoutYield,
    pub play: PlayConditions,
}

/// Sittings so far: their results summed as sessions are, with what only a
/// sitting has — how often the 遊タイム came, and the spins paid for.
///
/// The fields are open so a run in progress can be carried across a boundary
/// and resumed; they stay consistent only when built up through `with`.
#[derive(Clone, Debug, PartialEq, Default)]
pub struct HyenaHuntTally {
    pub aggregate: Aggregate,
    pub relief_drives: u64,
    pub spins: u64,
}

/// What one sitting came to.
#[derive(Clone, Copy, Debug, PartialEq)]
struct Sitting {
    result: SessionResult,
    spins: u64,
    relief_drive: bool,
}

#[allow(clippy::cast_precision_loss)]
fn real(value: u64) -> f64 {
    value as f64
}

impl HyenaHuntTally {
    #[must_use]
    fn with(self, sitting: &Sitting) -> Self {
        Self {
            aggregate: self.aggregate.with(&sitting.result),
            relief_drives: self.relief_drives + u64::from(sitting.relief_drive),
            spins: self.spins.saturating_add(sitting.spins),
        }
    }

    pub fn trials(&self) -> u64 {
        self.aggregate.sessions
    }

    /// The 95% margin of the mean result. Needs two sittings.
    pub fn margin_yen(&self) -> Option<f64> {
        self.aggregate
            .standard_deviation()
            .map(|deviation| Z_95 * deviation / real(self.trials()).sqrt())
    }

    /// The share of sittings that reached the 遊タイム.
    pub fn relief_drive_rate(&self) -> Option<f64> {
        (self.trials() > 0).then(|| real(self.relief_drives) / real(self.trials()))
    }

    /// Regular-game spins paid for, on average.
    pub fn mean_spins(&self) -> Option<f64> {
        (self.trials() > 0).then(|| real(self.spins) / real(self.trials()))
    }
}

/// The normal quantile for a two-sided 95% interval.
const Z_95: f64 = 1.959_964;

fn sit(spec: &NormalizedSpec, setup: &HyenaHuntSetup, rng: Rng) -> (Sitting, Rng) {
    let (wait, rng) = wait_from(
        spec,
        ReliefGauge {
            filled: u64::from(setup.initial_spins),
            spent: spec
                .relief_drive
                .is_some_and(|relief_drive| setup.initial_spins > relief_drive.gauge),
        },
        rng,
    );
    let (combo, rng) = combo_following(spec, wait.end, rng);
    let won = combo.gained(setup.payout) * setup.play.ball_value.value();
    let spent = real(wait.spins) * 1000.0 / setup.play.spin_performance.value();
    (
        Sitting {
            result: SessionResult {
                yen: won - spent,
                first_hits: u64::from(wait.end == WaitEnd::Jackpot),
                combos: combo,
                truncated_combos: u64::from(combo.truncated),
            },
            spins: wait.spins,
            relief_drive: wait.end == WaitEnd::ReliefDrive,
        },
        rng,
    )
}

/// A hyena hunt part-way through: everything needed to resume it, so a long run
/// can be done in chunks and come out exactly as one run would.
#[derive(Clone, Debug, PartialEq)]
pub struct HyenaHunt {
    pub rng: Rng,
    pub tally: HyenaHuntTally,
}

impl HyenaHunt {
    pub fn start(seed: Seed) -> Self {
        Self {
            rng: Rng::from_seed(seed),
            tally: HyenaHuntTally::default(),
        }
    }

    pub fn is_finished(&self, trials: NonZeroU64) -> bool {
        self.tally.trials() >= trials.get()
    }
}

/// Sample up to `chunk` more sittings, never past `trials` in all.
pub fn advance_hyena_hunt(
    spec: &NormalizedSpec,
    setup: &HyenaHuntSetup,
    trials: NonZeroU64,
    hyena_hunt: &HyenaHunt,
    chunk: NonZeroU64,
) -> HyenaHunt {
    let remaining = trials.get().saturating_sub(hyena_hunt.tally.trials());
    (0..chunk.get().min(remaining)).fold(hyena_hunt.clone(), |current, _| {
        let (sitting, rng) = sit(spec, setup, current.rng);
        HyenaHunt {
            rng,
            tally: current.tally.with(&sitting),
        }
    })
}
