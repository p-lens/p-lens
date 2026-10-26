use std::collections::BTreeSet;

use pachinko_domain::conditions::{CalculationConditions, RoundPayout};
use pachinko_domain::normalized::{NormalizedSpec, PaidSpins, StateIndex, StateOrigin};
use pachinko_domain::quantity::Balls;
use pachinko_domain::spec::ModeId;
use pachinko_domain::version::SchemaVersion;

use crate::error::SolveError;
use crate::relief_drive::{EndingFigures, RestartFigures, Yield, long_run};
use crate::solve::{at, expected_totals, from_entry, reach_probabilities};

/// Which engine produced a result. Bumped whenever the same input could
/// come out differently, so a stored result says what it was computed by.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct EngineVersion(u32);

impl EngineVersion {
    /// 2: the 遊タイム comes once between jackpots, and a 時短's spins count toward it.
    /// 3: a leftover queue's draws fill the relief gauge too.
    /// 4: a share of an allotment may pay its rounds by a prize of its own, and
    ///    a count past the 遊タイム finds it spent.
    /// 5: the balls a jackpot won on the 電サポ gains are changed by a formula's
    ///    support gain.
    /// 6: a mode played without the 電サポ whose spins run out is shot at the
    ///    heso, and its spins are paid for as the regular game's are.
    pub const CURRENT: Self = Self(6);

    pub fn get(self) -> u32 {
        self.0
    }
}

/// A rate given as "one in": `1/33.3` is `OneIn(33.3)`. Positive and finite.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct OneIn(f64);

impl OneIn {
    fn of(per_spin: f64) -> Option<Self> {
        let one_in = 1.0 / per_spin;
        (one_in.is_finite() && one_in > 0.0).then_some(Self(one_in))
    }

    pub fn value(self) -> f64 {
        self.0
    }
}

/// The chance a first jackpot leads into a mode at some point of its combo.
#[derive(Clone, Debug, PartialEq)]
pub struct ModeEntry {
    pub mode: ModeId,
    pub probability: f64,
}

/// What each state of the combo contributes, so a result can be traced back
/// to the conditions it came from.
#[derive(Clone, Debug, PartialEq)]
pub struct StateDerivation {
    pub origin: StateOrigin,
    pub average_rounds: f64,
    pub average_combo: f64,
    /// Balls the state's rounds gain from there on, as the spec's payout
    /// gives them and the support gain changes those won on the 電サポ.
    pub average_balls: f64,
    /// Spins played at the heso from there on, paid for as regular spins.
    pub average_paid_spins: f64,
}

/// What a 遊タイム adds: how often the count runs out from nothing before a
/// jackpot, what the mode it leads to yields, and over the long run each way
/// regular play starts again — with spins filled, or with the 遊タイム spent.
#[derive(Clone, Debug, PartialEq)]
pub struct ReliefDriveFigures {
    pub gauge: u32,
    /// The chance regular play reaches the 遊タイム before a jackpot, counting from nothing.
    pub reach_probability: f64,
    pub rounds_after: f64,
    pub combo_after: f64,
    /// Balls the mode it leads to gains, as the spec's payout gives them and
    /// the support gain changes those won on the 電サポ.
    pub balls_after: f64,
    /// Spins the mode it leads to plays at the heso, paid for.
    pub paid_spins_after: f64,
    pub restarts: Vec<RestartFigures>,
    /// From every point of a combo, the chance of each way of starting again:
    /// what the long run was worked out from, given so it can be checked.
    pub endings: Vec<EndingFigures>,
}

/// Everything solved from a normalised spec, exact rather than sampled.
#[derive(Clone, Debug, PartialEq)]
pub struct Analysis {
    pub engine_version: EngineVersion,
    pub schema_version: SchemaVersion,
    /// Rounds won per first jackpot, its whole combo included.
    pub average_rounds: f64,
    /// Jackpots per first jackpot, itself included: the 平均連チャン.
    pub average_combo: f64,
    /// Balls a round gains on average over the long run: every round's gain
    /// over every round, so a machine whose jackpots pay a round differently
    /// has one figure, weighed by how often each comes.
    pub balls_per_round: Balls,
    /// Balls gained per first jackpot, its whole combo included.
    pub average_payout: Balls,
    /// What a ball of the spec's payout really yields: one, unless a round's
    /// payout was measured, and then the measured round over the spec's.
    pub payout_scale: f64,
    /// Spins a first jackpot's combo plays at the heso on average — a CZ
    /// or a 潜確 shot there — paid for as regular spins are.
    pub average_paid_spins: f64,
    /// Jackpots per spin paid for, combos included: the トータル確率. A spin
    /// paid for is a regular game's, or one a mode plays at the heso.
    pub total_chance: OneIn,
    /// Rounds per spin paid for: the 1R トータル確率.
    pub round_chance: OneIn,
    pub mode_entry: Vec<ModeEntry>,
    pub derivation: Vec<StateDerivation>,
    pub relief_drive: Option<ReliefDriveFigures>,
}

/// One cycle of play from a jackpot to the next jackpot or the 遊タイム: its
/// spins paid for — the regular game's and those its combos play at the
/// heso — and the rounds and jackpots that follow, on average.
#[derive(Clone, Copy, Debug, PartialEq)]
struct Cycle {
    spins: f64,
    rounds: f64,
    hits: f64,
    balls: f64,
}

/// A cycle on average. Without a 遊タイム it is a geometric wait and a first
/// jackpot's combo; with one, each way of starting again weighs in as often
/// as it comes.
fn cycle(p: f64, entry: Yield, relief_drive: Option<&ReliefDriveFigures>) -> Cycle {
    relief_drive.map_or(
        Cycle {
            spins: 1.0 / p + entry.paid_spins,
            rounds: entry.rounds,
            hits: entry.hits,
            balls: entry.balls,
        },
        |relief_drive| {
            relief_drive.restarts.iter().fold(
                Cycle {
                    spins: 0.0,
                    rounds: 0.0,
                    hits: 0.0,
                    balls: 0.0,
                },
                |sum, restart| Cycle {
                    spins: sum.spins + restart.weight * (restart.spins + restart.paid_spins),
                    rounds: sum.rounds + restart.weight * restart.rounds,
                    hits: sum.hits + restart.weight * restart.hits,
                    balls: sum.balls + restart.weight * restart.balls,
                },
            )
        },
    )
}

/// Every mode named by the states, each once, in the order they appear.
fn modes_of(spec: &NormalizedSpec) -> Vec<ModeId> {
    spec.origins.iter().fold(Vec::new(), |mut seen, origin| {
        if !seen.contains(&origin.mode) {
            seen.push(origin.mode.clone());
        }
        seen
    })
}

fn states_of(spec: &NormalizedSpec, mode: &ModeId) -> BTreeSet<StateIndex> {
    spec.origins
        .iter()
        .enumerate()
        .filter(|(_, origin)| origin.mode == *mode)
        .map(|(index, _)| StateIndex::new(index))
        .collect()
}

fn mode_entry(spec: &NormalizedSpec, mode: ModeId) -> Result<ModeEntry, SolveError> {
    let reach = reach_probabilities(spec, &states_of(spec, &mode))?;
    Ok(ModeEntry {
        probability: from_entry(spec, &reach, |_| 0.0),
        mode,
    })
}

/// What a ball of the spec's payout really yields under a formula's
/// conditions. A measured round is set against the machine's own payout
/// rule, and every share is scaled alike: a cabinet that pays short pays
/// short through each of its attackers.
fn payout_scale(spec: &NormalizedSpec, conditions: &CalculationConditions) -> f64 {
    match conditions.round_payout {
        RoundPayout::Measured(balls) if spec.net_balls_per_round > 0 => {
            balls.value() / f64::from(spec.net_balls_per_round)
        }
        RoundPayout::FromSpec | RoundPayout::Measured(_) => 1.0,
    }
}

/// Solve a normalised spec under a formula's conditions: the exact figures a
/// formula is made of. What they are worth under someone's play — a border,
/// a theoretical value — is worked out from these figures, outside the engine, the
/// same way whether they came from here or were typed in.
///
/// # Errors
/// When the spec has outcomes leading nowhere or states that never end —
/// neither of which a spec from `normalize` can have.
pub fn analyze(
    spec: &NormalizedSpec,
    conditions: &CalculationConditions,
) -> Result<Analysis, SolveError> {
    let support = conditions.support_gain.factor();
    let rounds = expected_totals(spec, |_, reward| f64::from(reward.rounds))?;
    let hits = expected_totals(spec, |_, reward| f64::from(reward.hits))?;
    let paid = expected_totals(spec, |state, _| state.paid.map_or(0.0, PaidSpins::expected))?;
    let balls = expected_totals(spec, |state, reward| {
        f64::from(reward.balls) * if state.supported { support } else { 1.0 }
    })?;
    let average_rounds = from_entry(spec, &rounds, |outcome| f64::from(outcome.reward.rounds));
    let average_combo = from_entry(spec, &hits, |outcome| f64::from(outcome.reward.hits));
    let entry = Yield {
        rounds: average_rounds,
        hits: average_combo,
        balls: from_entry(spec, &balls, |outcome| f64::from(outcome.reward.balls)),
        paid_spins: from_entry(spec, &paid, |_| 0.0),
    };
    let scale = payout_scale(spec, conditions);
    let average_payout = Balls::new(entry.balls * scale).ok_or(SolveError::Singular)?;
    let p = spec.hit_chance.value();
    let relief_drive = spec
        .relief_drive
        .map(|relief_drive| -> Result<ReliefDriveFigures, SolveError> {
            let rounds_after = at(&rounds, relief_drive.target);
            let combo_after = at(&hits, relief_drive.target);
            let balls_after = at(&balls, relief_drive.target);
            let paid_after = at(&paid, relief_drive.target);
            let run = long_run(
                spec,
                relief_drive,
                entry,
                Yield {
                    rounds: rounds_after,
                    hits: combo_after,
                    balls: balls_after,
                    paid_spins: paid_after,
                },
            )?;
            Ok(ReliefDriveFigures {
                gauge: relief_drive.gauge,
                reach_probability: spec
                    .hit_chance
                    .complement()
                    .value()
                    .powf(f64::from(relief_drive.gauge)),
                rounds_after,
                combo_after,
                balls_after,
                paid_spins_after: paid_after,
                restarts: run.restarts,
                endings: run.endings,
            })
        })
        .transpose()?;
    let per_cycle = cycle(p, entry, relief_drive.as_ref());
    let per_round =
        Balls::new(per_cycle.balls * scale / per_cycle.rounds).ok_or(SolveError::Singular)?;
    Ok(Analysis {
        engine_version: EngineVersion::CURRENT,
        schema_version: spec.schema_version,
        average_rounds,
        average_combo,
        balls_per_round: per_round,
        average_payout,
        payout_scale: scale,
        average_paid_spins: entry.paid_spins,
        total_chance: OneIn::of(per_cycle.hits / per_cycle.spins).ok_or(SolveError::Singular)?,
        round_chance: OneIn::of(per_cycle.rounds / per_cycle.spins).ok_or(SolveError::Singular)?,
        mode_entry: modes_of(spec)
            .into_iter()
            .map(|mode| mode_entry(spec, mode))
            .collect::<Result<_, _>>()?,
        derivation: spec
            .origins
            .iter()
            .zip(rounds.iter().zip(&hits).zip(&balls).zip(&paid))
            .map(
                |(
                    origin,
                    (((&average_rounds, &average_combo), &average_balls), &average_paid_spins),
                )| {
                    StateDerivation {
                        origin: origin.clone(),
                        average_rounds,
                        average_combo,
                        average_balls,
                        average_paid_spins,
                    }
                },
            )
            .collect(),
        relief_drive,
    })
}
