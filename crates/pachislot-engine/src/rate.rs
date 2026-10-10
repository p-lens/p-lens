//! An AT machine's 機械割 and what its AT gains, each from the other.
//!
//! A cycle runs from one AT to the next: `games` regular games, each
//! losing the ベース's `loss` on a bet of `bet`, then an AT gaining `gain`
//! medals at `net` a game — so over `gain / net` games of its own, each
//! bet on like any other. Medals out over medals in is the 機械割:
//!
//! ```text
//!        bet · games − loss · games + bet · gain / net + gain
//! rate = ─────────────────────────────────────────────────────
//!                  bet · (games + gain / net)
//! ```
//!
//! Solved for the gain, it is what a published 機械割 implies:
//!
//! ```text
//!        games · (bet · (rate − 1) + loss)
//! gain = ─────────────────────────────────
//!           1 + bet · (1 − rate) / net
//! ```

/// The 純増 of an AT over all its medals, where shares of them are won at
/// another 純増 than its own: `others` as (net, share of the medals), the
/// rest won at `net`. A medal won at a net of `n` takes `1 / n` games, so
/// the AT's games a medal are each share over its net, summed, and the net
/// over all is one over that. None where the shares come to more than the
/// whole.
pub fn net_over_all(net: f64, others: &[(f64, f64)]) -> Option<f64> {
    let shared: f64 = others.iter().map(|&(_, share)| share).sum();
    let games_a_medal =
        (1.0 - shared) / net + others.iter().map(|&(net, share)| share / net).sum::<f64>();
    (shared <= 1.0 && games_a_medal.is_finite() && games_a_medal > 0.0).then(|| 1.0 / games_a_medal)
}

/// A cycle of an AT machine: the regular games from one AT to the next,
/// the medals each loses, the bet, and the medals a game of the AT gains.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RateCycle {
    pub games: f64,
    pub loss: f64,
    pub bet: f64,
    pub net: f64,
}

/// 機械割 as a ratio, from what an AT gains on average.
pub fn implied_rate(cycle: RateCycle, gain: f64) -> f64 {
    let at_games = gain / cycle.net;
    let staked = cycle.bet * (cycle.games + at_games);
    (staked - cycle.loss * cycle.games + gain) / staked
}

/// What an AT gains on average, from a 機械割 as a ratio; none where no AT
/// could bring it — below what the ベース alone gives, or so high that an
/// AT's own games would pay for themselves.
pub fn implied_gain(cycle: RateCycle, rate: f64) -> Option<f64> {
    let spread = 1.0 + cycle.bet * (1.0 - rate) / cycle.net;
    let gain = cycle.games * (cycle.bet * (rate - 1.0) + cycle.loss) / spread;
    (spread > 0.0 && gain.is_finite() && gain > 0.0).then_some(gain)
}
