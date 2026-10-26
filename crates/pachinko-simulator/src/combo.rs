use pachinko_domain::normalized::{NormalizedSpec, Outcome, PaidSpins, Target};
use pachinko_domain::probability::Probability;

use crate::rng::Rng;

/// What one combo of jackpots came to.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub struct ComboResult {
    pub rounds: u64,
    pub hits: u64,
    /// Balls the combo's rounds gained, as the spec's payout gives them.
    pub balls: u64,
    /// Of those, the balls gained by jackpots won on the 電サポ, which a
    /// formula's support gain changes (`PayoutYield`).
    pub supported_balls: u64,
    /// The combo was cut off at `COMBO_LIMIT` steps. A normalised spec ends
    /// with certainty, so this counts only freak runs, and is reported rather
    /// than hidden.
    pub truncated: bool,
    /// Spins filled toward the 遊タイム since the combo's last jackpot: the
    /// 時短s it ran out of on the way back to the regular game.
    pub carry: u64,
    /// Spins the combo played at the heso, paid for as regular spins are:
    /// a CZ or a 潜確 shot there, until its jackpot or its last spin.
    pub paid_spins: u64,
}

/// What a ball of the spec's payout yields under a formula's conditions:
/// `scale` for every round — one, unless a round's payout was measured —
/// and `support` besides for those won on the 電サポ, the support gain's
/// factor.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PayoutYield {
    pub scale: f64,
    pub support: f64,
}

impl PayoutYield {
    /// The spec's payout as it is: every ball one ball.
    pub const AS_SPECIFIED: Self = Self {
        scale: 1.0,
        support: 1.0,
    };
}

impl ComboResult {
    /// Balls the combo gained under a formula's conditions.
    #[allow(clippy::cast_precision_loss)]
    pub fn gained(&self, payout: PayoutYield) -> f64 {
        (self.balls as f64 + (payout.support - 1.0) * self.supported_balls as f64) * payout.scale
    }

    /// This combo's totals added to `self`'s, ending where `other` ended.
    #[must_use]
    pub fn and_then(&self, other: &Self) -> Self {
        Self {
            rounds: self.rounds + other.rounds,
            hits: self.hits + other.hits,
            balls: self.balls + other.balls,
            supported_balls: self.supported_balls + other.supported_balls,
            truncated: false,
            carry: other.carry,
            paid_spins: self.paid_spins + other.paid_spins,
        }
    }
}

/// Where regular play stands toward the 遊タイム: the spins filled since the
/// last jackpot, and whether the 遊タイム is spent until the next one.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub struct ReliefGauge {
    pub filled: u64,
    pub spent: bool,
}

/// Where regular play stands after a wait and its combo: counting on from the
/// combo's carry, or spent if the 遊タイム came and brought no jackpot.
pub fn gauge_after(end: WaitEnd, combo: &ComboResult) -> ReliefGauge {
    ReliefGauge {
        filled: combo.carry,
        spent: end == WaitEnd::ReliefDrive && combo.hits == 0,
    }
}

/// The most steps one combo is followed for.
pub const COMBO_LIMIT: u64 = 100_000;

/// One outcome, chosen by its probability. The last outcome takes whatever
/// rounding leaves over, so a draw never falls through.
fn pick(outcomes: &[Outcome], rng: Rng) -> (Option<&Outcome>, Rng) {
    let (draw, next) = rng.next_unit();
    let chosen = outcomes
        .iter()
        .scan(0.0, |cumulative, outcome| {
            *cumulative += outcome.probability.value();
            Some((*cumulative, outcome))
        })
        .find(|&(cumulative, _)| draw < cumulative)
        .map(|(_, outcome)| outcome)
        .or_else(|| outcomes.last());
    (chosen, next)
}

/// Spins of a game until it hits, drawn from the geometric distribution.
pub fn spins_until_hit(probability: Probability, rng: Rng) -> (u64, Rng) {
    let (draw, next) = rng.next_unit();
    let survival = 1.0 - draw;
    let spins = if probability.is_certain() {
        1.0
    } else {
        (survival.ln() / probability.complement().value().ln()).floor() + 1.0
    };
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    let whole = if spins.is_finite() && spins >= 1.0 {
        spins as u64
    } else {
        u64::MAX
    };
    (whole, next)
}

/// The spins a state shot at the heso played before it ended: every one of
/// them where it ran out, and where a jackpot or an early end stopped it, a
/// draw from the spins it could have stopped on, each as likely as reaching
/// it and stopping there makes it.
fn paid_spins_played(paid: PaidSpins, stopped: bool, rng: Rng) -> (u64, Rng) {
    let all = u64::from(paid.spins);
    if !stopped {
        return (all, rng);
    }
    let (draw, next) = rng.next_unit();
    let miss = paid.chance.complement().value();
    let reached = 1.0 - miss.powf(f64::from(paid.spins));
    let spins = if miss <= 0.0 {
        1.0
    } else {
        ((1.0 - draw * reached).ln() / miss.ln()).floor() + 1.0
    };
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    let whole = if spins.is_finite() && spins >= 1.0 {
        (spins as u64).min(all)
    } else {
        all
    };
    (whole, next)
}

/// A combo part-way through: where it goes next, and what it has won so far.
#[derive(Clone, Copy)]
struct Walk {
    next: Target,
    rng: Rng,
    result: ComboResult,
    steps: u64,
}

/// The combo one outcome further on, or nothing once it has ended.
fn step(spec: &NormalizedSpec, walk: &Walk) -> Option<Walk> {
    let Target::State(index) = walk.next else {
        return None;
    };
    if walk.steps >= COMBO_LIMIT {
        return Some(Walk {
            next: Target::End,
            result: ComboResult {
                truncated: true,
                ..walk.result
            },
            ..*walk
        });
    }
    let outcomes = spec
        .states
        .get(index.get())
        .map(|state| state.outcomes.as_slice())
        .unwrap_or_default();
    let state = spec.states.get(index.get());
    let supported = state.is_some_and(|state| state.supported);
    let paid = state.and_then(|state| state.paid);
    let (outcome, rng) = pick(outcomes, walk.rng);
    let (paid_spins, rng) = match (paid, outcome) {
        (Some(paid), Some(outcome)) => paid_spins_played(
            paid,
            outcome.reward.hits > 0 || outcome.fills.is_some(),
            rng,
        ),
        (Some(_) | None, _) => (0, rng),
    };
    let filled = match (state, outcome) {
        (Some(state), Some(outcome)) => u64::from(outcome.filling(state)),
        (None, _) | (Some(_), None) => 0,
    };
    Some(Walk {
        next: outcome.map_or(Target::End, |outcome| outcome.next),
        rng,
        result: outcome.map_or(walk.result, |outcome| ComboResult {
            rounds: walk.result.rounds + u64::from(outcome.reward.rounds),
            hits: walk.result.hits + u64::from(outcome.reward.hits),
            balls: walk.result.balls + u64::from(outcome.reward.balls),
            supported_balls: walk.result.supported_balls
                + if supported {
                    u64::from(outcome.reward.balls)
                } else {
                    0
                },
            truncated: false,
            carry: if outcome.reward.hits > 0 {
                0
            } else {
                walk.result.carry + filled
            },
            paid_spins: walk.result.paid_spins + paid_spins,
        }),
        steps: walk.steps + 1,
    })
}

fn walk_out(spec: &NormalizedSpec, start: Walk) -> (ComboResult, Rng) {
    let end = std::iter::successors(Some(start), |walk| step(spec, walk))
        .last()
        .unwrap_or(start);
    (end.result, end.rng)
}

/// Follow one combo from a first jackpot until play returns to the regular game.
pub fn run_combo(spec: &NormalizedSpec, rng: Rng) -> (ComboResult, Rng) {
    let (first, rng) = pick(&spec.entry, rng);
    walk_out(
        spec,
        Walk {
            next: first.map_or(Target::End, |outcome| outcome.next),
            rng,
            result: first.map_or(ComboResult::default(), |outcome| ComboResult {
                rounds: u64::from(outcome.reward.rounds),
                hits: u64::from(outcome.reward.hits),
                balls: u64::from(outcome.reward.balls),
                supported_balls: 0,
                truncated: false,
                carry: 0,
                paid_spins: 0,
            }),
            steps: 0,
        },
    )
}

/// How the wait in regular play ended: a jackpot, or the 遊タイム's gauge filling up.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WaitEnd {
    Jackpot,
    ReliefDrive,
}

/// The regular-game spins waited, and how the wait ended.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Wait {
    pub spins: u64,
    pub end: WaitEnd,
}

/// Regular play from where it stands toward the 遊タイム: the geometric wait,
/// cut short where the 遊タイム comes first, unless it is spent.
pub fn wait_from(spec: &NormalizedSpec, gauge: ReliefGauge, rng: Rng) -> (Wait, Rng) {
    let (gap, rng) = spins_until_hit(spec.hit_chance, rng);
    let left = spec
        .relief_drive
        .filter(|_| !gauge.spent)
        .map(|relief_drive| u64::from(relief_drive.gauge).saturating_sub(gauge.filled));
    let wait = match left {
        Some(left) if left < gap => Wait {
            spins: left,
            end: WaitEnd::ReliefDrive,
        },
        Some(_) | None => Wait {
            spins: gap,
            end: WaitEnd::Jackpot,
        },
    };
    (wait, rng)
}

/// The combo after a wait: a first jackpot's, or the mode the 遊タイム leads
/// to, entered with nothing won.
pub fn combo_following(spec: &NormalizedSpec, end: WaitEnd, rng: Rng) -> (ComboResult, Rng) {
    match (end, spec.relief_drive) {
        (WaitEnd::ReliefDrive, Some(relief_drive)) => walk_out(
            spec,
            Walk {
                next: relief_drive.target,
                rng,
                result: ComboResult::default(),
                steps: 0,
            },
        ),
        (WaitEnd::Jackpot | WaitEnd::ReliefDrive, _) => run_combo(spec, rng),
    }
}
