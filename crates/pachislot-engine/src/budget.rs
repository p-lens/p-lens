//! How much work a call may take: the steps of game-by-game walks, counted
//! as they are taken. A call made `within` a budget stops walking once the
//! budget is spent and is answered as too heavy; one made outside any
//! budget walks as far as it needs. A spec whose solving takes longer than
//! a shared catalog may spend on one request is refused for that, plainly,
//! rather than cut off without a word.
//!
//! A step is about as much time whatever the walk: a stream of a chain
//! played on a game, some fifteen to twenty-five nanoseconds natively, so
//! that a budget measures time alike across shapes. Work far cheaper or
//! dearer than that is spent at its own rate: a game of a chain besides its
//! streams, a mode's own walk by its games more than its streams, and a row
//! of figures each multiplied and added in — a zone scaling what waits, the
//! stretches laid where they begin — a step for so many of them. The rates
//! were timed on the catalog's heaviest formulas, each shape coming to forty
//! to sixty-five thousand steps a millisecond.

use std::cell::Cell;

thread_local! {
    static LEFT: Cell<Option<u64>> = const { Cell::new(None) };
}

/// The budget ran out before the call was done.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Exceeded;

/// Runs `call` with `steps` to spend: its answer, or `Exceeded` where its
/// walks would have taken more. Whatever budget was running before is put
/// back after.
///
/// # Errors
/// `Exceeded` where the call's walks took every step of the budget.
pub fn within<T>(steps: u64, call: impl FnOnce() -> T) -> Result<T, Exceeded> {
    let before = LEFT.with(|left| left.replace(Some(steps)));
    let answer = call();
    let after = LEFT.with(|left| left.replace(before));
    if after == Some(0) {
        Err(Exceeded)
    } else {
        Ok(answer)
    }
}

/// Figures multiplied and added in, one after another along a row, that
/// cost about a step between them.
const SUMS_A_STEP: usize = 16;

/// What a game of a chain costs besides its streams, in steps: what it
/// draws mode by mode and gathers, whatever few streams it has.
const CHAIN_GAME: usize = 8;

/// The streams of a mode's own walk a step advances a game, the game
/// itself costing a step besides.
const WALK_STREAMS_A_STEP: usize = 4;

/// Spends what a row of `sums` multiply-adds costs.
pub(crate) fn spend_sums(sums: usize) -> bool {
    spend(sums.div_ceil(SUMS_A_STEP))
}

/// Spends what a game of a chain of `streams` costs.
pub(crate) fn spend_chain_game(streams: usize) -> bool {
    spend(streams.saturating_add(CHAIN_GAME))
}

/// Spends what a game of a mode's own walk over `streams` costs.
pub(crate) fn spend_walk_game(streams: usize) -> bool {
    spend(1 + streams / WALK_STREAMS_A_STEP)
}

/// Spends `steps` of the running budget: whether there were that many to
/// spend, and so whether a walk goes on. Always so outside any budget.
pub(crate) fn spend(steps: usize) -> bool {
    LEFT.with(|left| match left.get() {
        None => true,
        Some(remaining) => {
            let wanted = u64::try_from(steps).unwrap_or(u64::MAX);
            left.set(Some(remaining.saturating_sub(wanted)));
            remaining > wanted
        }
    })
}
