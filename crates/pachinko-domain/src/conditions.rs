use crate::quantity::Balls;

/// The conditions a formula adopts on top of a spec: what a round really
/// yields. Two formulas of the same machine can differ here as well as in the
/// spec they were built from.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CalculationConditions {
    pub round_payout: RoundPayout,
}

/// What one round yields.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum RoundPayout {
    /// The spec's payout rule: paid out, less what went in.
    FromSpec,
    /// A measured figure, for a cabinet that pays less than its sheet says.
    Measured(Balls),
}

/// The conditions of one person's play: how many spins ¥1,000 buys at this
/// cabinet, and what a ball exchanges for.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PlayConditions {
    pub spin_performance: SpinPerformance,
    pub ball_value: BallValue,
}

/// Spins per ¥1,000. Positive and finite.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SpinPerformance(f64);

impl SpinPerformance {
    pub fn new(value: f64) -> Option<Self> {
        (value.is_finite() && value > 0.0).then_some(Self(value))
    }

    pub fn value(self) -> f64 {
        self.0
    }
}

/// Yen a ball exchanges for: `4.0` at an equal rate, `3.57` at 28 balls.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct BallValue(f64);

impl BallValue {
    pub fn new(value: f64) -> Option<Self> {
        (value.is_finite() && value > 0.0).then_some(Self(value))
    }

    pub fn value(self) -> f64 {
        self.0
    }
}
