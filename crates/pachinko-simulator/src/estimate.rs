//! A formula's figure estimated by sampling, one cycle at a time: regular play
//! until its first jackpot or its 遊タイム, and the combo that follows. The exact engine
//! solves the same figure; this samples it, so a spec the engine cannot
//! solve can still be weighed, and one it can is checked by a second route.

use std::num::NonZeroU64;

use pachinko_domain::normalized::NormalizedSpec;

use crate::combo::{ReliefGauge, combo_following, gauge_after, wait_from};
use crate::rng::{Rng, Seed};

/// Cycles sampled so far. Accumulated one cycle at a time in a fixed order,
/// so stopping and resuming between cycles changes nothing.
///
/// The fields are open so a run in progress can be carried across a boundary
/// and resumed; they stay consistent only when built up through `with`.
#[derive(Clone, Debug, PartialEq, Default)]
pub struct Tally {
    pub cycles: u64,
    /// Regular-game spins, summed over cycles.
    pub spins: u64,
    pub rounds: u64,
    pub truncated_combos: u64,
    /// Second moments of the per-cycle spins and rounds, for the margin.
    pub spins_squared: f64,
    pub rounds_squared: f64,
    pub spins_rounds: f64,
}

/// What one cycle came to.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Cycle {
    spins: u64,
    rounds: u64,
    truncated: bool,
}

#[allow(clippy::cast_precision_loss)]
fn real(value: u64) -> f64 {
    value as f64
}

impl Tally {
    #[must_use]
    fn with(&self, cycle: Cycle) -> Self {
        let (spins, rounds) = (real(cycle.spins), real(cycle.rounds));
        Self {
            cycles: self.cycles + 1,
            spins: self.spins.saturating_add(cycle.spins),
            rounds: self.rounds.saturating_add(cycle.rounds),
            truncated_combos: self.truncated_combos + u64::from(cycle.truncated),
            spins_squared: self.spins_squared + spins * spins,
            rounds_squared: self.rounds_squared + rounds * rounds,
            spins_rounds: self.spins_rounds + spins * rounds,
        }
    }

    /// Rounds won per regular-game spin, the reciprocal of 1Rトータル確率.
    pub fn rounds_per_spin(&self) -> Option<f64> {
        (self.spins > 0 && self.rounds > 0).then(|| real(self.rounds) / real(self.spins))
    }

    /// 1Rトータル確率 as "one in".
    pub fn round_chance_one_in(&self) -> Option<f64> {
        self.rounds_per_spin().map(|rate| 1.0 / rate)
    }

    /// Rounds per first jackpot, for checking against the analytical figure.
    pub fn rounds_per_cycle(&self) -> Option<f64> {
        (self.cycles > 0).then(|| real(self.rounds) / real(self.cycles))
    }

    /// The 95% margin of 1Rトータル確率's "one in": the ratio estimator's
    /// standard error by the delta method, carried through the reciprocal.
    /// Needs two cycles.
    pub fn round_chance_margin(&self) -> Option<f64> {
        let rate = self.rounds_per_spin()?;
        if self.cycles < 2 {
            return None;
        }
        let cycles = real(self.cycles);
        let mean_spins = real(self.spins) / cycles;
        let residual =
            self.rounds_squared - 2.0 * rate * self.spins_rounds + rate * rate * self.spins_squared;
        let variance = residual.max(0.0) / ((cycles - 1.0) * cycles * mean_spins * mean_spins);
        Some(Z_95 * variance.sqrt() / (rate * rate))
    }
}

/// The normal quantile for a two-sided 95% interval.
const Z_95: f64 = 1.959_964;

/// One cycle from where regular play stands: spins until the first jackpot or
/// the 遊タイム, the combo after, and where regular play stands then.
fn sample_cycle(spec: &NormalizedSpec, gauge: ReliefGauge, rng: Rng) -> (Cycle, ReliefGauge, Rng) {
    let (wait, rng) = wait_from(spec, gauge, rng);
    let (combo, rng) = combo_following(spec, wait.end, rng);
    (
        Cycle {
            spins: wait.spins,
            rounds: combo.rounds,
            truncated: combo.truncated,
        },
        gauge_after(wait.end, &combo),
        rng,
    )
}

/// An estimate part-way through: everything needed to resume it, so a long
/// run can be done in chunks and come out exactly as one run would.
#[derive(Clone, Debug, PartialEq)]
pub struct Estimate {
    pub rng: Rng,
    pub tally: Tally,
    /// Where regular play stands toward the 遊タイム between cycles: cycles
    /// follow on from one another, as play does.
    pub gauge: ReliefGauge,
}

impl Estimate {
    pub fn start(seed: Seed) -> Self {
        Self {
            rng: Rng::from_seed(seed),
            tally: Tally::default(),
            gauge: ReliefGauge::default(),
        }
    }

    pub fn is_finished(&self, cycles: NonZeroU64) -> bool {
        self.tally.cycles >= cycles.get()
    }
}

/// Sample up to `chunk` more cycles, never past `cycles` in all.
pub fn advance_estimate(
    spec: &NormalizedSpec,
    cycles: NonZeroU64,
    estimate: &Estimate,
    chunk: NonZeroU64,
) -> Estimate {
    let remaining = cycles.get().saturating_sub(estimate.tally.cycles);
    (0..chunk.get().min(remaining)).fold(estimate.clone(), |current, _| {
        let (cycle, gauge, rng) = sample_cycle(spec, current.gauge, current.rng);
        Estimate {
            rng,
            tally: current.tally.with(cycle),
            gauge,
        }
    })
}

#[cfg(test)]
mod tests {
    #![allow(clippy::expect_used, clippy::float_cmp)]

    use super::*;

    #[test]
    fn a_tally_reads_rounds_per_spin_and_needs_two_cycles_for_a_margin() {
        let one = Tally::default().with(Cycle {
            spins: 100,
            rounds: 10,
            truncated: false,
        });
        assert_eq!(one.round_chance_one_in(), Some(10.0));
        assert_eq!(one.round_chance_margin(), None);
        let two = one.with(Cycle {
            spins: 300,
            rounds: 10,
            truncated: true,
        });
        assert_eq!(two.round_chance_one_in(), Some(20.0));
        assert_eq!(two.rounds_per_cycle(), Some(10.0));
        assert_eq!(two.truncated_combos, 1);
        assert!(two.round_chance_margin().expect("a margin") > 0.0);
    }

    #[test]
    fn nothing_won_has_no_figure() {
        let dry = Tally::default().with(Cycle {
            spins: 100,
            rounds: 0,
            truncated: false,
        });
        assert_eq!(dry.round_chance_one_in(), None);
    }
}
