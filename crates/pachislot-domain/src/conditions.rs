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
/// costs, how much of what is played was rented for cash and how much drawn
/// from savings at what fee, and how fast games go. These belong to the
/// player, not to the formula.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PlayConditions {
    medal_value: f64,
    rental_price: f64,
    cash_share: Probability,
    replay_share: Probability,
    replay_rate: f64,
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
                replay_share: Probability::NONE,
                replay_rate: 1.0,
                games_per_hour,
            })
    }

    /// The same terms with a share of what is played drawn from savings, each
    /// medal paid out taking `rate` medals off them — one where a replay takes
    /// no fee. `None` where the rate is below one or not finite, or where the
    /// cash and the savings come to more than all that is played.
    pub fn with_replay(self, share: Probability, rate: f64) -> Option<Self> {
        (rate.is_finite() && rate >= 1.0 && self.cash_share.value() + share.value() <= 1.0 + 1e-9)
            .then_some(Self {
                replay_share: share,
                replay_rate: rate,
                ..self
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

    /// The share of the medals played that were drawn from savings.
    pub fn replay_share(self) -> Probability {
        self.replay_share
    }

    /// Medals a replay takes off savings for each it pays out: one, or more
    /// where it takes a fee.
    pub fn replay_rate(self) -> f64 {
        self.replay_rate
    }

    pub fn games_per_hour(self) -> Option<f64> {
        self.games_per_hour
    }

    /// What a medal played costs beyond its value, in yen, on average: the
    /// rental spread on those rented for cash, and the replay fee on those
    /// drawn from savings. Played from medals in hand, a medal costs its value
    /// and nothing more.
    pub fn spread_per_medal(self) -> f64 {
        self.cash_share.value() * (self.rental_price - self.medal_value)
            + self.replay_share.value() * self.medal_value * (self.replay_rate - 1.0)
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

    #[test]
    fn a_replay_fee_costs_what_the_savings_it_took_beyond_the_payout_were_worth()
    -> Result<(), crate::probability::ProbabilityError> {
        let half = Probability::new(0.5)?;
        let fee = PlayConditions::new(20.0, 21.0, half, None)
            .and_then(|play| play.with_replay(half, 1.1));
        assert_eq!(
            fee.map(|play| (play.spread_per_medal() * 1000.0).round()),
            Some(1500.0)
        );
        assert!(
            PlayConditions::new(20.0, 21.0, half, None)
                .and_then(|play| play.with_replay(half, 0.9))
                .is_none()
        );
        let all = Probability::new(1.0)?;
        assert!(
            PlayConditions::new(20.0, 21.0, half, None)
                .and_then(|play| play.with_replay(all, 1.0))
                .is_none()
        );
        Ok(())
    }
}
