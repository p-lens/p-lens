use std::collections::BTreeMap;

use crate::session::SessionResult;

/// Width of one bar of the result histogram, in yen.
pub const HISTOGRAM_BUCKET_YEN: f64 = 10_000.0;

/// Sessions summed so far. Accumulated one session at a time in a fixed
/// order, so stopping and resuming between sessions changes nothing.
///
/// The fields are open so a run in progress can be carried across a boundary
/// and resumed; they stay consistent only when built up through `with`.
#[derive(Clone, Debug, PartialEq, Default)]
pub struct Aggregate {
    pub sessions: u64,
    pub mean: f64,
    /// Sum of squared distances from the mean (Welford), for the spread.
    pub m2: f64,
    pub min_yen: Option<f64>,
    pub max_yen: Option<f64>,
    pub wins: u64,
    pub first_hits: u64,
    pub rounds: u64,
    pub hits: u64,
    pub truncated_combos: u64,
    /// Sessions per bucket, keyed by the bucket's lower edge over its width.
    pub histogram: BTreeMap<i64, u64>,
}

#[allow(clippy::cast_possible_truncation)]
fn bucket_of(yen: f64) -> i64 {
    (yen / HISTOGRAM_BUCKET_YEN).floor() as i64
}

impl Aggregate {
    /// The tally with one more session. Takes the tally rather than copying
    /// it, so a run of millions does not copy its histogram millions of times.
    #[must_use]
    pub fn with(self, session: &SessionResult) -> Self {
        let sessions = self.sessions + 1;
        #[allow(clippy::cast_precision_loss)]
        let mean = self.mean + (session.yen - self.mean) / sessions as f64;
        let mut histogram = self.histogram;
        *histogram.entry(bucket_of(session.yen)).or_insert(0) += 1;
        Self {
            sessions,
            mean,
            m2: self.m2 + (session.yen - self.mean) * (session.yen - mean),
            min_yen: Some(self.min_yen.map_or(session.yen, |min| min.min(session.yen))),
            max_yen: Some(self.max_yen.map_or(session.yen, |max| max.max(session.yen))),
            wins: self.wins + u64::from(session.yen > 0.0),
            first_hits: self.first_hits + session.first_hits,
            rounds: self.rounds + session.combos.rounds,
            hits: self.hits + session.combos.hits,
            truncated_combos: self.truncated_combos + session.truncated_combos,
            histogram,
        }
    }

    pub fn mean_yen(&self) -> Option<f64> {
        (self.sessions > 0).then_some(self.mean)
    }

    /// The sample standard deviation; needs two sessions.
    pub fn standard_deviation(&self) -> Option<f64> {
        #[allow(clippy::cast_precision_loss)]
        (self.sessions > 1).then(|| (self.m2 / (self.sessions - 1) as f64).sqrt())
    }

    pub fn win_rate(&self) -> Option<f64> {
        #[allow(clippy::cast_precision_loss)]
        (self.sessions > 0).then(|| self.wins as f64 / self.sessions as f64)
    }

    /// Rounds per first jackpot, for checking against the analytical figure.
    pub fn rounds_per_first_hit(&self) -> Option<f64> {
        #[allow(clippy::cast_precision_loss)]
        (self.first_hits > 0).then(|| self.rounds as f64 / self.first_hits as f64)
    }

    /// Jackpots per first jackpot: the sampled 平均連チャン.
    pub fn average_combo(&self) -> Option<f64> {
        #[allow(clippy::cast_precision_loss)]
        (self.first_hits > 0).then(|| self.hits as f64 / self.first_hits as f64)
    }
}
