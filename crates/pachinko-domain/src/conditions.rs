use crate::quantity::Balls;

/// The conditions a formula adopts on top of a spec: what a round really
/// yields, and what the balls won on the 電サポ gain or lose besides. Two
/// formulas of the same machine can differ here as well as in the spec they
/// were built from.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CalculationConditions {
    pub round_payout: RoundPayout,
    pub support_gain: SupportGain,
}

/// 電サポ中の出玉増減: what the balls a jackpot gains are changed by when it
/// is won on the 電サポ, after the first jackpot — balls shot to the right
/// running out of the 電チュー, or caught besides — in basis points of
/// them: `-1000` is -10%. A first jackpot, and one won in a mode played
/// without the 電サポ, are never touched. A spec sheet's figures are the
/// machine's alone; this is the play's, as a parlor's cabinet gives it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SupportGain(i32);

impl SupportGain {
    pub const NONE: Self = Self(0);

    /// A gain above -100% and at most +100%.
    pub const fn new(basis_points: i32) -> Option<Self> {
        if -10_000 < basis_points && basis_points <= 10_000 {
            Some(Self(basis_points))
        } else {
            None
        }
    }

    pub fn basis_points(self) -> i32 {
        self.0
    }

    /// What a ball won on the 電サポ comes to: `0.9` at -10%.
    pub fn factor(self) -> f64 {
        1.0 + f64::from(self.0) / 10_000.0
    }
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
