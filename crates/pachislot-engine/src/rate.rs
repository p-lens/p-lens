//! An AT machine's 機械割 and what its AT gains, each from the other.
//!
//! A cycle runs from one AT to the next: `games` regular games, each
//! losing the ベース's `loss` on a bet of `bet`, then an AT gaining `gain`
//! medals at `net` a game — so over `gain / net` games of its own, each
//! bet on like any other. Where the trigger is a bonus, each of the
//! `triggers` a cycle brings gains `bonus` medals over `own` games of its
//! own, bet on too; a side bonus is more of the same, its count and its
//! medals added to them. Medals out over medals in is the 機械割:
//!
//! ```text
//!        bet · in − loss · games + gain + triggers · bonus
//! rate = ─────────────────────────────────────────────────,
//!                           bet · in
//!
//! in = games + triggers · own + gain / net
//! ```
//!
//! Solved for the gain, it is what a published 機械割 implies:
//!
//! ```text
//!        bet · (rate − 1) · (games + triggers · own) + loss · games − triggers · bonus
//! gain = ─────────────────────────────────────────────────────────────────────────────
//!                                 1 + bet · (1 − rate) / net
//! ```

use pachislot_domain::normalized::TriggerPayout;

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
/// the medals each loses, the bet, the medals a game of the AT gains, and
/// the bonuses that are its triggers, where they pay.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RateCycle {
    pub games: f64,
    pub loss: f64,
    pub bet: f64,
    pub net: f64,
    pub triggers: Option<TriggersPaid>,
    /// The triggers the AT間天井 brings, where each pays a bonus of its own
    /// rather than the trigger's: none where they pay as any other, counted
    /// among `triggers`.
    pub ceiling: Option<TriggersPaid>,
    /// The side bonuses a cycle brings, and what each pays, where the
    /// machine has one.
    pub side: Option<TriggersPaid>,
}

/// The triggers a cycle brings, and what each pays where it is a bonus.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TriggersPaid {
    pub count: f64,
    pub payout: TriggerPayout,
}

impl RateCycle {
    /// What the cycle's triggers gain, and the games of their own they
    /// take — those its AT間天井 brings and its side bonuses' added where
    /// it has them.
    fn paid(self) -> (f64, f64) {
        let each = |paid: TriggersPaid| {
            (
                paid.count * paid.payout.medals.get(),
                paid.count * paid.payout.games(),
            )
        };
        [self.triggers, self.ceiling, self.side]
            .into_iter()
            .flatten()
            .map(each)
            .fold((0.0, 0.0), |(medals, games), (more, longer)| {
                (medals + more, games + longer)
            })
    }
}

/// 機械割 as a ratio, from what an AT gains on average.
pub fn implied_rate(cycle: RateCycle, gain: f64) -> f64 {
    let (bonus, own) = cycle.paid();
    let staked = cycle.bet * (cycle.games + own + gain / cycle.net);
    (staked - cycle.loss * cycle.games + gain + bonus) / staked
}

/// What an AT gains on average, from a 機械割 as a ratio; none where no AT
/// could bring it — below what the ベース and the bonuses alone give, or so
/// high that an AT's own games would pay for themselves.
pub fn implied_gain(cycle: RateCycle, rate: f64) -> Option<f64> {
    let (bonus, own) = cycle.paid();
    let spread = 1.0 + cycle.bet * (1.0 - rate) / cycle.net;
    let gain = (cycle.bet * (rate - 1.0) * (cycle.games + own) + cycle.loss * cycle.games - bonus)
        / spread;
    (spread > 0.0 && gain.is_finite() && gain > 0.0).then_some(gain)
}
