use std::collections::BTreeSet;

use pachislot_domain::normalized::{AtRules, Event, EventKind, NormalizedSpec, SettingLevelTable};
use pachislot_domain::probability::{Probability, ProbabilityError, ProbabilitySource};
use pachislot_domain::setting_level::{PerSettingLevel, SettingLevel};
use pachislot_domain::spec::{Chance, Component, Element, EntityId, Spec};

use pachislot_domain::version::SchemaVersion;

use crate::at_machine::{AtMachine, at_machine, coverage, rules_of, table_of};
use crate::error::{ProbabilityProblem, SpecError};
use crate::query::elements;

/// One outcome as the spec gives it, before it is read setting by setting.
struct Outcome<'a> {
    id: &'a EntityId,
    group: Option<&'a EntityId>,
    kind: EventKind,
    chance: &'a PerSettingLevel<ProbabilitySource>,
}

fn outcomes(element: &Element) -> Vec<Outcome<'_>> {
    match element {
        Element::Bonus(bonus) => {
            let kind = EventKind::Bonus(bonus.payout);
            match &bonus.chance {
                Chance::Whole(chance) => vec![Outcome {
                    id: &bonus.id,
                    group: None,
                    kind,
                    chance,
                }],
                Chance::Parts(parts) => parts
                    .iter()
                    .map(|part| Outcome {
                        id: &part.id,
                        group: Some(&bonus.id),
                        kind,
                        chance: &part.chance,
                    })
                    .collect(),
            }
        }
        Element::Role(role) => vec![Outcome {
            id: &role.id,
            group: None,
            kind: EventKind::Role(role.payout),
            chance: &role.chance,
        }],
        Element::Replay(replay) => vec![Outcome {
            id: &replay.id,
            group: None,
            kind: EventKind::Replay,
            chance: &replay.chance,
        }],
        Element::At(_) | Element::Mode(_) | Element::Cz(_) => Vec::new(),
    }
}

fn first_repeat<T: Ord + Clone>(items: impl IntoIterator<Item = T>) -> Option<T> {
    let mut seen = BTreeSet::new();
    items.into_iter().find(|item| !seen.insert(item.clone()))
}

fn check_setting_levels(setting_levels: &[SettingLevel]) -> Result<(), SpecError> {
    if setting_levels.is_empty() {
        return Err(SpecError::NoSettingLevels);
    }
    first_repeat(setting_levels.iter().copied()).map_or(Ok(()), |setting_level| {
        Err(SpecError::DuplicateSettingLevel {
            at: None,
            setting_level,
        })
    })
}

fn check_coverage(setting_levels: &[SettingLevel], outcome: &Outcome<'_>) -> Result<(), SpecError> {
    let given = outcome
        .chance
        .0
        .iter()
        .map(|(setting_level, _)| *setting_level);
    if let Some(setting_level) = first_repeat(given.clone()) {
        return Err(SpecError::DuplicateSettingLevel {
            at: Some(outcome.id.clone()),
            setting_level,
        });
    }
    if let Some(setting_level) = given
        .clone()
        .find(|setting_level| !setting_levels.contains(setting_level))
    {
        return Err(SpecError::UnknownSettingLevel {
            at: outcome.id.clone(),
            setting_level,
        });
    }
    setting_levels
        .iter()
        .find(|setting_level| outcome.chance.get(**setting_level).is_none())
        .map_or(Ok(()), |setting_level| {
            Err(SpecError::MissingSettingLevel {
                at: outcome.id.clone(),
                setting_level: *setting_level,
            })
        })
}

fn problem(error: ProbabilityError) -> ProbabilityProblem {
    match error {
        ProbabilityError::NotFinite => ProbabilityProblem::NotFinite,
        ProbabilityError::OutOfRange => ProbabilityProblem::OutOfRange,
    }
}

fn event(outcome: &Outcome<'_>, setting_level: SettingLevel) -> Result<Event, SpecError> {
    let invalid = |problem| SpecError::InvalidProbability {
        at: outcome.id.clone(),
        setting_level,
        problem,
    };
    let source =
        outcome
            .chance
            .get(setting_level)
            .ok_or_else(|| SpecError::MissingSettingLevel {
                at: outcome.id.clone(),
                setting_level,
            })?;
    let chance: Probability = source
        .probability()
        .map_err(|error| invalid(problem(error)))?;
    Ok(Event {
        id: outcome.id.clone(),
        group: outcome.group.cloned(),
        kind: outcome.kind,
        chance,
    })
}

fn table(
    outcomes: &[Outcome<'_>],
    setting_level: SettingLevel,
) -> Result<SettingLevelTable, SpecError> {
    let events = outcomes
        .iter()
        .map(|outcome| event(outcome, setting_level))
        .collect::<Result<Vec<_>, _>>()?;
    let sum: f64 = events.iter().map(|event| event.chance.value()).sum();
    if sum > 1.0 {
        return Err(SpecError::ProbabilitiesExceedOne { setting_level, sum });
    }
    Ok(SettingLevelTable {
        setting_level,
        events,
        at: None,
    })
}

/// An AT machine's tables, one a setting — its small wins and replays, to
/// be counted, and its trigger and modes — and the rules it plays by.
fn at_tables(
    machine: &AtMachine<'_>,
    elements: &[Element],
    spec: &Spec,
) -> Result<(Vec<SettingLevelTable>, AtRules), SpecError> {
    let setting_levels = &spec.resources.setting_levels;
    coverage(machine, setting_levels)?;
    let counted = elements.iter().flat_map(outcomes).collect::<Vec<_>>();
    counted
        .iter()
        .try_for_each(|outcome| check_coverage(setting_levels, outcome))?;
    let rules = rules_of(machine, spec.resources.lcd_rate, spec.resources.cap);
    let bet = f64::from(spec.resources.bet.get());
    let tables = setting_levels
        .iter()
        .map(|setting_level| {
            Ok(SettingLevelTable {
                at: Some(table_of(machine, &rules, bet, *setting_level)?),
                ..table(&counted, *setting_level)?
            })
        })
        .collect::<Result<Vec<_>, SpecError>>()?;
    Ok((tables, rules))
}

/// A machine of bonuses and small wins: each setting's outcomes of a
/// regular game.
fn outcome_tables(
    elements: &[Element],
    setting_levels: &[SettingLevel],
) -> Result<Vec<SettingLevelTable>, SpecError> {
    let outcomes = elements.iter().flat_map(outcomes).collect::<Vec<_>>();
    outcomes
        .iter()
        .try_for_each(|outcome| check_coverage(setting_levels, outcome))?;
    if let Some(unpaid) = outcomes
        .iter()
        .find(|outcome| outcome.kind == EventKind::Role(None))
    {
        return Err(SpecError::MissingComponent {
            entity: unpaid.id.clone(),
            component: Component::Payout,
        });
    }
    setting_levels
        .iter()
        .map(|setting_level| table(&outcomes, *setting_level))
        .collect()
}

/// Checks a spec and reads it into one table per setting: of a regular
/// game's outcomes, or of an AT machine's trigger and modes.
///
/// # Errors
/// When the spec has no settings or repeats one, its components do not make
/// a bonus, small win, replay, AT, CZ or mode of each entity, a chance leaves
/// a setting without a value or gives one for a setting the machine lacks, a
/// probability is impossible, a game's outcomes exceed certainty, or an AT
/// machine's figures do not make one.
pub fn normalize(spec: &Spec) -> Result<NormalizedSpec, SpecError> {
    let setting_levels = &spec.resources.setting_levels;
    check_setting_levels(setting_levels)?;
    let elements = elements(spec)?;
    let machine = at_machine(spec, &elements)?;
    let (tables, at_rules) = if let Some(machine) = machine {
        let (tables, rules) = at_tables(&machine, &elements, spec)?;
        (tables, Some(rules))
    } else {
        (outcome_tables(&elements, setting_levels)?, None)
    };
    Ok(NormalizedSpec {
        schema_version: SchemaVersion::CURRENT,
        bet: spec.resources.bet.get(),
        tables,
        at_rules,
    })
}
