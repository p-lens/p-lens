//! A machine of an AT as normalising reads it: its AT, its CZ if it is won
//! through one, its modes and its ベース, refused where they do not make
//! one; the rules the engine plays, each trigger's ceiling in regular games;
//! and each setting's table — the trigger's chance below its ceilings, read
//! back from its published 合算, the CZ's success rate, and the allotment
//! between the modes.

use std::collections::BTreeSet;
use std::num::NonZeroU32;

use pachislot_domain::conditions::PayoutRate;
use pachislot_domain::normalized::{
    AfterEnding, Allotments, AtRules, AtTable, BonusMiss, CeilingAt, Expiry, ForcedCz, Gate,
    ModeRule, PayoutLaw, SideBonusRule, TriggerPayout,
};
use pachislot_domain::probability::{BasisPoints, Probability, ProbabilitySource};
use pachislot_domain::setting_level::{PerSettingLevel, SettingLevel};
use pachislot_domain::spec::{
    At, Base, Component, Cz, Element, Ending, EntityId, Gate as SpecGate, GivenChance, Medals,
    Mode, Redraw, SideBonus, Spec,
};

use crate::at::{Cycle, Odds, after_at, cap_figures_of, cycle, natural_chance, settled};
use crate::error::{ProbabilityProblem, SpecError};
use crate::payout::capped;
use crate::rate::{RateCycle, TriggersPaid, implied_gain, net_over_all};
use crate::side::{chance_below, per_game};

/// What a machine of an AT is made of.
pub(crate) struct AtMachine<'a> {
    at: &'a At,
    cz: Option<&'a Cz>,
    modes: Vec<&'a Mode>,
    endings: Vec<&'a Ending>,
    side: Option<&'a SideBonus>,
    base: Base,
}

fn element_id(element: &Element) -> &EntityId {
    match element {
        Element::Bonus(bonus) => &bonus.id,
        Element::Role(role) => &role.id,
        Element::Replay(replay) => &replay.id,
        Element::At(at) => &at.id,
        Element::Mode(mode) => &mode.id,
        Element::Cz(cz) => &cz.id,
        Element::Watch(watch) => &watch.id,
        Element::Ending(ending) => &ending.id,
        Element::SideBonus(side) => &side.id,
    }
}

/// The trigger's id and ceilings: the CZ's, or the AT's own without one.
fn trigger_of<'a>(
    at: &'a At,
    cz: Option<&'a Cz>,
) -> (&'a EntityId, Option<NonZeroU32>, Option<NonZeroU32>) {
    cz.map_or((&at.id, at.ceiling, at.reset_ceiling), |cz| {
        (&cz.id, cz.ceiling, cz.reset_ceiling)
    })
}

/// The trigger's ceilings counted in the machine's unit: the CZ's, or the
/// AT's own without one.
fn trigger_units_of(at: &At, cz: Option<&Cz>) -> (Option<NonZeroU32>, Option<NonZeroU32>) {
    cz.map_or((at.unit_ceiling, at.reset_unit_ceiling), |cz| {
        (cz.unit_ceiling, cz.reset_unit_ceiling)
    })
}

/// The AT間天井 counted in the machine's unit, after an AT and after a
/// setting change, where a CZ brings the AT.
fn at_units_of(at: &At, cz: Option<&Cz>) -> (Option<NonZeroU32>, Option<NonZeroU32>) {
    cz.map_or((None, None), |_| {
        (at.unit_ceiling, at.reset_unit_ceiling.or(at.unit_ceiling))
    })
}

/// The entity of a machine with a ceiling counted in its unit, if any.
pub(crate) fn unit_counted(machine: &AtMachine<'_>) -> Option<EntityId> {
    let at = machine.at;
    let counts =
        |unit: Option<NonZeroU32>, reset: Option<NonZeroU32>| unit.is_some() || reset.is_some();
    if counts(at.unit_ceiling, at.reset_unit_ceiling) {
        return Some(at.id.clone());
    }
    if let Some(cz) = machine
        .cz
        .filter(|cz| counts(cz.unit_ceiling, cz.reset_unit_ceiling))
    {
        return Some(cz.id.clone());
    }
    machine
        .modes
        .iter()
        .find(|mode| counts(mode.unit_ceiling, mode.at_unit_ceiling))
        .map(|mode| mode.id.clone())
}

/// How a machine's ceilings become regular games: those counted on its
/// screen at `screen` of it a regular game, those in its unit at `unit` of
/// it; and whether the unit stands for every trigger ceiling, as a spec
/// with a unit and no ceiling counted in it was written — `ceiling` then
/// counting the unit.
#[derive(Clone, Copy)]
pub(crate) struct Scales {
    pub(crate) screen: Option<f64>,
    pub(crate) unit: Option<f64>,
    pub(crate) whole_unit: bool,
}

impl Scales {
    /// A trigger's ceiling in regular games: what it says in games — on the
    /// screen, or in the unit for a spec written so — or in the unit,
    /// whichever comes first.
    fn trigger(self, games: Option<NonZeroU32>, units: Option<NonZeroU32>) -> Option<NonZeroU32> {
        let rate = if self.whole_unit {
            self.unit
        } else {
            self.screen
        };
        earliest(
            games.map(|games| in_regular_games(games, rate)),
            units
                .zip(self.unit)
                .map(|(units, rate)| in_regular_games(units, Some(rate))),
        )
    }

    /// An AT間天井 in regular games: what it says in games, or in the unit,
    /// whichever comes first.
    fn at(self, games: Option<NonZeroU32>, units: Option<NonZeroU32>) -> Option<NonZeroU32> {
        earliest(
            games,
            units
                .zip(self.unit)
                .map(|(units, rate)| in_regular_games(units, Some(rate))),
        )
    }
}

/// The sooner of two ceilings, where either is.
fn earliest(one: Option<NonZeroU32>, other: Option<NonZeroU32>) -> Option<NonZeroU32> {
    match (one, other) {
        (Some(one), Some(other)) => Some(one.min(other)),
        (one, other) => one.or(other),
    }
}

/// The AT間天井, after an AT and after a setting change: the AT's ceilings
/// where a CZ brings it — without one they are the trigger's — the second
/// the first where a setting change does not shorten it.
fn at_ceilings_of(at: &At, cz: Option<&Cz>) -> (Option<NonZeroU32>, Option<NonZeroU32>) {
    cz.map_or((None, None), |_| {
        (at.ceiling, at.reset_ceiling.or(at.ceiling))
    })
}

/// Whether a machine without modes plays a mode of its own after a setting
/// change: where a setting change shortens the trigger's ceiling or, on a
/// machine a CZ brings the AT on, the AT間天井 or the CZ's ceiling counted
/// from the AT.
fn resets(at: &At, cz: Option<&Cz>) -> bool {
    let (_, _, reset_ceiling) = trigger_of(at, cz);
    let (_, reset_units) = trigger_units_of(at, cz);
    reset_ceiling.is_some()
        || reset_units.is_some()
        || cz.is_some_and(|cz| {
            at.reset_ceiling.is_some()
                || at.reset_unit_ceiling.is_some()
                || cz.reset_since_at_ceiling.is_some()
        })
}

/// An AT's medals given one way: its average, its sets with their 継続率,
/// its table, or the 機械割 they are to follow from with its 純増 — and
/// only one of them; a set and a game of the AT pay something; and only a
/// machine with a cap has a window or starts again on reaching it.
fn paid(at: &At, cap: Option<Medals>) -> Result<(), SpecError> {
    let given = [
        at.payout.map(|_| Component::Payout),
        at.sets.map(|_| Component::Sets),
        at.payout_table.as_ref().map(|_| Component::PayoutTable),
        at.rate.as_ref().map(|_| Component::Rate),
    ];
    let mut ways = given.into_iter().flatten();
    let first = ways.next();
    if let (Some(first), Some(second)) = (first, ways.next()) {
        return Err(SpecError::ConflictingComponents {
            entity: at.id.clone(),
            first,
            second,
        });
    }
    let missing = |component| SpecError::MissingComponent {
        entity: at.id.clone(),
        component,
    };
    match (first, &at.continuation_rate) {
        (None, _) => return Err(missing(Component::Payout)),
        (Some(Component::Sets), None) => return Err(missing(Component::ContinuationRate)),
        (Some(component), Some(_)) if component != Component::Sets => {
            return Err(missing(Component::Sets));
        }
        (Some(Component::Rate), _) if at.net_per_game.is_none() => {
            return Err(missing(Component::NetPerGame));
        }
        (Some(_), _) => {}
    }
    if at.net_per_game.is_none() && !at.other_net.is_empty() {
        return Err(missing(Component::NetPerGame));
    }
    let nets = at
        .net_per_game
        .into_iter()
        .chain(at.other_net.iter().map(|other| other.net));
    if nets.into_iter().any(|net| net.get() <= 0.0) {
        return Err(SpecError::EmptyNetPerGame {
            entity: at.id.clone(),
        });
    }
    let shared: u32 = at.other_net.iter().map(|other| other.share.get()).sum();
    if shared > BasisPoints::WHOLE.get() || at.other_net.iter().any(|other| other.share.get() == 0)
    {
        return Err(SpecError::OtherNetBeyondWhole {
            entity: at.id.clone(),
            sum: shared,
        });
    }
    if at.sets.is_some_and(|sets| sets.set.get() <= 0.0) {
        return Err(SpecError::EmptySet {
            entity: at.id.clone(),
        });
    }
    let needs_cap = [
        at.window.map(|_| Component::Window),
        at.reset_on_cap.then_some(Component::ResetOnCap),
    ];
    match needs_cap.into_iter().flatten().next() {
        Some(component) if cap.is_none() => Err(SpecError::NeedsCap {
            entity: at.id.clone(),
            component,
        }),
        _ => Ok(()),
    }
}

fn checked<'a>(
    at: &'a At,
    cz: Option<&'a Cz>,
    (modes, endings, side): (Vec<&'a Mode>, Vec<&'a Ending>, Option<&'a SideBonus>),
    base: Base,
    cap: Option<Medals>,
) -> Result<AtMachine<'a>, SpecError> {
    paid(at, cap)?;
    if at.ceiling_payout.is_some() && !at.ceiling_triggers {
        return Err(SpecError::CeilingPayoutWithoutCeilingTriggers {
            entity: at.id.clone(),
        });
    }
    ended(&modes, &endings)?;
    allotted(&modes, &endings)?;
    if let Some(cz) = cz {
        if at.chance.is_some() {
            return Err(SpecError::FirstHitBesideCz {
                entity: at.id.clone(),
            });
        }
        if (at.reset_ceiling.is_some() || at.reset_unit_ceiling.is_some()) && !modes.is_empty() {
            return Err(SpecError::ResetCeilingBesideModes {
                entity: at.id.clone(),
            });
        }
        reset_since_at(cz, &modes)?;
        ceiling_triggered(at, cz, &modes)?;
    } else if at.chance.is_none() {
        return Err(SpecError::MissingComponent {
            entity: at.id.clone(),
            component: Component::FirstHit,
        });
    } else if let Some(ceiled) = modes
        .iter()
        .find(|mode| mode.at_ceiling.is_some() || mode.at_unit_ceiling.is_some())
    {
        return Err(SpecError::AtCeilingWithoutCz {
            entity: ceiled.id.clone(),
        });
    } else if at.direct.is_some() {
        return Err(SpecError::DirectWithoutCz {
            entity: at.id.clone(),
        });
    } else if at.ceiling_triggers {
        return Err(SpecError::CeilingTriggersWithoutCz {
            entity: at.id.clone(),
        });
    } else if let Some(through) = modes.iter().find(|mode| mode.misses.is_some()) {
        return Err(SpecError::MissesWithoutCz {
            entity: through.id.clone(),
        });
    }
    direct_bonused(at, cz)?;
    zoned(cz, &modes)?;
    redrawn(cz, &modes)?;
    restarted(cz, &modes)?;
    across_bonuses(at, cz)?;
    let (trigger, ceiling, reset_ceiling) = trigger_of(at, cz);
    let (units, reset_units) = trigger_units_of(at, cz);
    if !modes.is_empty()
        && (ceiling.is_some()
            || reset_ceiling.is_some()
            || units.is_some()
            || reset_units.is_some())
    {
        return Err(SpecError::CeilingBesideModes {
            entity: trigger.clone(),
        });
    }
    if modes.iter().any(|mode| mode.reset_allotment.is_some())
        && let Some(partial) = modes.iter().find(|mode| mode.reset_allotment.is_none())
    {
        return Err(SpecError::ResetAllotmentPartial {
            entity: partial.id.clone(),
        });
    }
    Ok(AtMachine {
        at,
        cz,
        modes,
        endings,
        side,
        base,
    })
}

/// Endings only on a machine of modes, which they allot, and some mode
/// allotted after one of them otherwise than after the rest; a mode
/// allotted after no ending but the machine's.
fn ended(modes: &[&Mode], endings: &[&Ending]) -> Result<(), SpecError> {
    if let Some(ending) = endings.first() {
        if modes.is_empty() {
            return Err(SpecError::EndingWithoutModes {
                entity: ending.id.clone(),
            });
        }
        if modes.iter().all(|mode| mode.ending_allotment.is_empty()) {
            return Err(SpecError::EndingsWithoutAllotment {
                entity: ending.id.clone(),
            });
        }
    }
    modes.iter().try_for_each(|mode| {
        mode.ending_allotment
            .keys()
            .find(|ending| !endings.iter().any(|known| known.id == **ending))
            .map_or(Ok(()), |ending| {
                Err(SpecError::EndingAllotmentToUnknown {
                    entity: mode.id.clone(),
                    ending: ending.clone(),
                })
            })
    })
}

/// Whether every mode is allotted after every way an AT ends, so that its
/// allotment after an AT is not needed for any of them.
fn every_ending_allotted(modes: &[&Mode], endings: &[&Ending]) -> bool {
    !endings.is_empty()
        && modes.iter().all(|mode| {
            endings
                .iter()
                .all(|ending| mode.ending_allotment.contains_key(&ending.id))
        })
}

/// Every mode's allotment after an AT, or — where every mode is allotted
/// after every ending, the endings' mix standing for it — none's.
fn allotted(modes: &[&Mode], endings: &[&Ending]) -> Result<(), SpecError> {
    if every_ending_allotted(modes, endings) && modes.iter().all(|mode| mode.allotment.is_none()) {
        return Ok(());
    }
    modes
        .iter()
        .find(|mode| mode.allotment.is_none())
        .map_or(Ok(()), |mode| {
            Err(SpecError::MissingComponent {
                entity: mode.id.clone(),
                component: Component::Allotment,
            })
        })
}

/// A CZ's ceiling counted from the AT after a setting change only beside
/// the one after an AT, and only on a machine without modes, whose modes
/// carry their own.
fn reset_since_at(cz: &Cz, modes: &[&Mode]) -> Result<(), SpecError> {
    if cz.reset_since_at_ceiling.is_none() {
        return Ok(());
    }
    if !modes.is_empty() {
        return Err(SpecError::ResetSinceAtCeilingBesideModes {
            entity: cz.id.clone(),
        });
    }
    if cz.since_at_ceiling.is_none() {
        return Err(SpecError::ResetSinceAtCeilingWithoutSinceAtCeiling {
            entity: cz.id.clone(),
        });
    }
    Ok(())
}

/// An AT間天井 that brings the trigger only where there is one: the AT's,
/// after an AT or a setting change, in games or in the unit, across the
/// bonuses that start play again, or a mode's; and what the trigger it
/// brings pays only where it brings one, a bonus that pays.
fn ceiling_triggered(at: &At, cz: &Cz, modes: &[&Mode]) -> Result<(), SpecError> {
    let ceiled = at.ceiling.is_some()
        || at.ceiling_across_bonuses.is_some()
        || at.reset_ceiling.is_some()
        || at.unit_ceiling.is_some()
        || at.reset_unit_ceiling.is_some()
        || modes
            .iter()
            .any(|mode| mode.at_ceiling.is_some() || mode.at_unit_ceiling.is_some());
    if at.ceiling_triggers && !ceiled {
        return Err(SpecError::MissingComponent {
            entity: at.id.clone(),
            component: Component::Ceiling,
        });
    }
    if at.ceiling_payout.is_some() && cz.payout.is_none() {
        return Err(SpecError::MissingComponent {
            entity: cz.id.clone(),
            component: Component::Payout,
        });
    }
    Ok(())
}

/// A bonus outright only where a CZ's success brings a bonus for it to be.
fn direct_bonused(at: &At, cz: Option<&Cz>) -> Result<(), SpecError> {
    if at.direct_bonus.is_some() && cz.is_none_or(|cz| cz.bonus_share.is_none()) {
        return Err(SpecError::DirectBonusWithoutBonusShare {
            entity: at.id.clone(),
        });
    }
    Ok(())
}

/// Zones on the modes, or on the CZ of a machine without them, and never
/// two on one game.
fn zoned(cz: Option<&Cz>, modes: &[&Mode]) -> Result<(), SpecError> {
    if let Some(cz) = cz.filter(|cz| !modes.is_empty() && !cz.gates.is_empty()) {
        return Err(SpecError::GatesBesideModes {
            entity: cz.id.clone(),
        });
    }
    cz.map(|cz| (&cz.id, &cz.gates))
        .into_iter()
        .chain(modes.iter().map(|mode| (&mode.id, &mode.gates)))
        .try_for_each(|(entity, gates)| {
            let mut seen = BTreeSet::new();
            gates
                .iter()
                .flat_map(games_of)
                .find(|game| !seen.insert(*game))
                .map_or(Ok(()), |game| {
                    Err(SpecError::GateTwice {
                        entity: entity.clone(),
                        game,
                    })
                })
        })
}

/// The regular games since the AT a zone draws on: its first, and those
/// after it as far as its span reaches.
fn games_of(gate: &SpecGate) -> impl Iterator<Item = NonZeroU32> + use<> {
    let first = gate.game;
    (0..gate.span.map_or(1, NonZeroU32::get)).filter_map(move |offset| first.checked_add(offset))
}

/// A mode's own success rate, its redraw at a missed trigger and its own
/// ceiling counted from the AT need a CZ — to miss, or to be forced; and a
/// redraw goes to the machine's modes and nowhere else.
fn redrawn(cz: Option<&Cz>, modes: &[&Mode]) -> Result<(), SpecError> {
    if cz.is_none()
        && let Some((mode, component)) = modes.iter().find_map(|mode| {
            if mode.success.is_some() {
                Some((mode, Component::Success))
            } else if !mode.redraw.is_empty() {
                Some((mode, Component::Redraw))
            } else if !mode.ceiling_redraw.is_empty() {
                Some((mode, Component::CeilingRedraw))
            } else if mode.since_at_ceiling.is_some() {
                Some((mode, Component::SinceAtCeiling))
            } else {
                None
            }
        })
    {
        return Err(SpecError::NeedsCz {
            entity: mode.id.clone(),
            component,
        });
    }
    if let Some((mode, expiry)) = modes.iter().find_map(|mode| {
        mode.expiry
            .as_ref()
            .filter(|expiry| !modes.iter().any(|other| other.id == expiry.to))
            .map(|expiry| (mode, expiry))
    }) {
        return Err(SpecError::RedrawToUnknown {
            entity: mode.id.clone(),
            to: expiry.to.clone(),
        });
    }
    modes.iter().try_for_each(|mode| {
        mode.redraw
            .iter()
            .chain(&mode.ceiling_redraw)
            .find(|row| !modes.iter().any(|other| other.id == row.to))
            .map_or(Ok(()), |row| {
                Err(SpecError::RedrawToUnknown {
                    entity: mode.id.clone(),
                    to: row.to.clone(),
                })
            })
    })
}

/// Play starts again at a bonus only where a CZ's success brings one, and
/// a ceiling's CZ certainly succeeds only where there is that ceiling, the
/// CZ's or a mode's.
fn restarted(cz: Option<&Cz>, modes: &[&Mode]) -> Result<(), SpecError> {
    let lacking = cz.and_then(|cz| {
        if cz.restart && cz.bonus_share.is_none() {
            Some((cz, Component::BonusShare))
        } else if cz.ceiling_wins
            && cz.since_at_ceiling.is_none()
            && modes.iter().all(|mode| mode.since_at_ceiling.is_none())
        {
            Some((cz, Component::SinceAtCeiling))
        } else {
            None
        }
    });
    lacking.map_or(Ok(()), |(cz, component)| {
        Err(SpecError::MissingComponent {
            entity: cz.id.clone(),
            component,
        })
    })
}

/// An AT間天井 counted across the bonuses that start play again only where
/// a CZ's bonus does: elsewhere nothing starts play again, and the AT間天井
/// is counted from the AT already.
fn across_bonuses(at: &At, cz: Option<&Cz>) -> Result<(), SpecError> {
    if at.ceiling_across_bonuses.is_some() && !cz.is_some_and(|cz| cz.restart) {
        return Err(SpecError::CeilingAcrossBonusesWithoutRestart {
            entity: at.id.clone(),
        });
    }
    Ok(())
}

/// The side bonuses among a machine's elements.
fn side_bonuses(elements: &[Element]) -> Vec<&SideBonus> {
    elements
        .iter()
        .filter_map(|element| match element {
            Element::SideBonus(side) => Some(side),
            _ => None,
        })
        .collect()
}

/// A machine of an AT, if the spec is one: its AT, its CZ, its modes and its
/// ベース, and nothing else. None for a machine of bonuses and small wins.
pub(crate) fn at_machine<'a>(
    spec: &Spec,
    elements: &'a [Element],
) -> Result<Option<AtMachine<'a>>, SpecError> {
    let ats: Vec<&At> = elements
        .iter()
        .filter_map(|element| match element {
            Element::At(at) => Some(at),
            _ => None,
        })
        .collect();
    let czs: Vec<&Cz> = elements
        .iter()
        .filter_map(|element| match element {
            Element::Cz(cz) => Some(cz),
            _ => None,
        })
        .collect();
    let modes: Vec<&Mode> = elements
        .iter()
        .filter_map(|element| match element {
            Element::Mode(mode) => Some(mode),
            _ => None,
        })
        .collect();
    let endings: Vec<&Ending> = elements
        .iter()
        .filter_map(|element| match element {
            Element::Ending(ending) => Some(ending),
            _ => None,
        })
        .collect();
    let sides = side_bonuses(elements);
    let Some(at) = ats.first().copied() else {
        if let Some(side) = sides.first() {
            return Err(SpecError::SideBonusWithoutAt {
                entity: side.id.clone(),
            });
        }
        if let Some(cz) = czs.first() {
            return Err(SpecError::CzWithoutAt {
                entity: cz.id.clone(),
            });
        }
        if let Some(mode) = modes.first() {
            return Err(SpecError::ModeWithoutAt {
                entity: mode.id.clone(),
            });
        }
        if let Some(ending) = endings.first() {
            return Err(SpecError::EndingWithoutModes {
                entity: ending.id.clone(),
            });
        }
        if spec.resources.cap.is_some() {
            return Err(SpecError::CapWithoutAt);
        }
        return spec
            .resources
            .base
            .map_or(Ok(None), |_| Err(SpecError::BaseWithoutAt));
    };
    let base = spec.resources.base.ok_or(SpecError::MissingBase)?;
    let cz = czs.first().copied();
    let stray = elements.iter().find(|element| match element {
        Element::At(other) => other.id != at.id,
        Element::Cz(other) => cz.is_some_and(|cz| other.id != cz.id),
        Element::Mode(_)
        | Element::Role(_)
        | Element::Replay(_)
        | Element::Watch(_)
        | Element::Ending(_)
        | Element::SideBonus(_) => false,
        Element::Bonus(_) => true,
    });
    if let Some(other) = stray {
        return Err(SpecError::AtNotAlone {
            entity: element_id(other).clone(),
        });
    }
    if let Some(paid) = elements.iter().find_map(|element| match element {
        Element::Role(role) if role.payout.is_some() => Some(&role.id),
        _ => None,
    }) {
        return Err(SpecError::PayoutBesideAt {
            entity: paid.clone(),
        });
    }
    if let Some(second) = sides.get(1) {
        return Err(SpecError::SideBonusNotAlone {
            entity: second.id.clone(),
        });
    }
    checked(
        at,
        cz,
        (modes, endings, sides.first().copied()),
        base,
        spec.resources.cap,
    )
    .map(Some)
}

/// A ceiling counted on a screen or in another unit, in the regular games
/// it comes after on average, `rate` of the unit a game: rounded up, and
/// never under one. As it is where the ceiling counts regular games.
fn in_regular_games(ceiling: NonZeroU32, rate: Option<f64>) -> NonZeroU32 {
    let Some(rate) = rate else {
        return ceiling;
    };
    #[allow(
        clippy::cast_possible_truncation,
        clippy::cast_sign_loss,
        reason = "a ceiling over a positive rate is positive, and kept within what a game count holds"
    )]
    let games = (f64::from(ceiling.get()) / rate)
        .ceil()
        .min(f64::from(u32::MAX)) as u32;
    NonZeroU32::new(games).unwrap_or(NonZeroU32::MIN)
}

/// The id of the mode a machine without modes plays after a setting change.
fn reset_mode(trigger: &EntityId) -> EntityId {
    EntityId::new(&format!("{}:reset", trigger.as_str())).unwrap_or_else(|| trigger.clone())
}

/// The rules the engine plays: the trigger's ceilings by mode — the
/// machine's own modes, or one at the trigger's ceiling and one at its
/// ceilings after a setting change, the trigger's where a setting change
/// leaves it be — counted on the screen or in another unit where the
/// machine says so, at `ceiling_rate` of it a regular game; each
/// mode's AT間天井 in regular games, its own or the AT's; the スルー天井;
/// and each mode's ceiling counted from the AT, its own or the CZ's — the
/// CZ's after a setting change in the mode a setting change plays.
pub(crate) fn rules_of(machine: &AtMachine<'_>, scales: Scales, cap: Option<Medals>) -> AtRules {
    let misses = machine.cz.and_then(|cz| cz.misses);
    let since_at_ceiling = machine.cz.and_then(|cz| cz.since_at_ceiling);
    let reset_since_at_ceiling = machine
        .cz
        .and_then(|cz| cz.reset_since_at_ceiling)
        .or(since_at_ceiling);
    let rule = |id: &EntityId,
                ceiling: Option<NonZeroU32>,
                at_ceiling: Option<NonZeroU32>,
                misses: Option<NonZeroU32>,
                since_at_ceiling: Option<NonZeroU32>| ModeRule {
        id: id.clone(),
        ceiling,
        at_ceiling,
        misses,
        since_at_ceiling,
        expiry: None,
    };
    let (trigger, ceiling, reset_ceiling) = trigger_of(machine.at, machine.cz);
    let (units, reset_units) = trigger_units_of(machine.at, machine.cz);
    let (at_ceiling, reset_at_ceiling) = at_ceilings_of(machine.at, machine.cz);
    let (at_units, reset_at_units) = at_units_of(machine.at, machine.cz);
    let modes = if machine.modes.is_empty() {
        [rule(
            trigger,
            scales.trigger(ceiling, units),
            scales.at(at_ceiling, at_units),
            misses,
            since_at_ceiling,
        )]
        .into_iter()
        .chain(resets(machine.at, machine.cz).then(|| {
            rule(
                &reset_mode(trigger),
                scales.trigger(reset_ceiling.or(ceiling), reset_units.or(units)),
                scales.at(reset_at_ceiling, reset_at_units),
                misses,
                reset_since_at_ceiling,
            )
        }))
        .collect()
    } else {
        machine
            .modes
            .iter()
            .map(|mode| ModeRule {
                expiry: mode.expiry.as_ref().and_then(|expiry| {
                    machine
                        .modes
                        .iter()
                        .position(|to| to.id == expiry.to)
                        .map(|to| Expiry {
                            games: expiry.games,
                            to,
                        })
                }),
                ..rule(
                    &mode.id,
                    scales.trigger(mode.ceiling, mode.unit_ceiling),
                    scales.at(
                        mode.at_ceiling.or(at_ceiling),
                        mode.at_unit_ceiling.or(at_units),
                    ),
                    mode.misses.or(misses),
                    mode.since_at_ceiling.or(since_at_ceiling),
                )
            })
            .collect()
    };
    AtRules {
        base: machine.base,
        at: machine.at.id.clone(),
        trigger: machine.cz.map(|cz| cz.id.clone()),
        modes,
        net_per_game: net_of(machine.at),
        cap,
        window: machine.at.window,
        reset_on_cap: machine.at.reset_on_cap,
        trigger_is_bonus: machine.cz.is_some_and(|cz| cz.bonus),
        trigger_payout: machine.cz.and_then(trigger_payout_of),
        bonus_miss: if machine.cz.is_some_and(|cz| cz.restart) {
            BonusMiss::Restarts
        } else {
            BonusMiss::Counted
        },
        forced_cz: if machine.cz.is_some_and(|cz| cz.ceiling_wins) {
            ForcedCz::Wins
        } else {
            ForcedCz::Drawn
        },
        ceiling_at: ceiling_at_of(machine.at),
        ceiling_across_bonuses: machine.at.ceiling_across_bonuses,
        ceiling_payout: machine.at.ceiling_payout,
        endings: endings_of(machine),
        side_bonus: machine.side.map(side_rule),
    }
}

/// What a trigger pays each time it comes, where it is a bonus whose
/// medals are known.
fn trigger_payout_of(cz: &Cz) -> Option<TriggerPayout> {
    cz.payout.map(|medals| TriggerPayout {
        medals,
        net_per_game: cz.net_per_game,
    })
}

/// A side bonus as the engine plays it.
fn side_rule(side: &SideBonus) -> SideBonusRule {
    SideBonusRule {
        id: side.id.clone(),
        ceiling: side.ceiling,
        payout: TriggerPayout {
            medals: side.payout,
            net_per_game: side.net_per_game,
        },
    }
}

/// The ways the machine's AT ends, in the order made.
fn endings_of(machine: &AtMachine<'_>) -> Vec<EntityId> {
    machine
        .endings
        .iter()
        .map(|ending| ending.id.clone())
        .collect()
}

/// How an AT's AT間天井 wins it: by the trigger it brings, where the AT
/// says so, and outright otherwise.
fn ceiling_at_of(at: &At) -> CeilingAt {
    if at.ceiling_triggers {
        CeilingAt::Triggered
    } else {
        CeilingAt::Outright
    }
}

/// Every mode with a CZ's ceiling counted from the AT has an AT間天井 at it
/// or beyond, so that a cycle is followed to its end; on the same game the
/// AT is won, as an AT間天井 wins it.
pub(crate) fn check_since_at(rules: &AtRules) -> Result<(), SpecError> {
    if rules.restarts() || rules.ceiling_wins() {
        return Ok(());
    }
    let unbounded = rules.modes.iter().any(|mode| {
        mode.since_at_ceiling.is_some_and(|since_at| {
            mode.at_ceiling
                .is_none_or(|at_ceiling| at_ceiling < since_at)
        })
    });
    match (unbounded, rules.trigger.as_ref()) {
        (true, Some(trigger)) => Err(SpecError::SinceAtCeilingBeyondAtCeiling {
            entity: trigger.clone(),
        }),
        _ => Ok(()),
    }
}

/// Shares under a setting, one for each entity that gives them, as they
/// were given, and what they come to.
fn points_of(
    given: &[(&EntityId, &PerSettingLevel<BasisPoints>)],
    setting_level: SettingLevel,
) -> Result<(Vec<BasisPoints>, u32), SpecError> {
    let points = given
        .iter()
        .map(|(id, shares)| {
            shares
                .get(setting_level)
                .copied()
                .ok_or_else(|| SpecError::MissingSettingLevel {
                    at: (*id).clone(),
                    setting_level,
                })
        })
        .collect::<Result<Vec<_>, _>>()?;
    let sum = points.iter().map(|share| share.get()).sum();
    Ok((points, sum))
}

fn fractions(points: &[BasisPoints]) -> Vec<f64> {
    points
        .iter()
        .map(|share| share.probability().value())
        .collect()
}

/// One allotment's shares under a setting, mode by mode, as fractions of one.
fn shares(
    allotments: &[(&EntityId, &PerSettingLevel<BasisPoints>)],
    setting_level: SettingLevel,
    after_reset: bool,
) -> Result<Vec<f64>, SpecError> {
    let (points, sum) = points_of(allotments, setting_level)?;
    if sum != BasisPoints::WHOLE.get() {
        return Err(SpecError::AllotmentNotWhole {
            setting_level,
            after_reset,
            sum,
        });
    }
    Ok(fractions(&points))
}

/// Each ending's share of ATs under a setting and how the modes are
/// allotted after an AT that ended so — each mode's own allotment after
/// it, or its `allotment` — in the order of the endings; none where the
/// machine has none.
fn after_endings_of(
    machine: &AtMachine<'_>,
    setting_level: SettingLevel,
) -> Result<Vec<AfterEnding>, SpecError> {
    if machine.endings.is_empty() {
        return Ok(Vec::new());
    }
    let given: Vec<_> = machine
        .endings
        .iter()
        .map(|ending| (&ending.id, &ending.share))
        .collect();
    let (points, sum) = points_of(&given, setting_level)?;
    if sum != BasisPoints::WHOLE.get() {
        return Err(SpecError::EndingsNotWhole { setting_level, sum });
    }
    machine
        .endings
        .iter()
        .zip(fractions(&points))
        .map(|(ending, share)| {
            let allotted = machine
                .modes
                .iter()
                .map(|mode| {
                    mode.ending_allotment
                        .get(&ending.id)
                        .or(mode.allotment.as_ref())
                        .map(|allotment| (&mode.id, allotment))
                        .ok_or_else(|| SpecError::MissingComponent {
                            entity: mode.id.clone(),
                            component: Component::Allotment,
                        })
                })
                .collect::<Result<Vec<_>, _>>()?;
            let (after, sum) = points_of(&allotted, setting_level)?;
            if sum != BasisPoints::WHOLE.get() {
                return Err(SpecError::EndingAllotmentNotWhole {
                    ending: ending.id.clone(),
                    setting_level,
                    sum,
                });
            }
            Ok(AfterEnding {
                share,
                after_at: fractions(&after),
            })
        })
        .collect()
}

/// An allotment after an AT given beside one after every ending, which
/// then says nothing they do not: each mode's within a basis point of the
/// endings' mix, a share rounded as it was typed.
fn as_mixed(
    given: &[(&EntityId, &PerSettingLevel<BasisPoints>)],
    mix: &[f64],
    setting_level: SettingLevel,
) -> Result<(), SpecError> {
    let (points, _) = points_of(given, setting_level)?;
    let whole = f64::from(BasisPoints::WHOLE.get());
    given
        .iter()
        .zip(points)
        .zip(mix)
        .find(|((_, points), mixed)| (f64::from(points.get()) - *mixed * whole).abs() >= 1.0)
        .map_or(Ok(()), |(((entity, _), _), mixed)| {
            #[allow(
                clippy::cast_possible_truncation,
                clippy::cast_sign_loss,
                reason = "a share of the whole in basis points is within a u32"
            )]
            let mix = (*mixed * whole).round() as u32;
            Err(SpecError::AllotmentAgainstEndings {
                entity: (*entity).clone(),
                setting_level,
                mix,
            })
        })
}

/// Each ending's allotment weighed by its share: how play is allotted
/// after an AT however it ended.
fn mixed(after_endings: &[AfterEnding], modes: usize) -> Vec<f64> {
    after_endings.iter().fold(vec![0.0; modes], |sum, ended| {
        sum.iter()
            .zip(&ended.after_at)
            .map(|(sum, share)| sum + ended.share * share)
            .collect()
    })
}

/// How a setting allots play between the modes, after an AT and after a
/// setting change — after an AT, where the modes are allotted by how it
/// ended, each ending's allotment weighed by its share, and each kept
/// beside. A machine without modes is always in its one mode, or after a
/// setting change in the mode of its shorter ceilings.
fn allotments_of(
    machine: &AtMachine<'_>,
    setting_level: SettingLevel,
) -> Result<Allotments, SpecError> {
    if machine.modes.is_empty() {
        return Ok(if resets(machine.at, machine.cz) {
            Allotments {
                after_at: vec![1.0, 0.0],
                after_reset: vec![0.0, 1.0],
                after_endings: Vec::new(),
            }
        } else {
            Allotments {
                after_at: vec![1.0],
                after_reset: vec![1.0],
                after_endings: Vec::new(),
            }
        });
    }
    let given: Option<Vec<_>> = machine
        .modes
        .iter()
        .map(|mode| {
            mode.allotment
                .as_ref()
                .map(|allotment| (&mode.id, allotment))
        })
        .collect();
    let after_reset: Vec<_> = machine
        .modes
        .iter()
        .filter_map(|mode| {
            mode.reset_allotment
                .as_ref()
                .map(|allotment| (&mode.id, allotment))
        })
        .collect();
    let after_endings = after_endings_of(machine, setting_level)?;
    let mix = mixed(&after_endings, machine.modes.len());
    let plain = match given {
        Some(given) => {
            let plain = shares(&given, setting_level, false)?;
            if every_ending_allotted(&machine.modes, &machine.endings) {
                as_mixed(&given, &mix, setting_level)?;
            }
            plain
        }
        None => mix.clone(),
    };
    let after_reset = if after_reset.is_empty() {
        plain.clone()
    } else {
        shares(&after_reset, setting_level, true)?
    };
    let after_at = if after_endings.is_empty() { plain } else { mix };
    Ok(Allotments {
        after_at,
        after_reset,
        after_endings,
    })
}

fn problem(
    at: &EntityId,
    setting_level: SettingLevel,
) -> impl Fn(pachislot_domain::probability::ProbabilityError) -> SpecError + '_ {
    move |error| SpecError::InvalidProbability {
        at: at.clone(),
        setting_level,
        problem: match error {
            pachislot_domain::probability::ProbabilityError::NotFinite => {
                ProbabilityProblem::NotFinite
            }
            pachislot_domain::probability::ProbabilityError::OutOfRange => {
                ProbabilityProblem::OutOfRange
            }
        },
    }
}

/// The trigger's chance under a setting as the sheet gives it: its 合算,
/// ceilings included, to be read back to a chance below them, or that
/// chance itself, taken as it is.
#[derive(Clone, Copy)]
enum Given {
    Published(f64),
    Below(f64),
}

/// The trigger's chance under a setting as given, the chance a trigger
/// wins the AT, and the share of triggers that pay its medals: those that
/// succeed where a CZ's success brings a bonus, which wins the AT at its
/// own share, and every one otherwise.
fn published(
    machine: &AtMachine<'_>,
    setting_level: SettingLevel,
) -> Result<(EntityId, Given, f64, f64), SpecError> {
    let (id, given, success): (
        &EntityId,
        Option<&GivenChance>,
        Option<&PerSettingLevel<BasisPoints>>,
    ) = match machine.cz {
        Some(cz) => (&cz.id, Some(&cz.chance), Some(&cz.success)),
        None => (&machine.at.id, machine.at.chance.as_ref(), None),
    };
    let missing = || SpecError::MissingSettingLevel {
        at: id.clone(),
        setting_level,
    };
    let value = given
        .and_then(|given| given.values().get(setting_level))
        .ok_or_else(missing)?
        .probability()
        .map_err(problem(id, setting_level))?
        .value();
    let chance = match given {
        Some(GivenChance::Below(_)) => Given::Below(value),
        _ => Given::Published(value),
    };
    let success = match success {
        Some(success) => success
            .get(setting_level)
            .ok_or_else(missing)?
            .probability()
            .value(),
        None => 1.0,
    };
    let bonus_share = match machine.cz.and_then(|cz| cz.bonus_share.as_ref()) {
        Some(share) => Some(
            share
                .get(setting_level)
                .ok_or_else(missing)?
                .probability()
                .value(),
        ),
        None => None,
    };
    Ok(match bonus_share {
        Some(share) => (id.clone(), chance, success * share, success),
        None => (id.clone(), chance, success, 1.0),
    })
}

/// How often a regular game wins an AT outright under a setting, before
/// its CZ is drawn, and how often it brings the bonus a CZ's success brings
/// outright: none where only the CZ wins it. The AT is drawn first, at its
/// own chance, then the bonus at its chance of what is left, winning the
/// AT at the bonus's share — so the AT outright is both together, and the
/// bonus is its chance of what the AT left.
fn direct_of(
    at: &At,
    setting_level: SettingLevel,
    bonus_share: f64,
) -> Result<(Probability, Probability), SpecError> {
    let under = |chances: Option<&PerSettingLevel<ProbabilitySource>>| {
        chances.map_or(Ok(Probability::NONE), |chances| {
            chances
                .get(setting_level)
                .ok_or_else(|| SpecError::MissingSettingLevel {
                    at: at.id.clone(),
                    setting_level,
                })?
                .probability()
                .map_err(problem(&at.id, setting_level))
        })
    };
    let direct = under(at.direct.as_ref())?;
    if at.direct_bonus.is_none() {
        return Ok((direct, Probability::NONE));
    }
    let bonus = (1.0 - direct.value()) * under(at.direct_bonus.as_ref())?.value();
    let outright = direct.value() + bonus * bonus_share;
    Ok((
        Probability::new(outright).map_err(problem(&at.id, setting_level))?,
        Probability::new(bonus).map_err(problem(&at.id, setting_level))?,
    ))
}

/// The side bonus's chance a regular game below its ceiling under a
/// setting: as given, or read back from its published 合算; none where the
/// machine has no side bonus.
/// The most misses since the AT a meter's chances are told apart over:
/// past them, the last holds.
const METER_COUNTS: usize = 64;

/// Where the trigger has a meter: the chance the trigger after so many
/// misses since the AT comes with the meter full, among play that has
/// missed them all. Each miss short of full adds a gain at its share, or
/// nothing; a meter filled makes the next trigger certainly win, so play
/// that misses again had one short of full. None where it has no meter.
fn meter_wins_of(
    machine: &AtMachine<'_>,
    setting_level: SettingLevel,
) -> Result<Vec<f64>, SpecError> {
    let Some((cz, meter)) = machine
        .cz
        .and_then(|cz| cz.meter.as_ref().map(|meter| (cz, meter)))
    else {
        return Ok(Vec::new());
    };
    let gains = meter
        .gains
        .iter()
        .map(|gain| {
            gain.share
                .get(setting_level)
                .map(|share| (gain.points.get() as usize, share))
                .ok_or_else(|| SpecError::MissingSettingLevel {
                    at: cz.id.clone(),
                    setting_level,
                })
        })
        .collect::<Result<Vec<_>, _>>()?;
    let sum: u32 = gains.iter().map(|(_, share)| share.get()).sum();
    if sum > BasisPoints::WHOLE.get() {
        return Err(SpecError::MeterGainsOverWhole {
            entity: cz.id.clone(),
            setting_level,
            sum,
        });
    }
    let full = meter.full.get() as usize;
    let none = 1.0 - f64::from(sum) / f64::from(BasisPoints::WHOLE.get());
    let filled = |levels: &[f64]| -> Vec<f64> {
        levels
            .iter()
            .enumerate()
            .fold(vec![0.0; full + 1], |mut next, (level, mass)| {
                if let Some(stay) = next.get_mut(level) {
                    *stay += mass * none;
                }
                for (points, share) in &gains {
                    if let Some(to) = next.get_mut((level + points).min(full)) {
                        *to += mass * share.probability().value();
                    }
                }
                next
            })
    };
    let (wins, _) = (1..METER_COUNTS).fold(
        (vec![0.0], {
            let mut start = vec![0.0; full];
            if let Some(empty) = start.first_mut() {
                *empty = 1.0;
            }
            start
        }),
        |(mut wins, levels), _| {
            let next = filled(&levels);
            let full_share = next.get(full).copied().unwrap_or(0.0);
            wins.push(full_share);
            let short = 1.0 - full_share;
            if short <= f64::EPSILON {
                return (wins, levels);
            }
            let levels = next.iter().take(full).map(|mass| mass / short).collect();
            (wins, levels)
        },
    );
    Ok(settled_wins(wins))
}

/// A meter's chances with the counts past where they stop changing left
/// off, the last holding for them.
fn settled_wins(wins: Vec<f64>) -> Vec<f64> {
    let kept = wins
        .windows(2)
        .rposition(|pair| matches!(pair, [before, after] if (after - before).abs() > 1e-12))
        .map_or(1, |changed| changed + 2);
    wins.into_iter().take(kept).collect()
}

fn side_chance_of(
    machine: &AtMachine<'_>,
    setting_level: SettingLevel,
) -> Result<Probability, SpecError> {
    let Some(side) = machine.side else {
        return Ok(Probability::NONE);
    };
    let given = side
        .chance
        .values()
        .get(setting_level)
        .ok_or_else(|| SpecError::MissingSettingLevel {
            at: side.id.clone(),
            setting_level,
        })?
        .probability()
        .map_err(problem(&side.id, setting_level))?;
    match side.chance {
        GivenChance::Below(_) => Ok(given),
        GivenChance::Published(_) => chance_below(given.value(), side.ceiling)
            .and_then(|chance| Probability::new(chance).ok())
            .ok_or_else(|| SpecError::FirstHitBeyondCeiling {
                at: side.id.clone(),
                setting_level,
            }),
    }
}

/// Each mode's chance a trigger in it wins the AT under a setting, where
/// any mode has its own: its own, or the CZ's `success` — either through
/// the bonus a CZ's success brings, at the bonus's share.
fn successes_of(
    machine: &AtMachine<'_>,
    setting_level: SettingLevel,
    success: f64,
    share: f64,
) -> Result<Vec<Probability>, SpecError> {
    if machine.modes.iter().all(|mode| mode.success.is_none()) {
        return Ok(Vec::new());
    }
    machine
        .modes
        .iter()
        .map(|mode| {
            let own = match &mode.success {
                Some(own) => {
                    own.get(setting_level)
                        .ok_or_else(|| SpecError::MissingSettingLevel {
                            at: mode.id.clone(),
                            setting_level,
                        })?
                        .probability()
                        .value()
                        * share
                }
                None => success,
            };
            Probability::new(own).map_err(problem(&mode.id, setting_level))
        })
        .collect()
}

/// Each mode's own chance a game brings the trigger under a setting, where
/// any mode has one; none for a mode at the chance read back from the 合算.
fn own_chances_of(
    machine: &AtMachine<'_>,
    setting_level: SettingLevel,
) -> Result<Vec<Option<Probability>>, SpecError> {
    if machine
        .modes
        .iter()
        .all(|mode| mode.trigger_chance.is_none())
    {
        return Ok(Vec::new());
    }
    machine
        .modes
        .iter()
        .map(|mode| {
            mode.trigger_chance
                .as_ref()
                .map(|chance| {
                    chance
                        .get(setting_level)
                        .ok_or_else(|| SpecError::MissingSettingLevel {
                            at: mode.id.clone(),
                            setting_level,
                        })?
                        .probability()
                        .map_err(problem(&mode.id, setting_level))
                })
                .transpose()
        })
        .collect()
}

/// The share of the bonuses a CZ's success brings that win the AT under a
/// setting; all of them where its success wins the AT itself.
fn bonus_share_of(
    machine: &AtMachine<'_>,
    setting_level: SettingLevel,
) -> Result<Probability, SpecError> {
    match machine
        .cz
        .and_then(|cz| cz.bonus_share.as_ref().map(|share| (cz, share)))
    {
        Some((cz, share)) => Ok(share
            .get(setting_level)
            .ok_or_else(|| SpecError::MissingSettingLevel {
                at: cz.id.clone(),
                setting_level,
            })?
            .probability()),
        None => Probability::new(1.0).map_err(problem(&machine.at.id, setting_level)),
    }
}

/// Rows of shares over the modes, one for each mode.
type Rows = Vec<Vec<f64>>;

/// Where a missed trigger moves play under a setting, mode by mode, where
/// any mode says — and where one that came on its mode's ceiling does,
/// where any mode says otherwise for those.
fn redraws_of(
    machine: &AtMachine<'_>,
    setting_level: SettingLevel,
) -> Result<(Rows, Rows), SpecError> {
    let redraws = if machine.modes.iter().all(|mode| mode.redraw.is_empty()) {
        Vec::new()
    } else {
        rows_of(machine, setting_level, |mode| &mode.redraw)?
    };
    let ceiling = if machine
        .modes
        .iter()
        .all(|mode| mode.ceiling_redraw.is_empty())
    {
        Vec::new()
    } else {
        rows_of(machine, setting_level, |mode| {
            if mode.ceiling_redraw.is_empty() {
                &mode.redraw
            } else {
                &mode.ceiling_redraw
            }
        })?
    };
    Ok((redraws, ceiling))
}

/// Each mode's row of shares over the modes under a setting, as `rows`
/// picks them: the whole of them, or play staying where it is.
fn rows_of(
    machine: &AtMachine<'_>,
    setting_level: SettingLevel,
    rows: impl Fn(&Mode) -> &Vec<Redraw>,
) -> Result<Vec<Vec<f64>>, SpecError> {
    machine
        .modes
        .iter()
        .enumerate()
        .map(|(index, mode)| {
            let redraw = rows(mode);
            if redraw.is_empty() {
                return Ok((0..machine.modes.len())
                    .map(|to| if to == index { 1.0 } else { 0.0 })
                    .collect());
            }
            let points = machine
                .modes
                .iter()
                .map(|to| {
                    redraw
                        .iter()
                        .filter(|row| row.to == to.id)
                        .map(|row| {
                            row.share
                                .get(setting_level)
                                .map(|share| share.get())
                                .ok_or_else(|| SpecError::MissingSettingLevel {
                                    at: mode.id.clone(),
                                    setting_level,
                                })
                        })
                        .sum::<Result<u32, SpecError>>()
                })
                .collect::<Result<Vec<u32>, SpecError>>()?;
            let sum: u32 = points.iter().sum();
            if sum != BasisPoints::WHOLE.get() {
                return Err(SpecError::RedrawNotWhole {
                    entity: mode.id.clone(),
                    setting_level,
                    sum,
                });
            }
            Ok(points
                .iter()
                .map(|points| f64::from(*points) / f64::from(BasisPoints::WHOLE.get()))
                .collect())
        })
        .collect()
}

/// A spec's zones under a setting, as the engine draws them.
fn gates_under(
    entity: &EntityId,
    gates: &[SpecGate],
    setting_level: SettingLevel,
) -> Result<Vec<Gate>, SpecError> {
    let missing = || SpecError::MissingSettingLevel {
        at: entity.clone(),
        setting_level,
    };
    gates
        .iter()
        .map(|gate| {
            let trigger = gate.trigger.get(setting_level).ok_or_else(missing)?;
            let at = match &gate.at {
                Some(at) => *at.get(setting_level).ok_or_else(missing)?,
                None => BasisPoints::NONE,
            };
            if trigger.get() + at.get() > BasisPoints::WHOLE.get() {
                return Err(SpecError::GateBeyondWhole {
                    entity: entity.clone(),
                    game: gate.game,
                    setting_level,
                });
            }
            let span = gate.span.map_or(1, NonZeroU32::get);
            let each = |share: BasisPoints| {
                if span == 1 {
                    return Ok(share.probability());
                }
                Probability::new(
                    1.0 - (1.0 - share.probability().value()).powf(1.0 / f64::from(span)),
                )
                .map_err(problem(entity, setting_level))
            };
            let (trigger, at) = (each(*trigger)?, each(at)?);
            Ok(games_of(gate)
                .map(|game| Gate { game, trigger, at })
                .collect::<Vec<_>>())
        })
        .collect::<Result<Vec<_>, _>>()
        .map(|gates| {
            let mut gates: Vec<Gate> = gates.into_iter().flatten().collect();
            gates.sort_by_key(|gate| gate.game);
            gates
        })
}

/// Each mode's zones under a setting, in the order of the rules' modes: a
/// machine's own modes' each, or on one without modes the CZ's in each of
/// its own.
fn gates_of(
    machine: &AtMachine<'_>,
    rules: &AtRules,
    setting_level: SettingLevel,
) -> Result<Vec<Vec<Gate>>, SpecError> {
    if machine.modes.is_empty() {
        let shared = machine.cz.map_or(Ok(Vec::new()), |cz| {
            gates_under(&cz.id, &cz.gates, setting_level)
        })?;
        return Ok(rules.modes.iter().map(|_| shared.clone()).collect());
    }
    machine
        .modes
        .iter()
        .map(|mode| gates_under(&mode.id, &mode.gates, setting_level))
        .collect()
}

/// How an AT's medals under a setting are come to: by a law the spec
/// gives, or from the setting's published 機械割.
enum Paid {
    Law(PayoutLaw),
    FromRate(PayoutRate),
}

/// What an AT gains under a setting: its average, its sets at the
/// setting's 継続率, the setting's table of medals, or what the setting's
/// 機械割 implies.
fn paid_under(at: &At, setting_level: SettingLevel) -> Result<Paid, SpecError> {
    match &at.rate {
        Some(rate) => rate
            .get(setting_level)
            .copied()
            .map(Paid::FromRate)
            .ok_or_else(|| SpecError::MissingSettingLevel {
                at: at.id.clone(),
                setting_level,
            }),
        None => payout_law(at, setting_level).map(Paid::Law),
    }
}

/// The law the spec gives an AT's medals under a setting: its average, its
/// sets at the setting's 継続率, or the setting's table.
fn payout_law(at: &At, setting_level: SettingLevel) -> Result<PayoutLaw, SpecError> {
    let missing = || SpecError::MissingSettingLevel {
        at: at.id.clone(),
        setting_level,
    };
    if let (Some(sets), Some(continuation_rate)) = (at.sets, &at.continuation_rate) {
        let continuation_rate = continuation_rate.get(setting_level).ok_or_else(missing)?;
        if *continuation_rate == BasisPoints::WHOLE {
            return Err(SpecError::EndlessContinuation {
                entity: at.id.clone(),
                setting_level,
            });
        }
        return Ok(PayoutLaw::Sets {
            first: sets.first,
            set: sets.set,
            continuation_rate: continuation_rate.probability(),
        });
    }
    if let Some(table) = &at.payout_table {
        let rows = table.get(setting_level).ok_or_else(missing)?;
        let sum: u32 = rows.iter().map(|row| row.share.get()).sum();
        if sum != BasisPoints::WHOLE.get() {
            return Err(SpecError::PayoutTableNotWhole {
                entity: at.id.clone(),
                setting_level,
                sum,
            });
        }
        return Ok(PayoutLaw::Table(
            rows.iter()
                .map(|row| (row.medals, row.share.probability()))
                .collect(),
        ));
    }
    at.payout
        .map(PayoutLaw::Fixed)
        .ok_or_else(|| SpecError::MissingComponent {
            entity: at.id.clone(),
            component: Component::Payout,
        })
}

/// The 純増 of an AT over all its medals: its own, or with the shares won
/// at another, the one that takes as many games for the same medals.
fn net_of(at: &At) -> Option<Medals> {
    let others: Vec<(f64, f64)> = at
        .other_net
        .iter()
        .map(|other| (other.net.get(), other.share.probability().value()))
        .collect();
    at.net_per_game
        .and_then(|net| net_over_all(net.get(), &others))
        .and_then(Medals::new)
}

/// Turns of settling a chance against the share of ATs that reach the cap
/// at most, where play after one starts as after a setting change.
const SETTLINGS: u32 = 50;

/// The trigger's chance below its ceilings that its published 合算 comes
/// back to over the modes as an AT allots them — and where an AT that
/// reaches the cap starts play again as after a setting change, over the
/// share that do, which itself turns on the chance, so the two are settled
/// against each other until they agree. None where no chance can make it.
fn read_back(
    rules: &AtRules,
    odds: Odds<'_>,
    (allotments, payout): (&Allotments, &PayoutLaw),
    published: f64,
) -> Option<f64> {
    let chance_for = |completion: f64| {
        natural_chance(
            published,
            rules,
            odds,
            &after_at(rules, allotments, completion),
        )
    };
    let first = chance_for(capped(payout, rules.cap.map(Medals::get)).completion)?;
    let settle = |chance: f64| {
        chance_for(cap_figures_of(rules, odds.at_chance(chance), allotments, payout).completion)
    };
    if !rules.reset_on_cap {
        return Some(first);
    }
    (0..SETTLINGS)
        .try_fold(first, |chance, _| match settle(chance) {
            Some(next) if (next - chance).abs() <= f64::EPSILON * chance => Err(Some(next)),
            Some(next) => Ok(next),
            None => Err(None),
        })
        .map_or_else(|stopped| stopped, Some)
}

/// A setting's table: the trigger's chance below its ceilings, as given or
/// read back from its published 合算.
fn table_paying(
    machine: &AtMachine<'_>,
    rules: &AtRules,
    setting_level: SettingLevel,
    payout: PayoutLaw,
) -> Result<AtTable, SpecError> {
    let allotments = allotments_of(machine, setting_level)?;
    let (id, given, success, paid) = published(machine, setting_level)?;
    let gates = gates_of(machine, rules, setting_level)?;
    let bonus_share = bonus_share_of(machine, setting_level)?;
    let (direct, direct_bonus) = direct_of(machine.at, setting_level, bonus_share.value())?;
    let successes = successes_of(machine, setting_level, success, bonus_share.value())?;
    let (redraws, ceiling_redraws) = redraws_of(machine, setting_level)?;
    let own_chances = own_chances_of(machine, setting_level)?;
    let side_chance = side_chance_of(machine, setting_level)?;
    let meter_wins = meter_wins_of(machine, setting_level)?;
    let odds = Odds {
        chance: 0.0,
        success,
        direct: direct.value(),
        gates: &gates,
        successes: &successes,
        redraws: &redraws,
        ceiling_redraws: &ceiling_redraws,
        bonus_share: bonus_share.value(),
        own_chances: &own_chances,
        meter: &meter_wins,
    };
    let beyond = || SpecError::FirstHitBeyondCeiling {
        at: id.clone(),
        setting_level,
    };
    let chance = match given {
        Given::Below(chance) => chance,
        Given::Published(published) => {
            read_back(rules, odds, (&allotments, &payout), published).ok_or_else(beyond)?
        }
    };
    Ok(AtTable {
        chance: Probability::new(chance).map_err(|_| beyond())?,
        success: Probability::new(success).map_err(problem(&id, setting_level))?,
        direct,
        direct_bonus,
        paid: Probability::new(paid).map_err(problem(&id, setting_level))?,
        bonus_share,
        gates,
        successes,
        redraws,
        ceiling_redraws,
        own_chances,
        side_chance,
        meter_wins,
        allotments,
        payout,
    })
}

/// A setting's cycle, from one AT to the next: its regular games, and the
/// triggers it brings.
fn cycle_of(rules: &AtRules, table: &AtTable) -> Cycle {
    let (_, shares) = settled(rules, table);
    cycle(rules, Odds::of(table), &shares)
}

/// A cycle's games and what it costs and pays besides its AT, to work a
/// 機械割 and an AT's gain each from the other under a setting's table: the
/// share of its triggers that pay their medals — and every one the
/// AT間天井 brings, which certainly wins — and the bonuses its games bring
/// outright, past the CZ, each paying as a trigger's does; and the side
/// bonuses its games bring in the long run, each paying its own.
pub(crate) fn rate_cycle(rules: &AtRules, cycle: Cycle, bet: f64, table: &AtTable) -> RateCycle {
    RateCycle {
        games: 1.0 / cycle.at_chance(),
        loss: rules.base.loss_per_game(),
        bet,
        net: rules.net_per_game.map_or(0.0, Medals::get),
        triggers: rules.trigger_payout.map(|payout| TriggersPaid {
            count: (cycle.triggers - cycle.ceiled) * table.paid.value()
                + if rules.ceiling_payout.is_some() {
                    0.0
                } else {
                    cycle.ceiled
                }
                + cycle.direct_bonuses(table.direct_bonus.value()),
            payout,
        }),
        ceiling: rules
            .ceiling_trigger_payout()
            .filter(|_| rules.ceiling_payout.is_some())
            .map(|payout| TriggersPaid {
                count: cycle.ceiled,
                payout,
            }),
        side: rules.side_bonus.as_ref().map(|side| TriggersPaid {
            count: cycle.games * per_game(side, table),
            payout: side.payout,
        }),
    }
}

/// What a setting's 機械割 implies its AT gains: the cycle is read off
/// `unpaid`, the setting's table with an AT that gains nothing — the games between
/// ATs do not turn on what one gains, short of a cap — and the gain that
/// brings the 機械割 over it is the AT's.
fn gain_from(
    machine: &AtMachine<'_>,
    rules: &AtRules,
    bet: f64,
    setting_level: SettingLevel,
    rate: PayoutRate,
    unpaid: &AtTable,
) -> Result<PayoutLaw, SpecError> {
    let unattainable = || SpecError::UnattainableRate {
        entity: machine.at.id.clone(),
        setting_level,
    };
    implied_gain(
        rate_cycle(rules, cycle_of(rules, unpaid), bet, unpaid),
        rate.ratio(),
    )
    .and_then(Medals::new)
    .map(PayoutLaw::Fixed)
    .ok_or_else(unattainable)
}

/// A setting's table, its AT gaining what the spec says or what the
/// setting's 機械割 implies. Where play does not start again as after a
/// setting change once an AT reaches the cap, the trigger's chance is read
/// off the 合算 whatever the AT gains, so the table the gain was found on
/// keeps its chance.
pub(crate) fn table_of(
    machine: &AtMachine<'_>,
    rules: &AtRules,
    bet: f64,
    setting_level: SettingLevel,
) -> Result<AtTable, SpecError> {
    match paid_under(machine.at, setting_level)? {
        Paid::Law(law) => table_paying(machine, rules, setting_level, law),
        Paid::FromRate(rate) => {
            let unpaid = table_paying(
                machine,
                rules,
                setting_level,
                PayoutLaw::Fixed(Medals::NONE),
            )?;
            let payout = gain_from(machine, rules, bet, setting_level, rate, &unpaid)?;
            if rules.reset_on_cap {
                table_paying(machine, rules, setting_level, payout)
            } else {
                Ok(AtTable { payout, ..unpaid })
            }
        }
    }
}

/// Everything a machine of an AT gives per setting, against the settings
/// the machine has: none missing, none it lacks, none twice.
pub(crate) fn coverage(
    machine: &AtMachine<'_>,
    setting_levels: &[SettingLevel],
) -> Result<(), SpecError> {
    let given: Vec<(&EntityId, Vec<SettingLevel>)> = [
        machine
            .at
            .chance
            .as_ref()
            .map(|chance| (&machine.at.id, levels(chance.values()))),
        machine.cz.map(|cz| (&cz.id, levels(cz.chance.values()))),
        machine
            .at
            .direct
            .as_ref()
            .map(|direct| (&machine.at.id, levels(direct))),
        machine
            .at
            .direct_bonus
            .as_ref()
            .map(|direct| (&machine.at.id, levels(direct))),
        machine.cz.map(|cz| (&cz.id, levels(&cz.success))),
        machine
            .cz
            .and_then(|cz| cz.bonus_share.as_ref())
            .zip(machine.cz)
            .map(|(share, cz)| (&cz.id, levels(share))),
        machine
            .at
            .continuation_rate
            .as_ref()
            .map(|continuation_rate| (&machine.at.id, levels(continuation_rate))),
        machine
            .at
            .payout_table
            .as_ref()
            .map(|table| (&machine.at.id, levels(table))),
        machine
            .at
            .rate
            .as_ref()
            .map(|rate| (&machine.at.id, levels(rate))),
        machine
            .side
            .map(|side| (&side.id, levels(side.chance.values()))),
    ]
    .into_iter()
    .flatten()
    .chain(
        machine
            .endings
            .iter()
            .map(|ending| (&ending.id, levels(&ending.share))),
    )
    .chain(machine.modes.iter().flat_map(|mode| {
        [
            mode.allotment.as_ref().map(levels),
            mode.reset_allotment.as_ref().map(levels),
            mode.success.as_ref().map(levels),
            mode.trigger_chance.as_ref().map(levels),
        ]
        .into_iter()
        .flatten()
        .chain(
            mode.redraw
                .iter()
                .chain(&mode.ceiling_redraw)
                .map(|row| levels(&row.share)),
        )
        .chain(mode.ending_allotment.values().map(levels))
        .map(|each| (&mode.id, each))
    }))
    .chain(
        machine
            .cz
            .map(|cz| (&cz.id, &cz.gates))
            .into_iter()
            .chain(machine.modes.iter().map(|mode| (&mode.id, &mode.gates)))
            .flat_map(|(entity, gates)| {
                gates.iter().flat_map(move |gate| {
                    [Some(levels(&gate.trigger)), gate.at.as_ref().map(levels)]
                        .into_iter()
                        .flatten()
                        .map(move |each| (entity, each))
                })
            }),
    )
    .collect();
    given
        .iter()
        .try_for_each(|(at, each)| covered(at, each, setting_levels))
}

/// One thing given per setting, against the settings the machine has:
/// none twice, none it lacks, none missing.
fn covered(
    at: &EntityId,
    each: &[SettingLevel],
    setting_levels: &[SettingLevel],
) -> Result<(), SpecError> {
    let mut seen = BTreeSet::new();
    if let Some(setting_level) = each.iter().find(|level| !seen.insert(**level)) {
        return Err(SpecError::DuplicateSettingLevel {
            at: Some(at.clone()),
            setting_level: *setting_level,
        });
    }
    if let Some(setting_level) = each.iter().find(|level| !setting_levels.contains(level)) {
        return Err(SpecError::UnknownSettingLevel {
            at: at.clone(),
            setting_level: *setting_level,
        });
    }
    setting_levels
        .iter()
        .find(|level| !each.contains(level))
        .map_or(Ok(()), |setting_level| {
            Err(SpecError::MissingSettingLevel {
                at: at.clone(),
                setting_level: *setting_level,
            })
        })
}

fn levels<T>(values: &PerSettingLevel<T>) -> Vec<SettingLevel> {
    values
        .0
        .iter()
        .map(|(setting_level, _)| *setting_level)
        .collect()
}
