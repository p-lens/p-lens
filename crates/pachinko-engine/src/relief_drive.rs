//! The 遊タイム over the long run. Where regular play starts again after a
//! combo depends on how the combo ended: with a 時短's spins already filled
//! toward the 遊タイム, or — after a 遊タイム that brought no jackpot — with the
//! 遊タイム spent until the next one. Each way of starting again leads to the
//! next with fixed chances, so the long run is a small Markov chain over them,
//! whose stationary weights say how often regular play starts each way.

use std::collections::{BTreeMap, BTreeSet};

use pachinko_domain::normalized::{NormalizedReliefDrive, NormalizedSpec, Outcome, Target};

use crate::error::SolveError;
use crate::linear;

/// How regular play starts again after a combo.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Restart {
    /// With so many spins already filled toward the 遊タイム.
    Filled(u32),
    /// With the 遊タイム spent: it does not come again until a jackpot.
    Spent,
}

/// What a combo yields on average: its rounds, its jackpots, the balls
/// its rounds gain as the spec's payout gives them, and the spins it plays
/// at the heso, which cost balls as regular spins do.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Yield {
    pub rounds: f64,
    pub hits: f64,
    pub balls: f64,
    pub paid_spins: f64,
}

impl Yield {
    /// This yield where the other comes instead with chance `other_chance`.
    #[must_use]
    pub fn mixed_with(self, other: Self, other_chance: f64) -> Self {
        let mine = 1.0 - other_chance;
        Self {
            rounds: mine * self.rounds + other_chance * other.rounds,
            hits: mine * self.hits + other_chance * other.hits,
            balls: mine * self.balls + other_chance * other.balls,
            paid_spins: mine * self.paid_spins + other_chance * other.paid_spins,
        }
    }
}

/// One way of starting regular play again, over the long run: how often it
/// happens, and what a cycle from it comes to on average until the next.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RestartFigures {
    pub restart: Restart,
    pub weight: f64,
    pub spins: f64,
    pub rounds: f64,
    pub hits: f64,
    /// Balls the cycle's rounds gain, as the spec's payout gives them.
    pub balls: f64,
    /// Spins its combos play at the heso, beside its regular spins.
    pub paid_spins: f64,
}

/// From one point of a combo — a state, the spins filled on the way out,
/// and whether the 遊タイム's first run is still unbroken — the chance of
/// each way regular play starts again. Given beside the long run so that
/// it can be checked from outside: each point's chances are its outcomes'
/// shares of the chances where they lead.
#[derive(Clone, Debug, PartialEq)]
pub struct EndingFigures {
    pub state: usize,
    pub filled: u32,
    pub unbroken: bool,
    pub chances: Vec<(Restart, f64)>,
}

/// The long run with a 遊タイム: each way regular play starts again, and the
/// chances of each from every point of a combo they were worked out from.
#[derive(Clone, Debug, PartialEq)]
pub struct LongRun {
    pub restarts: Vec<RestartFigures>,
    pub endings: Vec<EndingFigures>,
}

/// A point in a combo as the 遊タイム sees it: the state, the spins filled on
/// the way out since the last jackpot, and whether play is still in the
/// 遊タイム's first run with no jackpot yet.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
struct Node {
    state: usize,
    filled: u32,
    unbroken: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Step {
    Node(Node),
    Restart(Restart),
}

/// Where an outcome takes play from a node. A jackpot starts the count again;
/// a miss adds the spins it fills — the state's, or an early end's own —
/// never past the 遊タイム itself.
fn step(
    spec: &NormalizedSpec,
    relief_drive: NormalizedReliefDrive,
    node: Node,
    outcome: &Outcome,
) -> Step {
    if outcome.reward.hits > 0 {
        return match outcome.next {
            Target::State(index) => Step::Node(Node {
                state: index.get(),
                filled: 0,
                unbroken: false,
            }),
            Target::End => Step::Restart(Restart::Filled(0)),
        };
    }
    let own = spec
        .states
        .get(node.state)
        .map_or(0, |state| outcome.filling(state));
    let filled = node.filled.saturating_add(own).min(relief_drive.gauge);
    match outcome.next {
        Target::State(index) => Step::Node(Node {
            state: index.get(),
            filled,
            unbroken: node.unbroken,
        }),
        Target::End if node.unbroken => Step::Restart(Restart::Spent),
        Target::End => Step::Restart(Restart::Filled(filled)),
    }
}

fn outcomes_of(spec: &NormalizedSpec, node: Node) -> &[Outcome] {
    spec.states
        .get(node.state)
        .map(|state| state.outcomes.as_slice())
        .unwrap_or_default()
}

/// Every node reachable from `starts`.
fn reachable(
    spec: &NormalizedSpec,
    relief_drive: NormalizedReliefDrive,
    starts: &[Node],
) -> Vec<Node> {
    let mut seen: BTreeSet<Node> = BTreeSet::new();
    let mut frontier: Vec<Node> = starts.to_vec();
    while let Some(node) = frontier.pop() {
        if seen.insert(node) {
            frontier.extend(outcomes_of(spec, node).iter().filter_map(|outcome| {
                match step(spec, relief_drive, node, outcome) {
                    Step::Node(next) => Some(next),
                    Step::Restart(_) => None,
                }
            }));
        }
    }
    seen.into_iter().collect()
}

/// The chance of each restart from each node: the absorbing chain over nodes,
/// solved once for each restart it can end in.
struct Endings {
    nodes: BTreeMap<Node, usize>,
    chances: BTreeMap<Restart, Vec<f64>>,
}

fn endings(
    spec: &NormalizedSpec,
    relief_drive: NormalizedReliefDrive,
    starts: &[Node],
) -> Result<Endings, SolveError> {
    let order = reachable(spec, relief_drive, starts);
    let nodes: BTreeMap<Node, usize> = order
        .iter()
        .enumerate()
        .map(|(index, &node)| (node, index))
        .collect();
    let steps: Vec<Vec<(f64, Step)>> = order
        .iter()
        .map(|&node| {
            outcomes_of(spec, node)
                .iter()
                .map(|outcome| {
                    (
                        outcome.probability.value(),
                        step(spec, relief_drive, node, outcome),
                    )
                })
                .collect()
        })
        .collect();
    let matrix: Vec<Vec<f64>> = steps
        .iter()
        .enumerate()
        .map(|(row, moves)| {
            (0..order.len())
                .map(|column| {
                    let identity = if row == column { 1.0 } else { 0.0 };
                    identity
                        - moves
                            .iter()
                            .filter(|(_, next)| matches!(next, Step::Node(node) if nodes.get(node) == Some(&column)))
                            .map(|(chance, _)| chance)
                            .sum::<f64>()
                })
                .collect()
        })
        .collect();
    let restarts: BTreeSet<Restart> = steps
        .iter()
        .flatten()
        .filter_map(|(_, next)| match next {
            Step::Restart(restart) => Some(*restart),
            Step::Node(_) => None,
        })
        .collect();
    let direct: Vec<Vec<f64>> = restarts
        .iter()
        .map(|restart| {
            steps
                .iter()
                .map(|moves| {
                    moves
                        .iter()
                        .filter(|(_, next)| *next == Step::Restart(*restart))
                        .map(|(chance, _)| chance)
                        .sum()
                })
                .collect()
        })
        .collect();
    let solved = linear::solve_each(&matrix, &direct).ok_or(SolveError::Singular)?;
    let chances = restarts.into_iter().zip(solved).collect();
    Ok(Endings { nodes, chances })
}

impl Endings {
    /// Every point's chances, as figures to give out.
    fn figures(&self) -> Vec<EndingFigures> {
        self.nodes
            .iter()
            .map(|(node, &index)| EndingFigures {
                state: node.state,
                filled: node.filled,
                unbroken: node.unbroken,
                chances: self
                    .chances
                    .iter()
                    .map(|(&restart, column)| (restart, column.get(index).copied().unwrap_or(0.0)))
                    .collect(),
            })
            .collect()
    }

    /// The chance of each restart after landing at `step`.
    fn after(&self, landing: Step) -> BTreeMap<Restart, f64> {
        match landing {
            Step::Restart(restart) => BTreeMap::from([(restart, 1.0)]),
            Step::Node(node) => self
                .nodes
                .get(&node)
                .map(|&index| {
                    self.chances
                        .iter()
                        .map(|(&restart, column)| {
                            (restart, column.get(index).copied().unwrap_or(0.0))
                        })
                        .collect()
                })
                .unwrap_or_default(),
        }
    }
}

fn mixed(parts: &[(f64, &BTreeMap<Restart, f64>)]) -> BTreeMap<Restart, f64> {
    parts
        .iter()
        .fold(BTreeMap::new(), |mut sum, (weight, chances)| {
            for (&restart, &chance) in *chances {
                *sum.entry(restart).or_insert(0.0) += weight * chance;
            }
            sum
        })
}

/// How often each way of starting again comes over the long run: the
/// stationary weights of the chain the cycles make, summing to one.
fn stationary(
    kinds: &[Restart],
    cycles: &[(f64, Yield, BTreeMap<Restart, f64>)],
) -> Result<Vec<f64>, SolveError> {
    let size = kinds.len();
    let stationary_rows: Vec<Vec<f64>> = (0..size)
        .map(|row| {
            if row + 1 == size {
                vec![1.0; size]
            } else {
                (0..size)
                    .map(|column| {
                        let into = kinds
                            .get(row)
                            .and_then(|kind| cycles.get(column).and_then(|cycle| cycle.2.get(kind)))
                            .copied()
                            .unwrap_or(0.0);
                        into - if row == column { 1.0 } else { 0.0 }
                    })
                    .collect()
            }
        })
        .collect();
    let constants: Vec<f64> = (0..size)
        .map(|row| if row + 1 == size { 1.0 } else { 0.0 })
        .collect();
    linear::solve(&stationary_rows, &constants).ok_or(SolveError::Singular)
}

/// The spins of a wait gathered as one where a c時短 may cut it: the spin it
/// came on says how far the gauge stands, and five apart moves a figure by
/// less than the sixth digit where one spin apart costs minutes.
const EARLY_END_STEP: u32 = 5;

/// The regular game's c時短 as a cycle sees it: its chance on a spin that is
/// no jackpot, and what each place it leads to yields.
#[derive(Clone, Debug, PartialEq)]
pub struct EarlyEndYields {
    pub chance: f64,
    pub shares: Vec<(f64, Target, Yield)>,
}

/// One cycle of regular play's chances, per spin of it: a jackpot on it, or
/// a c時短 that is no jackpot, whichever comes first.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RegularRace {
    pub jackpot: f64,
    pub early_end: f64,
}

impl RegularRace {
    pub fn of(p: f64, early_end: Option<&EarlyEndYields>) -> Self {
        Self {
            jackpot: p,
            early_end: early_end.map_or(0.0, |early_end| (1.0 - p) * early_end.chance),
        }
    }

    /// The chance a spin ends the wait.
    pub fn either(self) -> f64 {
        self.jackpot + self.early_end
    }

    /// The chance the wait goes `spins` with neither.
    pub fn neither_for(self, spins: u32) -> f64 {
        (1.0 - self.either()).powf(f64::from(spins))
    }
}

/// A wait's c時短s from `filled` over the `left` spins before the 遊タイム: where
/// each lands, with its chance, the spins gathered in steps.
fn early_end_landings(
    relief_drive: NormalizedReliefDrive,
    race: RegularRace,
    early_end: &EarlyEndYields,
    filled: u32,
) -> Vec<(f64, usize, Step)> {
    let gauge = relief_drive.gauge;
    let left = gauge.saturating_sub(filled);
    (0..left.div_ceil(EARLY_END_STEP))
        .flat_map(|step_index| {
            let from = step_index * EARLY_END_STEP;
            let to = (from + EARLY_END_STEP).min(left);
            let middle = filled + from + (to - from).div_ceil(2);
            let stands = (middle.div_ceil(EARLY_END_STEP) * EARLY_END_STEP).min(gauge);
            let chance =
                (race.neither_for(from) - race.neither_for(to)) * race.early_end / race.either();
            early_end
                .shares
                .iter()
                .enumerate()
                .map(move |(index, &(share, target, _))| {
                    let landing = match target {
                        Target::State(state) => Step::Node(Node {
                            state: state.get(),
                            filled: stands,
                            unbroken: false,
                        }),
                        Target::End => Step::Restart(Restart::Filled(stands)),
                    };
                    (chance * share, index, landing)
                })
        })
        .collect()
}

/// A spent 遊タイム's c時短s: no gauge is counting, so play comes back spent.
fn spent_landings(early_end: &EarlyEndYields) -> Vec<(f64, usize, Step)> {
    early_end
        .shares
        .iter()
        .enumerate()
        .map(|(index, &(share, target, _))| {
            let landing = match target {
                Target::State(state) => Step::Node(Node {
                    state: state.get(),
                    filled: 0,
                    unbroken: true,
                }),
                Target::End => Step::Restart(Restart::Spent),
            };
            (share, index, landing)
        })
        .collect()
}

fn landings_of(
    relief_drive: NormalizedReliefDrive,
    race: RegularRace,
    early_end: Option<&EarlyEndYields>,
    restart: Restart,
) -> Vec<(f64, usize, Step)> {
    early_end.map_or_else(Vec::new, |early_end| match restart {
        Restart::Spent => spent_landings(early_end),
        Restart::Filled(filled) => early_end_landings(relief_drive, race, early_end, filled),
    })
}

/// Every way of starting again that can come, and the nodes a combo can stand
/// at: a c時短 may land at a gauge a jackpot's combo never leaves it at, so
/// the two are grown together until nothing new comes.
fn grown_starts(
    spec: &NormalizedSpec,
    relief_drive: NormalizedReliefDrive,
    race: RegularRace,
    early_end: Option<&EarlyEndYields>,
    first: &[Step],
) -> (Vec<Node>, BTreeSet<Restart>) {
    let node_of = |landing: &Step| match landing {
        Step::Node(node) => Some(*node),
        Step::Restart(_) => None,
    };
    let restart_of = |landing: &Step| match landing {
        Step::Restart(restart) => Some(*restart),
        Step::Node(_) => None,
    };
    let mut restarts: BTreeSet<Restart> = first.iter().filter_map(restart_of).collect();
    restarts.insert(Restart::Filled(0));
    let mut starts: BTreeSet<Node> = first.iter().filter_map(node_of).collect();
    loop {
        let landings: Vec<Step> = restarts
            .iter()
            .flat_map(|&restart| landings_of(relief_drive, race, early_end, restart))
            .map(|(_, _, landing)| landing)
            .collect();
        starts.extend(landings.iter().filter_map(node_of));
        let from_nodes: BTreeSet<Restart> = reachable(
            spec,
            relief_drive,
            &starts.iter().copied().collect::<Vec<_>>(),
        )
        .into_iter()
        .flat_map(|node| {
            outcomes_of(spec, node)
                .iter()
                .map(move |outcome| step(spec, relief_drive, node, outcome))
                .collect::<Vec<_>>()
        })
        .filter_map(|next| restart_of(&next))
        .chain(landings.iter().filter_map(restart_of))
        .collect();
        let before = restarts.len();
        restarts.extend(from_nodes);
        if restarts.len() == before {
            return (starts.into_iter().collect(), restarts);
        }
    }
}

/// A cycle from a way of starting again: its regular spins, what it yields,
/// and the chance of each way of starting again after it.
type RestartCycle = (f64, Yield, BTreeMap<Restart, f64>);

/// What a cycle's parts add up to, each with its chance.
fn weighed(parts: &[(f64, Yield)]) -> Yield {
    parts.iter().fold(
        Yield {
            rounds: 0.0,
            hits: 0.0,
            balls: 0.0,
            paid_spins: 0.0,
        },
        |sum, (chance, yielded)| Yield {
            rounds: sum.rounds + chance * yielded.rounds,
            hits: sum.hits + chance * yielded.hits,
            balls: sum.balls + chance * yielded.balls,
            paid_spins: sum.paid_spins + chance * yielded.paid_spins,
        },
    )
}

/// What a cycle of regular play can come to, from any way of starting again.
struct CycleWays<'run> {
    relief_drive: NormalizedReliefDrive,
    race: RegularRace,
    early_end: Option<&'run EarlyEndYields>,
    entry: Yield,
    relief_drive_combo: Yield,
    ends: &'run Endings,
    after_entry: &'run BTreeMap<Restart, f64>,
    after_relief_drive: &'run BTreeMap<Restart, f64>,
}

impl CycleWays<'_> {
    fn early_yield(&self, index: usize) -> Yield {
        self.early_end
            .and_then(|early_end| early_end.shares.get(index))
            .map_or(weighed(&[]), |&(_, _, yielded)| yielded)
    }

    fn cycle(&self, restart: Restart) -> RestartCycle {
        let race = self.race;
        let (reach, spins) = match restart {
            Restart::Spent => (0.0, 1.0 / race.either()),
            Restart::Filled(filled) => {
                let reach = race.neither_for(self.relief_drive.gauge.saturating_sub(filled));
                (reach, (1.0 - reach) / race.either())
            }
        };
        let jackpot = (1.0 - reach) * race.jackpot / race.either();
        let after_landings: Vec<(f64, usize, BTreeMap<Restart, f64>)> =
            landings_of(self.relief_drive, race, self.early_end, restart)
                .iter()
                .map(|&(chance, index, landing)| {
                    let chance = match restart {
                        Restart::Spent => chance * race.early_end / race.either(),
                        Restart::Filled(_) => chance,
                    };
                    (chance, index, self.ends.after(landing))
                })
                .collect();
        let parts: Vec<(f64, Yield)> = [(jackpot, self.entry), (reach, self.relief_drive_combo)]
            .into_iter()
            .chain(
                after_landings
                    .iter()
                    .map(|&(chance, index, _)| (chance, self.early_yield(index))),
            )
            .collect();
        let chances: Vec<(f64, &BTreeMap<Restart, f64>)> = [
            (jackpot, self.after_entry),
            (reach, self.after_relief_drive),
        ]
        .into_iter()
        .chain(
            after_landings
                .iter()
                .map(|(chance, _, after)| (*chance, after)),
        )
        .collect();
        (spins, weighed(&parts), mixed(&chances))
    }
}

/// What the long run comes to with a 遊タイム: each way regular play starts
/// again, how often, and what a cycle from it yields, with the chances of
/// each from every point of a combo. `entry` and `relief_drive_combo` are
/// what a first jackpot's combo and the 遊タイム's combo yield; `early_end`,
/// the regular game's c時短 where it has one.
///
/// # Errors
/// When a system has no solution, which a normalised spec cannot cause.
pub fn long_run(
    spec: &NormalizedSpec,
    relief_drive: NormalizedReliefDrive,
    entry: Yield,
    relief_drive_combo: Yield,
    early_end: Option<&EarlyEndYields>,
) -> Result<LongRun, SolveError> {
    let race = RegularRace::of(spec.hit_chance.value(), early_end);
    let fresh = |state: usize, unbroken: bool| Node {
        state,
        filled: 0,
        unbroken,
    };
    let entry_landings: Vec<(f64, Step)> = spec
        .entry
        .iter()
        .map(|outcome| {
            let landing = match outcome.next {
                Target::State(index) => Step::Node(fresh(index.get(), false)),
                Target::End => Step::Restart(Restart::Filled(0)),
            };
            (outcome.probability.value(), landing)
        })
        .collect();
    let relief_drive_landing = match relief_drive.target {
        Target::State(index) => Step::Node(fresh(index.get(), true)),
        Target::End => Step::Restart(Restart::Spent),
    };
    let first: Vec<Step> = entry_landings
        .iter()
        .map(|(_, landing)| *landing)
        .chain(std::iter::once(relief_drive_landing))
        .collect();
    let (starts, restarts) = grown_starts(spec, relief_drive, race, early_end, &first);
    let ends = endings(spec, relief_drive, &starts)?;
    let landed: Vec<(f64, BTreeMap<Restart, f64>)> = entry_landings
        .iter()
        .map(|(chance, landing)| (*chance, ends.after(*landing)))
        .collect();
    let after_entry = mixed(
        &landed
            .iter()
            .map(|(chance, chances)| (*chance, chances))
            .collect::<Vec<_>>(),
    );
    let after_relief_drive = ends.after(relief_drive_landing);
    let kinds: Vec<Restart> = after_entry
        .keys()
        .chain(after_relief_drive.keys())
        .copied()
        .chain(restarts)
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    let ways = CycleWays {
        relief_drive,
        race,
        early_end,
        entry,
        relief_drive_combo,
        ends: &ends,
        after_entry: &after_entry,
        after_relief_drive: &after_relief_drive,
    };
    let cycles: Vec<RestartCycle> = kinds.iter().map(|&kind| ways.cycle(kind)).collect();
    let weights = stationary(&kinds, &cycles)?;
    Ok(LongRun {
        restarts: kinds
            .iter()
            .zip(cycles)
            .zip(weights)
            .map(|((&restart, (spins, yielded, _)), weight)| RestartFigures {
                restart,
                weight,
                spins,
                rounds: yielded.rounds,
                hits: yielded.hits,
                balls: yielded.balls,
                paid_spins: yielded.paid_spins,
            })
            .collect(),
        endings: ends.figures(),
    })
}
