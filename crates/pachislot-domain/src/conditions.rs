use crate::probability::Probability;
use crate::setting_level::PerSettingLevel;

/// A payout rate in hundredths of a percent: `105.5%` is `10550`. Above 100%
/// is the point, so this is not a probability.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct PayoutRate(u32);

impl PayoutRate {
    pub fn from_basis_points(points: u32) -> Option<Self> {
        (points > 0).then_some(Self(points))
    }

    pub fn basis_points(self) -> u32 {
        self.0
    }

    /// As a ratio: `105.5%` is `1.055`.
    pub fn ratio(self) -> f64 {
        f64::from(self.0) / 10_000.0
    }
}

/// How a formula comes to each setting's payout rate. Part of the formula,
/// not of the play.
#[derive(Clone, Debug, PartialEq)]
pub enum PayoutBasis {
    /// Worked out from what every outcome pays.
    FromSpec,
    /// As measured or published, which is how a rate that depends on how the
    /// reels are stopped is given.
    Measured(PerSettingLevel<PayoutRate>),
}

/// The terms a play is weighed on: what a medal is worth, what renting one
/// costs, how much of what is played was rented for cash, and how fast games
/// go. These belong to the player, not to the formula.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PlayConditions {
    medal_value: f64,
    rental_price: f64,
    cash_share: Probability,
    games_per_hour: Option<f64>,
}

impl PlayConditions {
    /// `None` when a price or a pace is not a positive finite number.
    pub fn new(
        medal_value: f64,
        rental_price: f64,
        cash_share: Probability,
        games_per_hour: Option<f64>,
    ) -> Option<Self> {
        let positive = |value: f64| value.is_finite() && value > 0.0;
        (positive(medal_value) && positive(rental_price) && games_per_hour.is_none_or(positive))
            .then_some(Self {
                medal_value,
                rental_price,
                cash_share,
                games_per_hour,
            })
    }

    /// Yen a medal is exchanged for.
    pub fn medal_value(self) -> f64 {
        self.medal_value
    }

    /// Yen renting a medal costs.
    pub fn rental_price(self) -> f64 {
        self.rental_price
    }

    /// The share of the medals played that were rented for cash rather than
    /// played from medals in hand or savings.
    pub fn cash_share(self) -> Probability {
        self.cash_share
    }

    pub fn games_per_hour(self) -> Option<f64> {
        self.games_per_hour
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_rate_reads_as_a_ratio() {
        assert_eq!(
            PayoutRate::from_basis_points(10_550).map(PayoutRate::ratio),
            Some(1.055)
        );
        assert_eq!(PayoutRate::from_basis_points(0), None);
    }

    #[test]
    fn prices_and_pace_must_be_positive() -> Result<(), crate::probability::ProbabilityError> {
        let all = Probability::new(1.0)?;
        assert!(PlayConditions::new(20.0, 20.0, all, Some(800.0)).is_some());
        assert!(PlayConditions::new(0.0, 20.0, all, None).is_none());
        assert!(PlayConditions::new(20.0, 20.0, all, Some(-1.0)).is_none());
        Ok(())
    }
}
