use std::collections::BTreeSet;

use pachinko_domain::normalized::{NormalizedSpec, Outcome, StateIndex, Target};

/// Where an outcome can lead, if it can happen at all.
fn live_target(outcome: &Outcome) -> Option<StateIndex> {
    match outcome.next {
        Target::State(index) if !outcome.probability.is_impossible() => Some(index),
        Target::State(_) | Target::End => None,
    }
}

/// Every state a first jackpot or the 遊タイム can lead to, by outcomes that can happen.
pub fn states_reachable(spec: &NormalizedSpec) -> BTreeSet<StateIndex> {
    let relief_drive = spec
        .relief_drive
        .and_then(|relief_drive| match relief_drive.target {
            Target::State(index) => Some(index),
            Target::End => None,
        });
    let start: Vec<StateIndex> = spec
        .entry
        .iter()
        .filter_map(live_target)
        .chain(relief_drive)
        .collect();
    let mut reached: BTreeSet<StateIndex> = BTreeSet::new();
    let mut frontier = start;
    while let Some(index) = frontier.pop() {
        if reached.insert(index) {
            frontier.extend(
                spec.states
                    .get(index.get())
                    .into_iter()
                    .flat_map(|state| state.outcomes.iter().filter_map(live_target)),
            );
        }
    }
    reached
}

/// Every state from which no sequence of possible outcomes ever returns play
/// to the regular game.
pub fn states_that_cannot_end(spec: &NormalizedSpec) -> BTreeSet<StateIndex> {
    let ends_directly = |outcomes: &[Outcome]| {
        outcomes
            .iter()
            .any(|outcome| outcome.next == Target::End && !outcome.probability.is_impossible())
    };
    let mut can_end: BTreeSet<StateIndex> = spec
        .states
        .iter()
        .enumerate()
        .filter(|(_, state)| ends_directly(&state.outcomes))
        .map(|(index, _)| StateIndex::new(index))
        .collect();
    loop {
        let grown: BTreeSet<StateIndex> = spec
            .states
            .iter()
            .enumerate()
            .filter(|(_, state)| {
                state
                    .outcomes
                    .iter()
                    .filter_map(live_target)
                    .any(|next| can_end.contains(&next))
            })
            .map(|(index, _)| StateIndex::new(index))
            .chain(can_end.iter().copied())
            .collect();
        if grown.len() == can_end.len() {
            break;
        }
        can_end = grown;
    }
    (0..spec.states.len())
        .map(StateIndex::new)
        .filter(|index| !can_end.contains(index))
        .collect()
}
