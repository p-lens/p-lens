//! The systems' view of a machine: queries over its components that assemble
//! each bonus, small win, replay and watch, refusing an entity whose components do
//! not make one — a component missing, two that conflict, or one astray.

use std::collections::{BTreeMap, BTreeSet};
use std::num::NonZeroU32;

use pachislot_domain::probability::ProbabilitySource;
use pachislot_domain::setting_level::PerSettingLevel;
use pachislot_domain::spec::{
    At, Bonus, Chance, Component, Cue, Cz, Element, EntityId, Mode, Part, Replay, Role, Spec, Watch,
};

use crate::error::SpecError;

/// Every entity a component table names, with the table's name.
fn keyed<V>(
    table: &BTreeMap<EntityId, V>,
    component: Component,
) -> impl Iterator<Item = (&EntityId, Component)> {
    table.keys().map(move |entity| (entity, component))
}

fn listed(
    set: &BTreeSet<EntityId>,
    component: Component,
) -> impl Iterator<Item = (&EntityId, Component)> {
    set.iter().map(move |entity| (entity, component))
}

/// Each entity once, and every component on an entity the world has.
fn check_entities(spec: &Spec) -> Result<(), SpecError> {
    let known = spec
        .entities
        .iter()
        .try_fold(BTreeSet::new(), |mut seen, entity| {
            if seen.insert(entity) {
                Ok(seen)
            } else {
                Err(SpecError::DuplicateEntity {
                    entity: entity.clone(),
                })
            }
        })?;
    let components = &spec.components;
    keyed(&components.label, Component::Label)
        .chain(keyed(&components.chance, Component::Chance))
        .chain(keyed(&components.payout, Component::Payout))
        .chain(listed(&components.bonus, Component::Bonus))
        .chain(listed(&components.replay, Component::Replay))
        .chain(keyed(&components.part_of, Component::PartOf))
        .chain(listed(&components.at, Component::At))
        .chain(keyed(&components.first_hit, Component::FirstHit))
        .chain(keyed(&components.ceiling, Component::Ceiling))
        .chain(keyed(&components.reset_ceiling, Component::ResetCeiling))
        .chain(listed(&components.mode, Component::Mode))
        .chain(keyed(&components.allotment, Component::Allotment))
        .chain(keyed(
            &components.reset_allotment,
            Component::ResetAllotment,
        ))
        .chain(keyed(&components.at_ceiling, Component::AtCeiling))
        .chain(listed(&components.cz, Component::Cz))
        .chain(keyed(&components.success, Component::Success))
        .chain(keyed(&components.misses, Component::Misses))
        .chain(keyed(&components.sets, Component::Sets))
        .chain(keyed(
            &components.continuation_rate,
            Component::ContinuationRate,
        ))
        .chain(keyed(&components.payout_table, Component::PayoutTable))
        .chain(keyed(&components.net_per_game, Component::NetPerGame))
        .chain(keyed(&components.other_net, Component::OtherNet))
        .chain(keyed(&components.rate, Component::Rate))
        .chain(keyed(&components.window, Component::Window))
        .chain(listed(&components.reset_on_cap, Component::ResetOnCap))
        .chain(keyed(&components.watch, Component::Watch))
        .chain(keyed(&components.trials, Component::Trials))
        .chain(keyed(&components.cue, Component::Cue))
        .find(|(entity, _)| !known.contains(entity))
        .map_or(Ok(()), |(entity, component)| {
            Err(SpecError::StrayComponent {
                entity: entity.clone(),
                component,
            })
        })
}

/// The components an entity has that say what it is.
fn kinds_of(spec: &Spec, entity: &EntityId) -> Vec<Component> {
    let components = &spec.components;
    [
        components
            .bonus
            .contains(entity)
            .then_some(Component::Bonus),
        components
            .replay
            .contains(entity)
            .then_some(Component::Replay),
        components
            .part_of
            .contains_key(entity)
            .then_some(Component::PartOf),
        components.at.contains(entity).then_some(Component::At),
        components.mode.contains(entity).then_some(Component::Mode),
        components.cz.contains(entity).then_some(Component::Cz),
        components
            .watch
            .contains_key(entity)
            .then_some(Component::Watch),
        components
            .cue
            .contains_key(entity)
            .then_some(Component::Cue),
    ]
    .into_iter()
    .flatten()
    .collect()
}

fn missing(entity: &EntityId, component: Component) -> SpecError {
    SpecError::MissingComponent {
        entity: entity.clone(),
        component,
    }
}

fn conflict(entity: &EntityId, first: Component, second: Component) -> SpecError {
    SpecError::ConflictingComponents {
        entity: entity.clone(),
        first,
        second,
    }
}

fn label_of(spec: &Spec, entity: &EntityId) -> String {
    spec.components
        .label
        .get(entity)
        .cloned()
        .unwrap_or_else(|| entity.as_str().to_owned())
}

fn chance_of(
    spec: &Spec,
    entity: &EntityId,
) -> Result<PerSettingLevel<ProbabilitySource>, SpecError> {
    spec.components
        .chance
        .get(entity)
        .cloned()
        .ok_or_else(|| missing(entity, Component::Chance))
}

/// A part of a bonus: its chance, and nothing that makes it anything else.
fn part_of(spec: &Spec, entity: &EntityId) -> Result<Part, SpecError> {
    if spec.components.payout.contains_key(entity) {
        return Err(conflict(entity, Component::PartOf, Component::Payout));
    }
    Ok(Part {
        id: entity.clone(),
        label: label_of(spec, entity),
        chance: chance_of(spec, entity)?,
    })
}

fn bonus(spec: &Spec, entity: &EntityId) -> Result<Bonus, SpecError> {
    let parts = spec
        .entities
        .iter()
        .filter(|candidate| spec.components.part_of.get(*candidate) == Some(entity))
        .map(|part| part_of(spec, part))
        .collect::<Result<Vec<_>, _>>()?;
    let chance = match (spec.components.chance.get(entity), parts.is_empty()) {
        (Some(whole), true) => Chance::Whole(whole.clone()),
        (None, false) => Chance::Parts(parts),
        (Some(_), false) => return Err(conflict(entity, Component::Chance, Component::PartOf)),
        (None, true) => return Err(missing(entity, Component::Chance)),
    };
    Ok(Bonus {
        id: entity.clone(),
        label: label_of(spec, entity),
        chance,
        payout: spec.components.payout.get(entity).copied(),
    })
}

/// An AT: its 初当たり and payout, its ceilings if it has them, and no chance
/// a regular game of its own, which its 初当たり stands for.
fn at(spec: &Spec, entity: &EntityId) -> Result<At, SpecError> {
    let components = &spec.components;
    if components.chance.contains_key(entity) {
        return Err(conflict(entity, Component::At, Component::Chance));
    }
    Ok(At {
        id: entity.clone(),
        label: label_of(spec, entity),
        first_hit: components.first_hit.get(entity).cloned(),
        payout: components.payout.get(entity).copied(),
        sets: components.sets.get(entity).copied(),
        continuation_rate: components.continuation_rate.get(entity).cloned(),
        payout_table: components.payout_table.get(entity).cloned(),
        net_per_game: components.net_per_game.get(entity).copied(),
        other_net: components
            .other_net
            .get(entity)
            .cloned()
            .unwrap_or_default(),
        rate: components.rate.get(entity).cloned(),
        ceiling: components.ceiling.get(entity).copied(),
        reset_ceiling: components.reset_ceiling.get(entity).copied(),
        window: components.window.get(entity).copied(),
        reset_on_cap: components.reset_on_cap.contains(entity),
    })
}

/// The kind an entity lacks for a component it has that only an AT, a CZ
/// or a mode has: a 初当たり or a ceiling after a reset an AT or a CZ, a
/// ceiling one of the three, an allotment a mode, a success rate or a スルー
/// 天井 a CZ.
fn misplaced(spec: &Spec, entity: &EntityId, kinds: &[Component]) -> Option<Component> {
    let components = &spec.components;
    let at = kinds.contains(&Component::At);
    let mode = kinds.contains(&Component::Mode);
    let cz = kinds.contains(&Component::Cz);
    if !at
        && !cz
        && (components.first_hit.contains_key(entity)
            || components.reset_ceiling.contains_key(entity)
            || (!mode && components.ceiling.contains_key(entity)))
    {
        return Some(Component::At);
    }
    if !at && !cz && components.net_per_game.contains_key(entity) {
        return Some(Component::At);
    }
    if !at
        && (components.sets.contains_key(entity)
            || components.continuation_rate.contains_key(entity)
            || components.payout_table.contains_key(entity)
            || components.other_net.contains_key(entity)
            || components.rate.contains_key(entity)
            || components.window.contains_key(entity)
            || components.reset_on_cap.contains(entity))
    {
        return Some(Component::At);
    }
    if !cz
        && (components.success.contains_key(entity)
            || (!mode && components.misses.contains_key(entity)))
    {
        return Some(Component::Cz);
    }
    if !kinds.contains(&Component::Watch) && components.trials.contains_key(entity) {
        return Some(Component::Watch);
    }
    (!mode
        && (components.allotment.contains_key(entity)
            || components.reset_allotment.contains_key(entity)
            || components.at_ceiling.contains_key(entity)))
    .then_some(Component::Mode)
}

/// A CZ: its published 合算 and success rate, its ceilings and スルー天井 if
/// it has them, and no chance a regular game of its own; what it pays where
/// it is a bonus, with its 純増 only beside medals for it to take games over.
fn cz(spec: &Spec, entity: &EntityId) -> Result<Cz, SpecError> {
    let components = &spec.components;
    if components.chance.contains_key(entity) {
        return Err(conflict(entity, Component::Cz, Component::Chance));
    }
    let payout = components.payout.get(entity).copied();
    let net_per_game = components.net_per_game.get(entity).copied();
    if net_per_game.is_some() && payout.is_none() {
        return Err(missing(entity, Component::Payout));
    }
    if net_per_game.is_some_and(|net| net.get() <= 0.0) {
        return Err(SpecError::EmptyNetPerGame {
            entity: entity.clone(),
        });
    }
    Ok(Cz {
        id: entity.clone(),
        label: label_of(spec, entity),
        first_hit: components
            .first_hit
            .get(entity)
            .cloned()
            .ok_or_else(|| missing(entity, Component::FirstHit))?,
        success: components
            .success
            .get(entity)
            .cloned()
            .ok_or_else(|| missing(entity, Component::Success))?,
        ceiling: components.ceiling.get(entity).copied(),
        reset_ceiling: components.reset_ceiling.get(entity).copied(),
        misses: components.misses.get(entity).copied(),
        payout,
        net_per_game,
    })
}

/// A mode: its allotment, its ceiling and its own AT間天井 if it has them,
/// and nothing a regular game comes up with.
fn mode(spec: &Spec, entity: &EntityId) -> Result<Mode, SpecError> {
    let components = &spec.components;
    if components.chance.contains_key(entity) {
        return Err(conflict(entity, Component::Mode, Component::Chance));
    }
    if components.payout.contains_key(entity) {
        return Err(conflict(entity, Component::Mode, Component::Payout));
    }
    Ok(Mode {
        id: entity.clone(),
        label: label_of(spec, entity),
        ceiling: components.ceiling.get(entity).copied(),
        at_ceiling: components.at_ceiling.get(entity).copied(),
        misses: components.misses.get(entity).copied(),
        allotment: components
            .allotment
            .get(entity)
            .cloned()
            .ok_or_else(|| missing(entity, Component::Allotment))?,
        reset_allotment: components.reset_allotment.get(entity).cloned(),
    })
}

/// A cue of a watch: its chance, and nothing a regular game pays.
fn cue(spec: &Spec, entity: &EntityId) -> Result<Cue, SpecError> {
    if spec.components.payout.contains_key(entity) {
        return Err(conflict(entity, Component::Cue, Component::Payout));
    }
    Ok(Cue {
        id: entity.clone(),
        label: label_of(spec, entity),
        chance: chance_of(spec, entity)?,
    })
}

/// A watch: the bonus it is watched over, its trials, and its cues, at
/// least one; no chance a regular game of its own, nor anything it pays.
fn watch(spec: &Spec, entity: &EntityId, bonus: &EntityId) -> Result<Watch, SpecError> {
    let components = &spec.components;
    if components.chance.contains_key(entity) {
        return Err(conflict(entity, Component::Watch, Component::Chance));
    }
    if components.payout.contains_key(entity) {
        return Err(conflict(entity, Component::Watch, Component::Payout));
    }
    if !components.bonus.contains(bonus) {
        return Err(SpecError::WatchOfNonBonus {
            entity: entity.clone(),
            of: bonus.clone(),
        });
    }
    let cues = spec
        .entities
        .iter()
        .filter(|candidate| components.cue.get(*candidate) == Some(entity))
        .map(|each| cue(spec, each))
        .collect::<Result<Vec<_>, _>>()?;
    if cues.is_empty() {
        return Err(missing(entity, Component::Cue));
    }
    Ok(Watch {
        id: entity.clone(),
        label: label_of(spec, entity),
        bonus: bonus.clone(),
        trials: components
            .trials
            .get(entity)
            .copied()
            .unwrap_or(NonZeroU32::MIN),
        cues,
    })
}

/// What an entity is, by its components; `None` for a part, which is read
/// with its bonus, and for a cue, read with its watch.
fn element_of(spec: &Spec, entity: &EntityId) -> Result<Option<Element>, SpecError> {
    let components = &spec.components;
    let kinds = kinds_of(spec, entity);
    if let Some(component) = misplaced(spec, entity, &kinds) {
        return Err(missing(entity, component));
    }
    match kinds.as_slice() {
        [first, second, ..] => Err(conflict(entity, *first, *second)),
        [Component::At] => at(spec, entity).map(|at| Some(Element::At(at))),
        [Component::Mode] => mode(spec, entity).map(|mode| Some(Element::Mode(mode))),
        [Component::Cz] => cz(spec, entity).map(|cz| Some(Element::Cz(cz))),
        [Component::Watch] => match components.watch.get(entity) {
            Some(bonus) => watch(spec, entity, bonus).map(|watch| Some(Element::Watch(watch))),
            None => Err(missing(entity, Component::Watch)),
        },
        [Component::Cue] => match components.cue.get(entity) {
            Some(of) if components.watch.contains_key(of) => Ok(None),
            Some(of) => Err(SpecError::CueOfNonWatch {
                entity: entity.clone(),
                of: of.clone(),
            }),
            None => Err(missing(entity, Component::Cue)),
        },
        [Component::Bonus] => bonus(spec, entity).map(|bonus| Some(Element::Bonus(bonus))),
        [Component::Replay] => {
            if components.payout.contains_key(entity) {
                return Err(conflict(entity, Component::Replay, Component::Payout));
            }
            Ok(Some(Element::Replay(Replay {
                id: entity.clone(),
                label: label_of(spec, entity),
                chance: chance_of(spec, entity)?,
            })))
        }
        [_] => {
            let of = components
                .part_of
                .get(entity)
                .ok_or_else(|| missing(entity, Component::PartOf))?;
            if components.bonus.contains(of) {
                Ok(None)
            } else {
                Err(SpecError::PartOfNonBonus {
                    entity: entity.clone(),
                    of: of.clone(),
                })
            }
        }
        [] => Ok(Some(Element::Role(Role {
            id: entity.clone(),
            label: label_of(spec, entity),
            chance: chance_of(spec, entity)?,
            payout: components.payout.get(entity).copied(),
        }))),
    }
}

/// Every bonus, small win, replay and watch, in the order its entity was
/// made, assembled from its components; a bonus's parts are read with it,
/// and a watch's cues.
///
/// # Errors
/// When an entity is listed twice or a component names one the world lacks,
/// an entity lacks its chance or a small win its payout, two components
/// conflict, a part belongs to something that is not a bonus, a watch is
/// over something that is not one or has no cue, or a cue belongs to
/// something that is not a watch.
pub fn elements(spec: &Spec) -> Result<Vec<Element>, SpecError> {
    check_entities(spec)?;
    spec.entities
        .iter()
        .map(|entity| element_of(spec, entity))
        .filter_map(Result::transpose)
        .collect()
}
