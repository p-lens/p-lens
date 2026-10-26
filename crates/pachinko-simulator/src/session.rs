use pachinko_domain::conditions::PlayConditions;
use pachinko_domain::normalized::NormalizedSpec;
use pachinko_domain::quantity::SpinCount;

use crate::combo::{
    ComboResult, PayoutYield, ReliefGauge, WaitEnd, combo_following, gauge_after, wait_from,
};
use crate::rng::Rng;

/// How one session is played: so many spins paid for — the regular game's,
/// and those a combo plays at the heso — under these conditions, each ball
/// of the spec's payout yielding as `payout` says.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SessionSetup {
    pub spins: SpinCount,
    pub payout: PayoutYield,
    pub play: PlayConditions,
}

/// What one session came to.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SessionResult {
    /// Balls won, exchanged, less the cash the spins cost.
    pub yen: f64,
    pub first_hits: u64,
    pub combos: ComboResult,
    pub truncated_combos: u64,
}

/// A session part-way through: spins left, and what has come of it so far;
/// `overrun` is the spins a combo played at the heso past the last of them,
/// paid for all the same.
#[derive(Clone, Copy)]
struct Played {
    spins_left: u64,
    overrun: u64,
    first_hits: u64,
    combos: ComboResult,
    truncated_combos: u64,
    gauge: ReliefGauge,
    rng: Rng,
    finished: bool,
}

fn next_hit(spec: &NormalizedSpec, played: &Played) -> Option<Played> {
    if played.finished {
        return None;
    }
    let (wait, rng) = wait_from(spec, played.gauge, played.rng);
    if wait.spins > played.spins_left {
        return Some(Played {
            finished: true,
            rng,
            ..*played
        });
    }
    let (combo, rng) = combo_following(spec, wait.end, rng);
    let left = played.spins_left - wait.spins;
    Some(Played {
        spins_left: left.saturating_sub(combo.paid_spins),
        overrun: played.overrun + combo.paid_spins.saturating_sub(left),
        first_hits: played.first_hits + u64::from(wait.end == WaitEnd::Jackpot),
        combos: played.combos.and_then(&combo),
        gauge: gauge_after(wait.end, &combo),
        truncated_combos: played.truncated_combos + u64::from(combo.truncated),
        rng,
        finished: false,
    })
}

/// Play one session: each first jackpot found by drawing the spins until it,
/// each combo followed to its end.
pub fn play_session(spec: &NormalizedSpec, setup: &SessionSetup, rng: Rng) -> (SessionResult, Rng) {
    let spins = u64::from(setup.spins.get().get());
    let start = Played {
        spins_left: spins,
        overrun: 0,
        first_hits: 0,
        combos: ComboResult::default(),
        truncated_combos: 0,
        gauge: ReliefGauge::default(),
        rng,
        finished: false,
    };
    let end = std::iter::successors(Some(start), |played| next_hit(spec, played))
        .last()
        .unwrap_or(start);
    let won = end.combos.gained(setup.payout) * setup.play.ball_value.value();
    #[allow(clippy::cast_precision_loss)]
    let spent = (spins + end.overrun) as f64 * 1000.0 / setup.play.spin_performance.value();
    (
        SessionResult {
            yen: won - spent,
            first_hits: end.first_hits,
            combos: end.combos,
            truncated_combos: end.truncated_combos,
        },
        end.rng,
    )
}
