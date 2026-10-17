//! Where play stands at a seat, checked against the machine it is on. A
//! seat the machine could not stand at is refused, by what makes it so; a
//! field the machine has no use for — games across bonuses where nothing
//! counts across them, games since a side bonus it lacks or that has no
//! ceiling — is let go of, whatever it says.

use std::num::NonZeroU32;

use pachislot_domain::normalized::{AtRules, NormalizedSpec};
use pachislot_domain::observation::PathStart;

use crate::at::passed_unbrought;
use crate::error::SeatError;

/// The seat as the machine reads it, or what makes it one play cannot
/// stand at.
///
/// # Errors
/// Where play could not stand there: past a forced CZ in every mode it
/// may be in, fewer games since the AT itself than since the last bonus,
/// or at or past a side bonus's ceiling.
pub fn seated(
    spec: &NormalizedSpec,
    rules: &AtRules,
    start: PathStart,
) -> Result<PathStart, SeatError> {
    let start = PathStart {
        since_at_across_bonuses: start
            .since_at_across_bonuses
            .filter(|_| rules.ceiling_across_bonuses.is_some()),
        since_side_bonus: start.since_side_bonus.filter(|_| {
            rules
                .side_bonus
                .as_ref()
                .is_some_and(|side| side.ceiling.is_some())
        }),
        ..start
    };
    if let Some(past) = past_forced(spec, rules, start) {
        return Err(past);
    }
    if let Some(across) = start
        .since_at_across_bonuses
        .filter(|across| *across < start.since_at)
    {
        return Err(SeatError::AcrossBonusesBelowSinceAt {
            since_at: start.since_at,
            across,
        });
    }
    let side_ceiling = rules.side_bonus.as_ref().and_then(|side| side.ceiling);
    if let Some((since, ceiling)) = start
        .since_side_bonus
        .zip(side_ceiling)
        .filter(|(since, ceiling)| *since >= ceiling.get())
    {
        return Err(SeatError::PastSideBonusCeiling { since, ceiling });
    }
    Ok(start)
}

/// Where every mode the seat's allotment reaches under some setting is
/// past the game its ceiling counted from the AT forces a CZ on — the CZ
/// certainly succeeding, or none come since before it — what that makes
/// the seat, at the latest such game; none where some mode leaves play
/// there.
fn past_forced(spec: &NormalizedSpec, rules: &AtRules, start: PathStart) -> Option<SeatError> {
    let reached: Vec<_> = spec
        .tables
        .iter()
        .filter_map(|table| table.at.as_ref())
        .flat_map(|table| {
            rules
                .modes
                .iter()
                .zip(table.allotments.starting(start.after_reset, start.ending))
                .filter(|(_, share)| **share > 0.0)
                .map(|(mode, _)| mode)
        })
        .collect();
    if reached.is_empty()
        || reached
            .iter()
            .any(|mode| !passed_unbrought(rules, mode, start))
    {
        return None;
    }
    let game = reached
        .iter()
        .filter_map(|mode| mode.since_at_ceiling)
        .max()
        .unwrap_or(NonZeroU32::MIN);
    Some(if rules.ceiling_wins() {
        SeatError::PastSureCz { game }
    } else {
        SeatError::PastForcedCz { game }
    })
}
