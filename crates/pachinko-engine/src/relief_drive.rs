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
    let chances = restarts
        .into_iter()
        .map(|restart| {
            let direct: Vec<f64> = steps
                .iter()
                .map(|moves| {
                    moves
                        .iter()
                        .filter(|(_, next)| *next == Step::Restart(restart))
                        .map(|(chance, _)| chance)
                        .sum()
                })
                .collect();
            linear::solve(&matrix, &direct)
                .map(|solved| (restart, solved))
                .ok_or(SolveError::Singular)
        })
        .collect::<Result<_, _>>()?;
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

/// What the long run comes to with a 遊タイム: each way regular play starts
/// again, how often, and what a cycle from it yields, with the chances of
/// each from every point of a combo. `entry` and `relief_drive_combo` are
/// what a first jackpot's combo and the 遊タイム's combo yield.
///
/// # Errors
/// When a system has no solution, which a normalised spec cannot cause.
pub fn long_run(
    spec: &NormalizedSpec,
    relief_drive: NormalizedReliefDrive,
    entry: Yield,
    relief_drive_combo: Yield,
) -> Result<LongRun, SolveError> {
    let p = spec.hit_chance.value();
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
    let starts: Vec<Node> = entry_landings
        .iter()
        .map(|(_, landing)| *landing)
        .chain(std::iter::once(relief_drive_landing))
        .filter_map(|landing| match landing {
            Step::Node(node) => Some(node),
            Step::Restart(_) => None,
        })
        .collect();
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
        .chain(std::iter::once(Restart::Filled(0)))
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    let cycle = |restart: Restart| -> (f64, Yield, BTreeMap<Restart, f64>) {
        match restart {
            Restart::Spent => (1.0 / p, entry, after_entry.clone()),
            Restart::Filled(filled) => {
                let left = relief_drive.gauge.saturating_sub(filled);
                let reach = (1.0 - p).powf(f64::from(left));
                (
                    (1.0 - reach) / p,
                    entry.mixed_with(relief_drive_combo, reach),
                    mixed(&[(1.0 - reach, &after_entry), (reach, &after_relief_drive)]),
                )
            }
        }
    };
    let cycles: Vec<(f64, Yield, BTreeMap<Restart, f64>)> =
        kinds.iter().map(|&kind| cycle(kind)).collect();
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
