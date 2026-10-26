use std::collections::BTreeMap;

use pachinko_domain::normalized::{
    NormalizedReliefDrive, NormalizedSpec, Outcome, PaidSpins, Reward, State, StateIndex,
    StateOrigin, Target,
};
use pachinko_domain::probability::{BasisPoints, Probability, ProbabilityError, ProbabilitySource};
use pachinko_domain::quantity::PayoutRule;
use pachinko_domain::spec::{
    Allotment, EarlyEndShare, Mode, ModeId, ModeKind, Next, ReliefDrive, Spec,
};
use pachinko_domain::version::SchemaVersion;

use crate::error::{Location, ProbabilityProblem, SpecError, Unsupported};
use crate::graph::{states_reachable, states_that_cannot_end};
use crate::query::{modes, regular_play};

/// The most states a spec may expand to. Far beyond any real machine; a spec
/// that needs more is declined rather than solved slowly or wrongly.
pub const STATE_LIMIT: usize = 256;

/// A spec as a combo of jackpots, or the first reason it cannot be one.
///
/// # Errors
/// Whatever `SpecError` names: a bad probability or allotment, a mode that
/// does not exist, cannot be reached, or never ends, or a spec beyond what the
/// engine models.
pub fn normalize(spec: &Spec) -> Result<NormalizedSpec, SpecError> {
    let regular = regular_play(spec)?;
    let modes = modes(spec)?;
    let layout = Layout::of(&modes)?;
    let hit_chance = positive(regular.chance, &Location::Regular)?;
    let payout = spec.resources.payout;
    let entry = allotment_outcomes(
        &regular.allotment,
        Probability::ONE,
        payout,
        &Location::Regular,
        |next| layout.entering(next, &Location::Regular),
    )?;
    let relief_drive = regular
        .relief_drive
        .as_ref()
        .map(|relief_drive| relief_drive_of(&layout, relief_drive))
        .transpose()?;
    let gauge = regular
        .relief_drive
        .as_ref()
        .map(|relief_drive| relief_drive.gauge.get().get());
    let states = layout
        .expanded
        .iter()
        .map(|&(mode, combo)| state_of(&layout, mode, combo, payout, gauge))
        .collect::<Result<Vec<_>, _>>()?;
    let normalized = NormalizedSpec {
        schema_version: SchemaVersion::CURRENT,
        hit_chance,
        entry,
        origins: layout
            .expanded
            .iter()
            .map(|&(mode, combo)| StateOrigin {
                mode: mode.id.clone(),
                combo,
            })
            .collect(),
        states,
        net_balls_per_round: spec.resources.payout.net_per_round(),
        relief_drive,
    };
    check_graph(&normalized)?;
    Ok(normalized)
}

/// A 遊タイム leads into its mode's first state, as a jackpot's allotment would.
fn relief_drive_of(
    layout: &Layout<'_>,
    relief_drive: &ReliefDrive,
) -> Result<NormalizedReliefDrive, SpecError> {
    Ok(NormalizedReliefDrive {
        gauge: relief_drive.gauge.get().get(),
        target: layout.entering(&Next::Mode(relief_drive.to.clone()), &Location::Regular)?,
    })
}

/// The modes of a spec, expanded into the states they become.
struct Layout<'spec> {
    modes: BTreeMap<&'spec ModeId, &'spec Mode>,
    /// Every state in order: a mode, and the combo it stands at there.
    expanded: Vec<(&'spec Mode, u32)>,
    index: BTreeMap<(&'spec ModeId, u32), StateIndex>,
}

impl<'spec> Layout<'spec> {
    fn of(all: &'spec [Mode]) -> Result<Self, SpecError> {
        let modes = unique_modes(all)?;
        let expanded: Vec<(&Mode, u32)> = all
            .iter()
            .flat_map(|mode| (1..=combo_states(mode)).map(move |combo| (mode, combo)))
            .collect();
        if expanded.len() > STATE_LIMIT {
            return Err(SpecError::UnsupportedSpec {
                reason: Unsupported::TooManyStates {
                    states: expanded.len(),
                    limit: STATE_LIMIT,
                },
            });
        }
        let index = expanded
            .iter()
            .enumerate()
            .map(|(position, &(mode, combo))| ((&mode.id, combo), StateIndex::new(position)))
            .collect();
        Ok(Self {
            modes,
            expanded,
            index,
        })
    }

    fn state(&self, mode: &ModeId, combo: u32, at: &Location) -> Result<Target, SpecError> {
        self.index
            .get(&(mode, combo))
            .map(|&index| Target::State(index))
            .ok_or_else(|| SpecError::UnknownMode {
                at: at.clone(),
                mode: mode.clone(),
            })
    }

    /// Where play goes on arriving somewhere from outside a mode: its first state.
    fn entering(&self, next: &Next, at: &Location) -> Result<Target, SpecError> {
        match next {
            Next::Regular => Ok(Target::End),
            Next::Mode(mode) => self.state(mode, 1, at),
        }
    }

    /// Where a jackpot won in `mode` at `combo` sends play. A jackpot that
    /// keeps play in a mode with a lucky trigger adds to the combo; the one
    /// that makes the trigger's combo moves play to the mode it leads to.
    fn after_hit(
        &self,
        mode: &Mode,
        combo: u32,
        next: &Next,
        at: &Location,
    ) -> Result<Target, SpecError> {
        match (next, &mode.lucky_trigger) {
            (Next::Mode(target), Some(trigger)) if *target == mode.id => {
                if combo + 1 < trigger.at_combo.get() {
                    self.state(&mode.id, combo + 1, at)
                } else if self.modes.contains_key(&trigger.to) {
                    self.state(&trigger.to, 1, at)
                } else {
                    Err(SpecError::UnknownMode {
                        at: at.clone(),
                        mode: trigger.to.clone(),
                    })
                }
            }
            _ => self.entering(next, at),
        }
    }
}

fn unique_modes(modes: &[Mode]) -> Result<BTreeMap<&ModeId, &Mode>, SpecError> {
    modes.iter().try_fold(BTreeMap::new(), |mut found, mode| {
        if let Some(trigger) = &mode.lucky_trigger {
            if trigger.to == mode.id {
                return Err(SpecError::UnsupportedSpec {
                    reason: Unsupported::LuckyTriggerToItself,
                });
            }
            if trigger.at_combo.get() < 2 {
                return Err(SpecError::UnsupportedSpec {
                    reason: Unsupported::LuckyTriggerOnEntry,
                });
            }
        }
        match found.insert(&mode.id, mode) {
            Some(_) => Err(SpecError::DuplicateMode {
                mode: mode.id.clone(),
            }),
            None => Ok(found),
        }
    })
}

/// How many states a mode becomes: one per combo short of its lucky trigger.
fn combo_states(mode: &Mode) -> u32 {
    mode.lucky_trigger
        .as_ref()
        .map_or(1, |trigger| trigger.at_combo.get().saturating_sub(1))
}

fn probability_problem(problem: ProbabilityError) -> ProbabilityProblem {
    match problem {
        ProbabilityError::NotFinite => ProbabilityProblem::NotFinite,
        ProbabilityError::OutOfRange => ProbabilityProblem::OutOfRange,
    }
}

fn read(source: ProbabilitySource, at: &Location) -> Result<Probability, SpecError> {
    source
        .probability()
        .map_err(|problem| SpecError::InvalidProbability {
            at: at.clone(),
            problem: probability_problem(problem),
        })
}

fn positive(source: ProbabilitySource, at: &Location) -> Result<Probability, SpecError> {
    let probability = read(source, at)?;
    if probability.is_impossible() {
        Err(SpecError::InvalidProbability {
            at: at.clone(),
            problem: ProbabilityProblem::Zero,
        })
    } else {
        Ok(probability)
    }
}

/// The chance a mode reaches its next jackpot before it ends.
fn chance_before_the_end(kind: ModeKind, at: &Location) -> Result<Probability, SpecError> {
    match kind {
        ModeKind::Runout { spins, chance, .. } => {
            Ok(positive(chance, at)?.at_least_once_in(spins.get()))
        }
        ModeKind::UntilHit => Ok(Probability::ONE),
        ModeKind::Continuation { rate } => positive(rate, at),
    }
}

/// An allotment must be shares of exactly 100%, none of them zero.
fn check_distribution(allotment: &[Allotment], at: &Location) -> Result<(), SpecError> {
    let sum = allotment.iter().map(|share| share.share.get()).sum::<u32>();
    let has_zero = allotment.iter().any(|share| share.share.get() == 0);
    if allotment.is_empty() || has_zero || sum != BasisPoints::WHOLE.get() {
        Err(SpecError::InvalidDistribution {
            at: at.clone(),
            sum,
        })
    } else {
        Ok(())
    }
}

/// The outcomes of a jackpot that came with probability `chance`.
fn allotment_outcomes(
    allotment: &[Allotment],
    chance: Probability,
    payout: PayoutRule,
    at: &Location,
    target: impl Fn(&Next) -> Result<Target, SpecError>,
) -> Result<Vec<Outcome>, SpecError> {
    check_distribution(allotment, at)?;
    allotment
        .iter()
        .map(|share| {
            Ok(Outcome {
                probability: chance.and(share.share.probability()),
                reward: Reward {
                    rounds: share.total_rounds(),
                    hits: share.jackpots.get(),
                    balls: share.net_balls(payout),
                },
                next: target(&share.next)?,
                fills: None,
            })
        })
        .collect()
}

/// The spins of a mode that fill the relief gauge when they run out: a
/// 時短's and a leftover queue's. An ST or a mode of another kind fills none.
fn fills_gauge(kind: ModeKind) -> u32 {
    match kind {
        ModeKind::Runout {
            spins,
            fills_gauge: true,
            ..
        } => spins.get().get(),
        ModeKind::Runout { .. } | ModeKind::UntilHit | ModeKind::Continuation { .. } => 0,
    }
}

/// The spins a mode plays at the heso and pays for: a mode shot there whose
/// spins run out, at its own chance. A mode shot there that ends otherwise —
/// at a jackpot that is certain, or by a continuation rate — says nothing of
/// how many spins it takes, and costs none.
fn paid_spins(mode: &Mode, at: &Location) -> Result<Option<PaidSpins>, SpecError> {
    match mode.kind {
        ModeKind::Runout { spins, chance, .. } if mode.at_heso => Ok(Some(PaidSpins {
            spins: spins.get().get(),
            chance: positive(chance, at)?,
        })),
        ModeKind::Runout { .. } | ModeKind::UntilHit | ModeKind::Continuation { .. } => Ok(None),
    }
}

/// Spins of a 時短 ended early are gathered into steps of this many, each
/// filling the relief gauge by the spin at its middle: the long run with a
/// 遊タイム then has a point for each step rather than each spin, and comes
/// out the same to well within a thousandth of a border.
pub const EARLY_END_STEP: u32 = 5;

/// A 時短 that may end early, spin by spin: a jackpot at `hit`, an early end
/// at `end`, else on to the next spin, for `spins` spins.
#[derive(Clone, Copy)]
struct Race {
    hit: f64,
    end: f64,
    spins: u32,
}

impl Race {
    fn keep(self) -> f64 {
        1.0 - self.hit - self.end
    }

    /// The chance the 時短 is still on at spin `k`, the first being one.
    fn reached(self, k: u32) -> f64 {
        self.keep().powf(f64::from(k.saturating_sub(1)))
    }

    /// The chance of a jackpot before the 時短 ends either way.
    fn won(self) -> f64 {
        self.hit * (1.0 - self.keep().powf(f64::from(self.spins))) / (self.hit + self.end)
    }

    /// The chance it ends early between spin `from` and spin `to`, both counted.
    fn ended_between(self, from: u32, to: u32) -> f64 {
        (from..=to).map(|k| self.end * self.reached(k)).sum()
    }
}

/// The spins at which a 時短 ended early is taken to have ended, step by
/// step, each with the spins it fills the relief gauge by: steps of
/// `EARLY_END_STEP` filling by their middle spin, below the 遊タイム's count;
/// every spin from that count on as one, filling the gauge whole. Without
/// a 遊タイム there is no gauge to fill, and the spins are one step, said to
/// fill by its middle all the same: an early end always says its spins.
fn early_end_steps(spins: u32, gauge: Option<u32>) -> Vec<(u32, u32, Option<u32>)> {
    match gauge {
        None => vec![(1, spins, Some(spins.div_ceil(2)))],
        Some(gauge) => {
            let below = spins.min(gauge.saturating_sub(1));
            let steps = (0..below.div_ceil(EARLY_END_STEP)).map(|step| {
                let from = step * EARLY_END_STEP + 1;
                let to = (from + EARLY_END_STEP - 1).min(below);
                (from, to, Some(u32::midpoint(from, to)))
            });
            let rest = (gauge <= spins).then_some((gauge, spins, Some(gauge)));
            steps.chain(rest).collect()
        }
    }
}

/// The outcomes of a 時短 that may end early: its jackpots, allotted; each
/// step of an early end, to each place its shares lead; and its spins
/// running out, where a miss goes.
fn early_end_outcomes(
    layout: &Layout<'_>,
    mode: &Mode,
    combo: u32,
    payout: PayoutRule,
    gauge: Option<u32>,
    race: Race,
    at: &Location,
) -> Result<Vec<Outcome>, SpecError> {
    let shares: &[EarlyEndShare] = mode
        .early_end
        .as_ref()
        .map_or(&[], |early_end| &early_end.to);
    let probability = |value: f64| {
        Probability::new(value.clamp(0.0, 1.0)).map_err(|problem| SpecError::InvalidProbability {
            at: at.clone(),
            problem: probability_problem(problem),
        })
    };
    let sum = shares.iter().map(|share| share.share.get()).sum::<u32>();
    if shares.is_empty()
        || shares.iter().any(|share| share.share.get() == 0)
        || sum != BasisPoints::WHOLE.get()
    {
        return Err(SpecError::InvalidDistribution {
            at: at.clone(),
            sum,
        });
    }
    let hits = allotment_outcomes(
        &mode.allotment,
        probability(race.won())?,
        payout,
        at,
        |next| layout.after_hit(mode, combo, next, at),
    )?;
    let ends = early_end_steps(race.spins, gauge)
        .into_iter()
        .flat_map(|(from, to, fills)| shares.iter().map(move |share| (from, to, fills, share)))
        .map(|(from, to, fills, share)| -> Result<Outcome, SpecError> {
            Ok(Outcome {
                probability: probability(
                    race.ended_between(from, to) * share.share.probability().value(),
                )?,
                reward: Reward::default(),
                next: layout.entering(&share.next, at)?,
                fills,
            })
        })
        .collect::<Result<Vec<_>, _>>()?;
    let ran_out = probability(race.reached(race.spins + 1))?;
    let miss = (!ran_out.is_impossible())
        .then(|| -> Result<Outcome, SpecError> {
            Ok(Outcome {
                probability: ran_out,
                reward: Reward::default(),
                next: layout.entering(&mode.on_miss, at)?,
                fills: None,
            })
        })
        .transpose()?;
    Ok(hits.into_iter().chain(ends).chain(miss).collect())
}

fn state_of(
    layout: &Layout<'_>,
    mode: &Mode,
    combo: u32,
    payout: PayoutRule,
    gauge: Option<u32>,
) -> Result<State, SpecError> {
    let at = Location::Mode(mode.id.clone());
    if let (Some(early_end), ModeKind::Runout { spins, chance, .. }) = (&mode.early_end, mode.kind)
    {
        let race = Race {
            hit: positive(chance, &at)?.value(),
            end: positive(early_end.chance, &at)?.value(),
            spins: spins.get().get(),
        };
        if race.keep() < 0.0 {
            return Err(SpecError::InvalidProbability {
                at,
                problem: ProbabilityProblem::OutOfRange,
            });
        }
        return Ok(State {
            outcomes: early_end_outcomes(layout, mode, combo, payout, gauge, race, &at)?,
            fills_gauge: fills_gauge(mode.kind),
            supported: mode.supported,
            paid: mode
                .at_heso
                .then(|| -> Result<PaidSpins, SpecError> {
                    Ok(PaidSpins {
                        spins: race.spins,
                        chance: Probability::new(race.hit + race.end).map_err(|problem| {
                            SpecError::InvalidProbability {
                                at: at.clone(),
                                problem: probability_problem(problem),
                            }
                        })?,
                    })
                })
                .transpose()?,
        });
    }
    let chance = chance_before_the_end(mode.kind, &at)?;
    let risk = chance.complement();
    let hits = allotment_outcomes(&mode.allotment, chance, payout, &at, |next| {
        layout.after_hit(mode, combo, next, &at)
    })?;
    let miss = (!risk.is_impossible())
        .then(|| -> Result<Outcome, SpecError> {
            Ok(Outcome {
                probability: risk,
                reward: Reward::default(),
                next: layout.entering(&mode.on_miss, &at)?,
                fills: None,
            })
        })
        .transpose()?;
    Ok(State {
        outcomes: hits.into_iter().chain(miss).collect(),
        fills_gauge: fills_gauge(mode.kind),
        supported: mode.supported,
        paid: paid_spins(mode, &at)?,
    })
}

/// Every mode must be reachable from a first jackpot or the 遊タイム, and every
/// state must be able to end. A state that cannot end has no theoretical value, and would leave
/// the solver a system with no solution.
fn check_graph(spec: &NormalizedSpec) -> Result<(), SpecError> {
    let reachable = states_reachable(spec);
    let stuck = states_that_cannot_end(spec);
    let reached_by_mode = spec.origins.iter().enumerate().fold(
        BTreeMap::<&ModeId, bool>::new(),
        |mut reached, (index, origin)| {
            let entry = reached.entry(&origin.mode).or_insert(false);
            *entry = *entry || reachable.contains(&StateIndex::new(index));
            reached
        },
    );
    if let Some((mode, _)) = reached_by_mode.iter().find(|&(_, &reached)| !reached) {
        return Err(SpecError::UnreachableState {
            mode: (*mode).clone(),
        });
    }
    match spec
        .origins
        .iter()
        .enumerate()
        .find(|&(index, _)| stuck.contains(&StateIndex::new(index)))
    {
        Some((_, origin)) => Err(SpecError::NonAbsorbingModel {
            mode: origin.mode.clone(),
        }),
        None => Ok(()),
    }
}
