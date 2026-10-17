//! Where play stands at a seat, checked against the machine it is on. A
//! seat the machine could not stand at is refused, by what makes it so; a
//! seat past a ceiling that brings something certainly — a CZ counted from
//! the AT, a side bonus — stands at the game before it, the ceiling's `+α`
//! being games the cabinet plays out before what it brings shows: it comes
//! on the next game, as an AT does past an AT間天井. A field the machine has
//! no use for — games across bonuses where nothing counts across them,
//! games since a side bonus it lacks or that has no ceiling — is let go of,
//! whatever it says.

use std::num::NonZeroU32;

use pachislot_domain::normalized::{AtRules, NormalizedSpec};
use pachislot_domain::observation::PathStart;

use crate::at::passed_unbrought;
use crate::error::SeatError;

/// The seat as the machine reads it, or what makes it one play cannot
/// stand at.
///
/// # Errors
/// Where play could not stand there: more games since the last CZ than
/// since the last AT, or fewer games since the AT itself than since the
/// last bonus.
pub fn seated(
    spec: &NormalizedSpec,
    rules: &AtRules,
    start: PathStart,
) -> Result<PathStart, SeatError> {
    if start.since_trigger > start.since_at {
        return Err(SeatError::TriggerAboveSinceAt {
            since_trigger: start.since_trigger,
            since_at: start.since_at,
        });
    }
    let side_ceiling = rules
        .side_bonus
        .as_ref()
        .and_then(|side| side.ceiling)
        .map(NonZeroU32::get);
    let start = PathStart {
        since_at_across_bonuses: start
            .since_at_across_bonuses
            .filter(|_| rules.ceiling_across_bonuses.is_some()),
        since_side_bonus: start
            .since_side_bonus
            .zip(side_ceiling)
            .map(|(since, ceiling)| since.min(ceiling - 1)),
        ..start
    };
    if let Some(across) = start
        .since_at_across_bonuses
        .filter(|across| *across < start.since_at)
    {
        return Err(SeatError::AcrossBonusesBelowSinceAt {
            since_at: start.since_at,
            across,
        });
    }
    Ok(forced_game(spec, rules, start).map_or(start, |game| {
        let before = game.get() - 1;
        PathStart {
            since_at: before,
            since_trigger: start.since_trigger.min(before),
            ..start
        }
    }))
}

/// Where every mode the seat's allotment reaches under some setting is
/// past the game its ceiling counted from the AT forces a CZ on — the CZ
/// certainly succeeding, or none come since before it — the latest such
/// game, which play is taken to be just short of; none where some mode
/// leaves play where it is.
fn forced_game(spec: &NormalizedSpec, rules: &AtRules, start: PathStart) -> Option<NonZeroU32> {
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
    reached
        .iter()
        .filter_map(|mode| mode.since_at_ceiling)
        .max()
}
