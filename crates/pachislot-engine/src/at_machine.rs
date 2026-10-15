//! A machine of an AT as normalising reads it: its AT, its CZ if it is won
//! through one, its modes and its ベース, refused where they do not make
//! one; the rules the engine plays, each trigger's ceiling in regular games;
//! and each setting's table — the trigger's chance below its ceilings, read
//! back from its published 合算, the CZ's success rate, and the allotment
//! between the modes.

use std::collections::BTreeSet;
use std::num::NonZeroU32;

use pachislot_domain::conditions::PayoutRate;
use pachislot_domain::normalized::{Allotments, AtRules, AtTable, ModeRule, PayoutLaw};
use pachislot_domain::probability::{BasisPoints, Probability, ProbabilitySource};
use pachislot_domain::setting_level::{PerSettingLevel, SettingLevel};
use pachislot_domain::spec::{
    At, Base, Component, Cz, Element, EntityId, LcdRate, Medals, Mode, Spec,
};

use crate::at::{after_at, cap_figures_of, cycle, natural_chance, settled};
use crate::error::{ProbabilityProblem, SpecError};
use crate::payout::capped;
use crate::rate::{RateCycle, implied_gain, net_over_all};

/// What a machine of an AT is made of.
pub(crate) struct AtMachine<'a> {
    at: &'a At,
    cz: Option<&'a Cz>,
    modes: Vec<&'a Mode>,
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
/// machine a CZ brings the AT on, the AT間天井.
fn resets(at: &At, cz: Option<&Cz>) -> bool {
    let (_, _, reset_ceiling) = trigger_of(at, cz);
    reset_ceiling.is_some() || (cz.is_some() && at.reset_ceiling.is_some())
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
    modes: Vec<&'a Mode>,
    base: Base,
    cap: Option<Medals>,
) -> Result<AtMachine<'a>, SpecError> {
    paid(at, cap)?;
    if cz.is_some() {
        if at.first_hit.is_some() {
            return Err(SpecError::FirstHitBesideCz {
                entity: at.id.clone(),
            });
        }
        if at.reset_ceiling.is_some() && !modes.is_empty() {
            return Err(SpecError::ResetCeilingBesideModes {
                entity: at.id.clone(),
            });
        }
    } else if at.first_hit.is_none() {
        return Err(SpecError::MissingComponent {
            entity: at.id.clone(),
            component: Component::FirstHit,
        });
    }
    let (trigger, ceiling, reset_ceiling) = trigger_of(at, cz);
    if !modes.is_empty() && (ceiling.is_some() || reset_ceiling.is_some()) {
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
        base,
    })
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
    let Some(at) = ats.first().copied() else {
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
        Element::Mode(_) | Element::Role(_) | Element::Replay(_) => false,
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
    checked(at, cz, modes, base, spec.resources.cap).map(Some)
}

/// A ceiling counted on a screen, in the regular games it comes after on
/// average: rounded up, and never under one.
fn in_regular_games(ceiling: NonZeroU32, lcd_rate: Option<LcdRate>) -> NonZeroU32 {
    let Some(rate) = lcd_rate else {
        return ceiling;
    };
    #[allow(
        clippy::cast_possible_truncation,
        clippy::cast_sign_loss,
        reason = "a ceiling over a rate of one or more is positive and no larger than the ceiling"
    )]
    let games = (f64::from(ceiling.get()) / rate.get()).ceil() as u32;
    NonZeroU32::new(games).unwrap_or(NonZeroU32::MIN)
}

/// The id of the mode a machine without modes plays after a setting change.
fn reset_mode(trigger: &EntityId) -> EntityId {
    EntityId::new(&format!("{}:reset", trigger.as_str())).unwrap_or_else(|| trigger.clone())
}

/// The rules the engine plays: the trigger's ceilings by mode — the
/// machine's own modes, or one at the trigger's ceiling and one at its
/// ceilings after a setting change, the trigger's where a setting change
/// leaves it be — counted on the screen where the machine says so; each
/// mode's AT間天井 in regular games; the スルー天井.
pub(crate) fn rules_of(
    machine: &AtMachine<'_>,
    lcd_rate: Option<LcdRate>,
    cap: Option<Medals>,
) -> AtRules {
    let rule =
        |id: &EntityId, ceiling: Option<NonZeroU32>, at_ceiling: Option<NonZeroU32>| ModeRule {
            id: id.clone(),
            ceiling: ceiling.map(|ceiling| in_regular_games(ceiling, lcd_rate)),
            at_ceiling,
        };
    let (trigger, ceiling, reset_ceiling) = trigger_of(machine.at, machine.cz);
    let (at_ceiling, reset_at_ceiling) = at_ceilings_of(machine.at, machine.cz);
    let modes = if machine.modes.is_empty() {
        [rule(trigger, ceiling, at_ceiling)]
            .into_iter()
            .chain(resets(machine.at, machine.cz).then(|| {
                rule(
                    &reset_mode(trigger),
                    reset_ceiling.or(ceiling),
                    reset_at_ceiling,
                )
            }))
            .collect()
    } else {
        machine
            .modes
            .iter()
            .map(|mode| rule(&mode.id, mode.ceiling, at_ceiling))
            .collect()
    };
    AtRules {
        base: machine.base,
        at: machine.at.id.clone(),
        trigger: machine.cz.map(|cz| cz.id.clone()),
        modes,
        misses: machine.cz.and_then(|cz| cz.misses),
        net_per_game: net_of(machine.at),
        cap,
        window: machine.at.window,
        reset_on_cap: machine.at.reset_on_cap,
    }
}

/// One allotment's shares under a setting, mode by mode, as fractions of one.
fn shares(
    allotments: &[(&EntityId, &PerSettingLevel<BasisPoints>)],
    setting_level: SettingLevel,
    after_reset: bool,
) -> Result<Vec<f64>, SpecError> {
    let points = allotments
        .iter()
        .map(|(id, allotment)| {
            allotment
                .get(setting_level)
                .copied()
                .ok_or_else(|| SpecError::MissingSettingLevel {
                    at: (*id).clone(),
                    setting_level,
                })
        })
        .collect::<Result<Vec<_>, _>>()?;
    let sum: u32 = points.iter().map(|share| share.get()).sum();
    if sum != BasisPoints::WHOLE.get() {
        return Err(SpecError::AllotmentNotWhole {
            setting_level,
            after_reset,
            sum,
        });
    }
    Ok(points
        .iter()
        .map(|share| share.probability().value())
        .collect())
}

/// How a setting allots play between the modes, after an AT and after a
/// setting change. A machine without modes is always in its one mode, or
/// after a setting change in the mode of its shorter ceilings.
fn allotments_of(
    machine: &AtMachine<'_>,
    setting_level: SettingLevel,
) -> Result<Allotments, SpecError> {
    if machine.modes.is_empty() {
        return Ok(if resets(machine.at, machine.cz) {
            Allotments {
                after_at: vec![1.0, 0.0],
                after_reset: vec![0.0, 1.0],
            }
        } else {
            Allotments {
                after_at: vec![1.0],
                after_reset: vec![1.0],
            }
        });
    }
    let after_at: Vec<_> = machine
        .modes
        .iter()
        .map(|mode| (&mode.id, &mode.allotment))
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
    let after_at = shares(&after_at, setting_level, false)?;
    let after_reset = if after_reset.is_empty() {
        after_at.clone()
    } else {
        shares(&after_reset, setting_level, true)?
    };
    Ok(Allotments {
        after_at,
        after_reset,
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

/// The trigger's published 合算 under a setting, and the chance a trigger wins the AT.
fn published(
    machine: &AtMachine<'_>,
    setting_level: SettingLevel,
) -> Result<(EntityId, f64, f64), SpecError> {
    let (id, first_hit, success): (
        &EntityId,
        Option<&PerSettingLevel<ProbabilitySource>>,
        Option<&PerSettingLevel<BasisPoints>>,
    ) = match machine.cz {
        Some(cz) => (&cz.id, Some(&cz.first_hit), Some(&cz.success)),
        None => (&machine.at.id, machine.at.first_hit.as_ref(), None),
    };
    let missing = || SpecError::MissingSettingLevel {
        at: id.clone(),
        setting_level,
    };
    let chance = first_hit
        .and_then(|first_hit| first_hit.get(setting_level))
        .ok_or_else(missing)?
        .probability()
        .map_err(problem(id, setting_level))?;
    let success = match success {
        Some(success) => success
            .get(setting_level)
            .ok_or_else(missing)?
            .probability()
            .value(),
        None => 1.0,
    };
    Ok((id.clone(), chance.value(), success))
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

/// A setting's table: the trigger's chance below its ceilings, read back
/// from its published 合算 over the modes as an AT allots them — and where
/// an AT that reaches the cap starts play again as after a setting change,
/// over the share that do, which itself turns on the chance, so the two are
/// settled against each other until they agree.
fn table_paying(
    machine: &AtMachine<'_>,
    rules: &AtRules,
    setting_level: SettingLevel,
    payout: PayoutLaw,
) -> Result<AtTable, SpecError> {
    let allotments = allotments_of(machine, setting_level)?;
    let (id, published, success) = published(machine, setting_level)?;
    let beyond = || SpecError::FirstHitBeyondCeiling {
        at: id.clone(),
        setting_level,
    };
    let chance_for = |completion: f64| {
        natural_chance(
            published,
            rules,
            success,
            &after_at(rules, &allotments, completion),
        )
        .ok_or_else(beyond)
    };
    let first = chance_for(capped(&payout, rules.cap.map(Medals::get)).completion)?;
    let settle = |chance: f64| {
        chance_for(cap_figures_of(rules, chance, success, &allotments, &payout).completion)
    };
    let chance = if rules.reset_on_cap {
        (0..SETTLINGS)
            .try_fold(first, |chance, _| match settle(chance) {
                Ok(next) if (next - chance).abs() <= f64::EPSILON * chance => Err(Ok(next)),
                Ok(next) => Ok(next),
                Err(error) => Err(Err(error)),
            })
            .map_or_else(|stopped| stopped, Ok)?
    } else {
        first
    };
    Ok(AtTable {
        chance: Probability::new(chance).map_err(|_| beyond())?,
        success: Probability::new(success).map_err(problem(&id, setting_level))?,
        allotments,
        payout,
    })
}

/// The regular games a setting's cycle lasts, from one AT to the next.
fn cycle_games(rules: &AtRules, table: &AtTable) -> f64 {
    let (_, shares) = settled(rules, table);
    1.0 / cycle(rules, table.chance.value(), table.success.value(), &shares).at_chance()
}

/// What a setting's 機械割 implies its AT gains: the cycle is read off the
/// table as it stands with an AT that gains nothing — the games between
/// ATs do not turn on what one gains, short of a cap — and the gain that
/// brings the 機械割 over it is the AT's.
fn gain_from(
    machine: &AtMachine<'_>,
    rules: &AtRules,
    bet: f64,
    setting_level: SettingLevel,
    rate: PayoutRate,
) -> Result<PayoutLaw, SpecError> {
    let unattainable = || SpecError::UnattainableRate {
        entity: machine.at.id.clone(),
        setting_level,
    };
    let unpaid = table_paying(
        machine,
        rules,
        setting_level,
        PayoutLaw::Fixed(Medals::NONE),
    )?;
    let cycle = RateCycle {
        games: cycle_games(rules, &unpaid),
        loss: rules.base.loss_per_game(),
        bet,
        net: rules.net_per_game.map_or(0.0, Medals::get),
    };
    implied_gain(cycle, rate.ratio())
        .and_then(Medals::new)
        .map(PayoutLaw::Fixed)
        .ok_or_else(unattainable)
}

/// A setting's table, its AT gaining what the spec says or what the
/// setting's 機械割 implies.
pub(crate) fn table_of(
    machine: &AtMachine<'_>,
    rules: &AtRules,
    bet: f64,
    setting_level: SettingLevel,
) -> Result<AtTable, SpecError> {
    let payout = match paid_under(machine.at, setting_level)? {
        Paid::Law(law) => law,
        Paid::FromRate(rate) => gain_from(machine, rules, bet, setting_level, rate)?,
    };
    table_paying(machine, rules, setting_level, payout)
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
            .first_hit
            .as_ref()
            .map(|first_hit| (&machine.at.id, levels(first_hit))),
        machine.cz.map(|cz| (&cz.id, levels(&cz.first_hit))),
        machine.cz.map(|cz| (&cz.id, levels(&cz.success))),
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
    ]
    .into_iter()
    .flatten()
    .chain(machine.modes.iter().flat_map(|mode| {
        [
            Some(levels(&mode.allotment)),
            mode.reset_allotment.as_ref().map(levels),
        ]
        .into_iter()
        .flatten()
        .map(|each| (&mode.id, each))
    }))
    .collect();
    given.iter().try_for_each(|(at, each)| {
        let mut seen = BTreeSet::new();
        if let Some(setting_level) = each.iter().find(|level| !seen.insert(**level)) {
            return Err(SpecError::DuplicateSettingLevel {
                at: Some((*at).clone()),
                setting_level: *setting_level,
            });
        }
        if let Some(setting_level) = each.iter().find(|level| !setting_levels.contains(level)) {
            return Err(SpecError::UnknownSettingLevel {
                at: (*at).clone(),
                setting_level: *setting_level,
            });
        }
        setting_levels
            .iter()
            .find(|level| !each.contains(level))
            .map_or(Ok(()), |setting_level| {
                Err(SpecError::MissingSettingLevel {
                    at: (*at).clone(),
                    setting_level: *setting_level,
                })
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
