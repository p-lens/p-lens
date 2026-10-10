use std::num::NonZeroU32;

/// Rounds of one jackpot. A jackpot of no rounds is not a jackpot.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct RoundCount(NonZeroU32);

impl RoundCount {
    pub fn new(rounds: NonZeroU32) -> Self {
        Self(rounds)
    }

    pub fn get(self) -> u32 {
        self.0.get()
    }
}

/// A number of spins with a limit that means something: an ST of zero spins
/// is no ST.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct SpinCount(NonZeroU32);

impl SpinCount {
    pub fn new(spins: NonZeroU32) -> Self {
        Self(spins)
    }

    pub fn get(self) -> NonZeroU32 {
        self.0
    }
}

/// How a round pays, as the spec sheet says: balls paid per ball that enters
/// the attacker, and how many enter before the round closes.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct PayoutRule {
    pub prize_balls: NonZeroU32,
    pub count: NonZeroU32,
}

impl PayoutRule {
    /// Balls paid out by one round.
    pub fn gross_per_round(self) -> u32 {
        self.prize_balls.get().saturating_mul(self.count.get())
    }

    /// Balls gained by one round: paid out, less the balls that went in to
    /// earn them.
    pub fn net_per_round(self) -> u32 {
        self.gross_per_round().saturating_sub(self.count.get())
    }

    /// The rule of another attacker: its own prize, its own count, each the
    /// machine's where it names none.
    #[must_use]
    pub fn paying(self, prize_balls: Option<NonZeroU32>, count: Option<NonZeroU32>) -> Self {
        Self {
            prize_balls: prize_balls.unwrap_or(self.prize_balls),
            count: count.unwrap_or(self.count),
        }
    }
}

/// A number of balls, possibly fractional because it is a mean over a combo or a
/// measured average. Finite and not negative.
#[derive(Clone, Copy, Debug, PartialEq, PartialOrd)]
pub struct Balls(f64);

impl Balls {
    pub fn new(value: f64) -> Option<Self> {
        (value.is_finite() && value >= 0.0).then_some(Self(value))
    }

    pub fn value(self) -> f64 {
        self.0
    }
}

impl From<u32> for Balls {
    fn from(value: u32) -> Self {
        Self(f64::from(value))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_round_nets_what_it_pays_less_what_went_in() {
        let rule = PayoutRule {
            prize_balls: NonZeroU32::MIN.saturating_add(14),
            count: NonZeroU32::MIN.saturating_add(9),
        };
        assert_eq!(rule.gross_per_round(), 150);
        assert_eq!(rule.net_per_round(), 140);
    }
}
