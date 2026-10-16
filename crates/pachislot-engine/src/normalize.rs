use std::collections::BTreeSet;

use pachislot_domain::normalized::{
    AtRules, CueChance, Event, EventKind, NormalizedSpec, SettingLevelTable, WatchRule,
};
use pachislot_domain::probability::{Probability, ProbabilityError, ProbabilitySource};
use pachislot_domain::setting_level::{PerSettingLevel, SettingLevel};
use pachislot_domain::spec::{
    CeilingUnit, Chance, Component, Element, EntityId, LcdRate, Spec, Watch,
};

use pachislot_domain::version::SchemaVersion;

use crate::at_machine::{
    AtMachine, Scales, at_machine, check_since_at, coverage, rules_of, table_of, unit_counted,
};
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
        Element::At(_) | Element::Mode(_) | Element::Cz(_) | Element::Watch(_) => Vec::new(),
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

fn check_coverage(
    setting_levels: &[SettingLevel],
    id: &EntityId,
    chance: &PerSettingLevel<ProbabilitySource>,
) -> Result<(), SpecError> {
    let given = chance.0.iter().map(|(setting_level, _)| *setting_level);
    if let Some(setting_level) = first_repeat(given.clone()) {
        return Err(SpecError::DuplicateSettingLevel {
            at: Some(id.clone()),
            setting_level,
        });
    }
    if let Some(setting_level) = given
        .clone()
        .find(|setting_level| !setting_levels.contains(setting_level))
    {
        return Err(SpecError::UnknownSettingLevel {
            at: id.clone(),
            setting_level,
        });
    }
    setting_levels
        .iter()
        .find(|setting_level| chance.get(**setting_level).is_none())
        .map_or(Ok(()), |setting_level| {
            Err(SpecError::MissingSettingLevel {
                at: id.clone(),
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

fn probability_of(
    id: &EntityId,
    chance: &PerSettingLevel<ProbabilitySource>,
    setting_level: SettingLevel,
) -> Result<Probability, SpecError> {
    let source = chance
        .get(setting_level)
        .ok_or_else(|| SpecError::MissingSettingLevel {
            at: id.clone(),
            setting_level,
        })?;
    source
        .probability()
        .map_err(|error| SpecError::InvalidProbability {
            at: id.clone(),
            setting_level,
            problem: problem(error),
        })
}

fn event(outcome: &Outcome<'_>, setting_level: SettingLevel) -> Result<Event, SpecError> {
    Ok(Event {
        id: outcome.id.clone(),
        group: outcome.group.cloned(),
        kind: outcome.kind,
        chance: probability_of(outcome.id, outcome.chance, setting_level)?,
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
        cues: Vec::new(),
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
        .try_for_each(|outcome| check_coverage(setting_levels, outcome.id, outcome.chance))?;
    let in_unit = unit_counted(machine);
    let unit = spec
        .resources
        .ceiling_unit
        .as_ref()
        .map(CeilingUnit::per_game);
    if let (Some(entity), None) = (&in_unit, unit) {
        return Err(SpecError::UnitCeilingWithoutUnit {
            entity: entity.clone(),
        });
    }
    let whole_unit = unit.is_some() && in_unit.is_none();
    if whole_unit && spec.resources.lcd_rate.is_some() {
        return Err(SpecError::CeilingUnitBesideLcdRate);
    }
    let scales = Scales {
        screen: spec.resources.lcd_rate.map(LcdRate::get),
        unit,
        whole_unit,
    };
    let rules = rules_of(machine, scales, spec.resources.cap);
    check_since_at(&rules)?;
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
        .try_for_each(|outcome| check_coverage(setting_levels, outcome.id, outcome.chance))?;
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

/// How far from one a watch's cues may come and still be shown certainly
/// on a trial: published shares rounded to a whole come to one exactly, and
/// a ratio's float misses it by a rounding.
const WHOLE_TOLERANCE: f64 = 1e-9;

/// A watch's cues and their chances on a trial under one setting, which
/// never come to more than certainty.
fn cue_chances(watch: &Watch, setting_level: SettingLevel) -> Result<Vec<CueChance>, SpecError> {
    let cues = watch
        .cues
        .iter()
        .map(|cue| {
            Ok(CueChance {
                id: cue.id.clone(),
                watch: watch.id.clone(),
                chance: probability_of(&cue.id, &cue.chance, setting_level)?,
            })
        })
        .collect::<Result<Vec<_>, SpecError>>()?;
    let sum: f64 = cues.iter().map(|cue| cue.chance.value()).sum();
    if sum > 1.0 + WHOLE_TOLERANCE {
        return Err(SpecError::CuesExceedOne {
            entity: watch.id.clone(),
            setting_level,
            sum,
        });
    }
    Ok(cues)
}

/// A watch's rule and its cues' chances setting by setting, in the order
/// of the settings: whole where under every setting a trial shows a cue
/// certainly.
fn watch_of(
    watch: &Watch,
    setting_levels: &[SettingLevel],
) -> Result<(WatchRule, Vec<Vec<CueChance>>), SpecError> {
    watch
        .cues
        .iter()
        .try_for_each(|cue| check_coverage(setting_levels, &cue.id, &cue.chance))?;
    let chances = setting_levels
        .iter()
        .map(|setting_level| cue_chances(watch, *setting_level))
        .collect::<Result<Vec<_>, _>>()?;
    let wholes = chances
        .iter()
        .map(|cues| {
            (cues.iter().map(|cue| cue.chance.value()).sum::<f64>() - 1.0).abs() <= WHOLE_TOLERANCE
        })
        .collect::<BTreeSet<_>>();
    if wholes.len() > 1 {
        return Err(SpecError::WatchPartlyWhole {
            entity: watch.id.clone(),
        });
    }
    Ok((
        WatchRule {
            id: watch.id.clone(),
            bonus: watch.bonus.clone(),
            trials: watch.trials,
            whole: wholes.contains(&true),
        },
        chances,
    ))
}

/// Every watch's rule, and the cues of all of them setting by setting, in
/// the order of the settings.
fn watches_of(
    elements: &[Element],
    setting_levels: &[SettingLevel],
) -> Result<(Vec<WatchRule>, Vec<Vec<CueChance>>), SpecError> {
    elements
        .iter()
        .filter_map(|element| match element {
            Element::Watch(watch) => Some(watch_of(watch, setting_levels)),
            _ => None,
        })
        .try_fold(
            (
                Vec::new(),
                setting_levels
                    .iter()
                    .map(|_| Vec::new())
                    .collect::<Vec<_>>(),
            ),
            |(mut rules, cues), made| {
                let (rule, chances) = made?;
                rules.push(rule);
                let cues = cues
                    .into_iter()
                    .zip(chances)
                    .map(|(mut all, more)| {
                        all.extend(more);
                        all
                    })
                    .collect();
                Ok((rules, cues))
            },
        )
}

/// Checks a spec and reads it into one table per setting: of a regular
/// game's outcomes, or of an AT machine's trigger and modes.
///
/// # Errors
/// When the spec has no settings or repeats one, its components do not make
/// a bonus, small win, replay, AT, CZ or mode of each entity, a chance leaves
/// a setting without a value or gives one for a setting the machine lacks, a
/// probability is impossible, a game's outcomes or a watch's cues exceed
/// certainty, a watch's cues are certain under some settings alone, or an
/// AT machine's figures do not make one.
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
    let (watches, cues) = watches_of(&elements, setting_levels)?;
    Ok(NormalizedSpec {
        schema_version: SchemaVersion::CURRENT,
        bet: spec.resources.bet.get(),
        tables: tables
            .into_iter()
            .zip(cues)
            .map(|(table, cues)| SettingLevelTable { cues, ..table })
            .collect(),
        at_rules,
        watches,
    })
}
