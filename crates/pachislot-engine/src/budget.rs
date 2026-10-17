//! How much work a call may take: the steps of game-by-game walks, counted
//! as they are taken. A call made `within` a budget stops walking once the
//! budget is spent and is answered as too heavy; one made outside any
//! budget walks as far as it needs. A spec whose solving takes longer than
//! a shared catalog may spend on one request is refused for that, plainly,
//! rather than cut off without a word.

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
