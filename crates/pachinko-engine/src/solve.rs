use std::collections::BTreeSet;

use pachinko_domain::normalized::{NormalizedSpec, Outcome, Reward, State, StateIndex, Target};

use crate::error::SolveError;
use crate::linear;

/// The value of a quantity at `next`: zero at the end of the combo.
pub fn at(values: &[f64], next: Target) -> f64 {
    match next {
        Target::State(index) => values.get(index.get()).copied().unwrap_or(0.0),
        Target::End => 0.0,
    }
}

fn check_targets(spec: &NormalizedSpec) -> Result<(), SolveError> {
    let in_range = |outcome: &Outcome| match outcome.next {
        Target::State(index) => index.get() < spec.states.len(),
        Target::End => true,
    };
    let all_in_range = spec.entry.iter().all(in_range)
        && spec
            .states
            .iter()
            .all(|state| state.outcomes.iter().all(in_range));
    if all_in_range {
        Ok(())
    } else {
        Err(SolveError::DanglingTarget)
    }
}

/// The row of `I - Q` for one state: one on the diagonal, less the chance of
/// moving to each state.
fn transient_row(spec: &NormalizedSpec, row: usize) -> Vec<f64> {
    let identity = (0..spec.states.len()).map(|column| if column == row { 1.0 } else { 0.0 });
    let outcomes = spec
        .states
        .get(row)
        .map(|state| state.outcomes.as_slice())
        .unwrap_or_default();
    identity
        .enumerate()
        .map(|(column, diagonal)| {
            diagonal
                - outcomes
                    .iter()
                    .filter(|outcome| outcome.next == Target::State(StateIndex::new(column)))
                    .map(|outcome| outcome.probability.value())
                    .sum::<f64>()
        })
        .collect()
}

/// The expected total of a reward from each state until the combo ends:
/// `(I - Q) v = r`, where `r` is the reward one step yields on average —
/// what an outcome yields as the state it comes from has it.
///
/// # Errors
/// When the spec has outcomes leading nowhere or states that never end.
pub fn expected_totals(
    spec: &NormalizedSpec,
    reward: impl Fn(&State, Reward) -> f64,
) -> Result<Vec<f64>, SolveError> {
    check_targets(spec)?;
    let matrix: Vec<Vec<f64>> = (0..spec.states.len())
        .map(|row| transient_row(spec, row))
        .collect();
    let immediate: Vec<f64> = spec
        .states
        .iter()
        .map(|state| {
            state
                .outcomes
                .iter()
                .map(|outcome| outcome.probability.value() * reward(state, outcome.reward))
                .sum()
        })
        .collect();
    linear::solve(&matrix, &immediate).ok_or(SolveError::Singular)
}

/// The chance, from each state, of ever being in one of `targets` before the
/// combo ends. One in the targets themselves.
///
/// # Errors
/// When the spec has outcomes leading nowhere or states that never end.
pub fn reach_probabilities(
    spec: &NormalizedSpec,
    targets: &BTreeSet<StateIndex>,
) -> Result<Vec<f64>, SolveError> {
    check_targets(spec)?;
    let is_target = |row: usize| targets.contains(&StateIndex::new(row));
    let matrix: Vec<Vec<f64>> = (0..spec.states.len())
        .map(|row| {
            if is_target(row) {
                (0..spec.states.len())
                    .map(|column| if column == row { 1.0 } else { 0.0 })
                    .collect()
            } else {
                transient_row(spec, row)
            }
        })
        .collect();
    let constants: Vec<f64> = (0..spec.states.len())
        .map(|row| if is_target(row) { 1.0 } else { 0.0 })
        .collect();
    linear::solve(&matrix, &constants).ok_or(SolveError::Singular)
}

/// A quantity averaged over a first jackpot: what its allotment yields at
/// once, plus the expected total from wherever it leads.
pub fn from_entry(
    spec: &NormalizedSpec,
    values: &[f64],
    immediate: impl Fn(&Outcome) -> f64,
) -> f64 {
    spec.entry
        .iter()
        .map(|outcome| {
            outcome.probability.value() * (immediate(outcome) + at(values, outcome.next))
        })
        .sum()
}
