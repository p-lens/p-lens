use std::collections::BTreeMap;

/// Width of one bar of the result histogram, in yen.
pub const HISTOGRAM_BUCKET_YEN: f64 = 5_000.0;

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
    /// Sessions per bucket, keyed by the bucket's lower edge over its width.
    pub histogram: BTreeMap<i64, u64>,
}

#[allow(clippy::cast_possible_truncation)]
fn bucket_of(yen: f64) -> i64 {
    (yen / HISTOGRAM_BUCKET_YEN).floor() as i64
}

impl Aggregate {
    /// The tally with one more session's result in yen. Takes the tally
    /// rather than copying it, so a long run does not copy its histogram
    /// every session.
    #[must_use]
    pub fn with(self, yen: f64) -> Self {
        let sessions = self.sessions + 1;
        #[allow(clippy::cast_precision_loss)]
        let mean = self.mean + (yen - self.mean) / sessions as f64;
        let mut histogram = self.histogram;
        *histogram.entry(bucket_of(yen)).or_insert(0) += 1;
        Self {
            sessions,
            mean,
            m2: self.m2 + (yen - self.mean) * (yen - mean),
            min_yen: Some(self.min_yen.map_or(yen, |min| min.min(yen))),
            max_yen: Some(self.max_yen.map_or(yen, |max| max.max(yen))),
            wins: self.wins + u64::from(yen > 0.0),
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
}
