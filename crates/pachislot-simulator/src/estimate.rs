//! Each setting's payout rate estimated by sampling regular games. The exact
//! engine solves the same figure; this samples it, so a spec the engine
//! cannot solve can still be weighed, and one it can is checked by a second
//! route.

use std::num::NonZeroU64;

use pachislot_domain::setting_level::SettingLevel;

use crate::game::GameModel;
use crate::rng::{Rng, Seed};

/// One setting's games sampled so far.
///
/// The fields are open so a run in progress can be carried across a boundary
/// and resumed; they stay consistent only when built up through `with`.
#[derive(Clone, Debug, PartialEq)]
pub struct Tally {
    pub setting_level: SettingLevel,
    pub games: u64,
    /// Medals gained, summed over games, and their squares, for the margin.
    pub medals: f64,
    pub medals_squared: f64,
}

/// The normal quantile for a two-sided 95% interval.
const Z_95: f64 = 1.959_964;

impl Tally {
    fn empty(setting_level: SettingLevel) -> Self {
        Self {
            setting_level,
            games: 0,
            medals: 0.0,
            medals_squared: 0.0,
        }
    }

    #[must_use]
    fn with(&self, gain: f64) -> Self {
        Self {
            setting_level: self.setting_level,
            games: self.games + 1,
            medals: self.medals + gain,
            medals_squared: self.medals_squared + gain * gain,
        }
    }

    /// Medals a game gained on average.
    pub fn net_per_game(&self) -> Option<f64> {
        #[allow(clippy::cast_precision_loss)]
        (self.games > 0).then(|| self.medals / self.games as f64)
    }

    /// The 95% margin of the payout rate, `1 + net / bet`. Needs two games.
    pub fn payout_rate_margin(&self, bet: u32) -> Option<f64> {
        let mean = self.net_per_game()?;
        if self.games < 2 {
            return None;
        }
        #[allow(clippy::cast_precision_loss)]
        let games = self.games as f64;
        let variance = (self.medals_squared - games * mean * mean).max(0.0) / (games - 1.0);
        Some(Z_95 * (variance / games).sqrt() / f64::from(bet))
    }
}

/// An estimate part-way through: everything needed to resume it.
#[derive(Clone, Debug, PartialEq)]
pub struct Estimate {
    pub rng: Rng,
    pub tallies: Vec<Tally>,
}

impl Estimate {
    pub fn start(seed: Seed, models: &[GameModel]) -> Self {
        Self {
            rng: Rng::from_seed(seed),
            tallies: models
                .iter()
                .map(|model| Tally::empty(model.setting_level))
                .collect(),
        }
    }

    /// Games sampled across every setting.
    pub fn done(&self) -> u64 {
        self.tallies.iter().map(|tally| tally.games).sum()
    }
}

/// Sample up to `chunk` more games, never past `games_per_setting` for each
/// setting. Settings take turns a game at a time, so how the run is chunked
/// changes nothing.
pub fn advance_estimate(
    models: &[GameModel],
    games_per_setting_level: NonZeroU64,
    estimate: &Estimate,
    chunk: NonZeroU64,
) -> Estimate {
    let setting_levels = u64::try_from(models.len()).unwrap_or(u64::MAX);
    let total = games_per_setting_level.get().saturating_mul(setting_levels);
    let start = estimate.done();
    let games = chunk.get().min(total.saturating_sub(start));
    let mut tallies = estimate.tallies.clone();
    let rng = (start..start + games).fold(estimate.rng, |rng, done| {
        let turn = usize::try_from(done % setting_levels.max(1)).unwrap_or(0);
        match (models.get(turn), tallies.get_mut(turn)) {
            (Some(model), Some(tally)) => {
                let (gain, rng) = model.play(rng);
                *tally = tally.with(gain);
                rng
            }
            _ => rng,
        }
    });
    Estimate { rng, tallies }
}
