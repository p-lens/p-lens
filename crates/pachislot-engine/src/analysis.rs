use pachislot_domain::conditions::PayoutBasis;
use pachislot_domain::normalized::{
    AtRules, AtTable, EventKind, NormalizedSpec, SettingLevelTable,
};
use pachislot_domain::setting_level::SettingLevel;
use pachislot_domain::spec::EntityId;
use pachislot_domain::version::{EngineVersion, SchemaVersion};

use crate::at::{cycle, settled};
use crate::error::AnalysisError;
use crate::rate::{RateCycle, implied_rate};

/// What a formula comes to, setting by setting.
#[derive(Clone, Debug, PartialEq)]
pub struct Analysis {
    pub engine_version: EngineVersion,
    pub schema_version: SchemaVersion,
    pub setting_levels: Vec<SettingLevelFigures>,
}

/// One setting's figures.
#[derive(Clone, Debug, PartialEq)]
pub struct SettingLevelFigures {
    pub setting_level: SettingLevel,
    /// Theoretical medals a regular game gains or loses, bonuses included.
    pub net_per_game: f64,
    /// 機械割 as a ratio: `1.055` is 105.5%. Measured, or `1 + net / bet`.
    pub payout_rate: f64,
    /// Each bonus's chance a regular game, parts summed.
    pub bonuses: Vec<BonusFigure>,
    /// The chance of any bonus a regular game: 合算.
    pub combined: f64,
    /// Where the theoretical medals come from, when worked out from the spec:
    /// each outcome's share of a game's theoretical gain, the games that pay
    /// nothing last. Empty when the rate is measured.
    pub derivation: Vec<Contribution>,
    /// What an AT comes to on an AT machine, over every AT play goes
    /// through; none on a machine of bonuses.
    pub at: Option<AtFigure>,
}

/// What an AT comes to under a setting: the medals it gains on average, cap
/// and carried 有利区間 included, and the share that reach the cap.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct AtFigure {
    pub gain: f64,
    pub completion: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct BonusFigure {
    pub id: EntityId,
    pub chance: f64,
}

/// One outcome's part of a regular game's theoretical medals.
#[derive(Clone, Debug, PartialEq)]
pub struct Contribution {
    /// `None` for the games that pay nothing.
    pub id: Option<EntityId>,
    pub chance: f64,
    pub medals_per_game: f64,
}

/// Each bonus's chance a regular game, parts summed.
fn bonuses(table: &SettingLevelTable) -> Vec<BonusFigure> {
    let bonus_events = || {
        table
            .events
            .iter()
            .filter(|event| matches!(event.kind, EventKind::Bonus(_)))
    };
    let ids = bonus_events()
        .map(|event| event.group.as_ref().unwrap_or(&event.id))
        .fold(Vec::<&EntityId>::new(), |ids, id| {
            if ids.contains(&id) {
                ids
            } else {
                ids.into_iter().chain([id]).collect()
            }
        });
    ids.into_iter()
        .map(|id| BonusFigure {
            id: id.clone(),
            chance: bonus_events()
                .filter(|event| event.answers_to(id))
                .map(|event| event.chance.value())
                .sum(),
        })
        .collect()
}

/// An AT machine's published figures under a setting, worked out exactly
/// from its cycle: the CZ's 合算, if a CZ brings the AT, then the AT's
/// 初当たり — ceilings, misses and modes included.
fn at_figures(rules: &AtRules, table: &AtTable) -> (Vec<BonusFigure>, AtFigure) {
    let (figures, shares) = settled(rules, table);
    let cycle = cycle(rules, table.chance.value(), table.success.value(), &shares);
    let bonuses = rules
        .trigger
        .iter()
        .map(|trigger| BonusFigure {
            id: trigger.clone(),
            chance: cycle.trigger_chance(),
        })
        .chain([BonusFigure {
            id: rules.at.clone(),
            chance: cycle.at_chance(),
        }])
        .collect();
    (
        bonuses,
        AtFigure {
            gain: figures.gain,
            completion: figures.completion,
        },
    )
}

/// What one outcome gains over the game it comes up on, net of the bet.
fn gain(kind: EventKind, bet: f64, at: &EntityId) -> Result<f64, AnalysisError> {
    match kind {
        EventKind::Bonus(Some(payout)) | EventKind::Role(Some(payout)) => Ok(payout.get() - bet),
        EventKind::Bonus(None) | EventKind::Role(None) => {
            Err(AnalysisError::MissingPayout { at: at.clone() })
        }
        EventKind::Replay => Ok(0.0),
    }
}

fn derivation(table: &SettingLevelTable, bet: f64) -> Result<Vec<Contribution>, AnalysisError> {
    let listed = table
        .events
        .iter()
        .map(|event| {
            let chance = event.chance.value();
            Ok(Contribution {
                id: Some(event.id.clone()),
                chance,
                medals_per_game: chance * gain(event.kind, bet, &event.id)?,
            })
        })
        .collect::<Result<Vec<_>, _>>()?;
    let rest = 1.0 - listed.iter().map(|each| each.chance).sum::<f64>();
    Ok(listed
        .into_iter()
        .chain([Contribution {
            id: None,
            chance: rest,
            medals_per_game: -rest * bet,
        }])
        .collect())
}

/// An AT machine's 機械割 from what its AT gains, over the cycle its
/// 初当たり gives; none without its 純増, which says the games an AT takes.
fn at_rate(rules: Option<&AtRules>, at: Option<AtFigure>, first_hit: f64, bet: f64) -> Option<f64> {
    let rules = rules?;
    let cycle = RateCycle {
        games: 1.0 / first_hit,
        loss: rules.base.loss_per_game(),
        bet,
        net: rules.net_per_game?.get(),
    };
    Some(implied_rate(cycle, at?.gain))
}

fn figures(
    table: &SettingLevelTable,
    bet: f64,
    basis: &PayoutBasis,
    rules: Option<&AtRules>,
) -> Result<SettingLevelFigures, AnalysisError> {
    let machine = rules.zip(table.at.as_ref());
    let (bonuses, at) = machine.map_or_else(
        || (bonuses(table), None),
        |(rules, at)| {
            let (bonuses, figure) = at_figures(rules, at);
            (bonuses, Some(figure))
        },
    );
    let combined = match machine {
        Some(_) => bonuses.last().map_or(0.0, |at| at.chance),
        None => bonuses.iter().map(|bonus| bonus.chance).sum(),
    };
    let (net_per_game, payout_rate, derivation) = match basis {
        PayoutBasis::FromSpec if machine.is_some() => {
            let rate = at_rate(rules, at, combined, bet).ok_or(AnalysisError::RateNotFromSpec)?;
            (bet * (rate - 1.0), rate, Vec::new())
        }
        PayoutBasis::FromSpec => {
            let derivation = derivation(table, bet)?;
            let net: f64 = derivation.iter().map(|each| each.medals_per_game).sum();
            (net, 1.0 + net / bet, derivation)
        }
        PayoutBasis::Measured(rates) => {
            let rate = rates
                .get(table.setting_level)
                .ok_or(AnalysisError::MissingRate {
                    setting_level: table.setting_level,
                })?
                .ratio();
            (bet * (rate - 1.0), rate, Vec::new())
        }
    };
    Ok(SettingLevelFigures {
        setting_level: table.setting_level,
        net_per_game,
        payout_rate,
        bonuses,
        combined,
        derivation,
        at,
    })
}

/// Each setting's payout rate, bonus chances and theoretical medals a game.
///
/// # Errors
/// When the rate is to come from the spec and a bonus has no payout or the
/// machine is of an AT, or a measured rate is missing for a setting or given
/// for one the machine lacks.
pub fn analyze(spec: &NormalizedSpec, basis: &PayoutBasis) -> Result<Analysis, AnalysisError> {
    if let PayoutBasis::Measured(rates) = basis
        && let Some((setting_level, _)) = rates
            .0
            .iter()
            .find(|(setting_level, _)| spec.table(*setting_level).is_none())
    {
        return Err(AnalysisError::UnknownRate {
            setting_level: *setting_level,
        });
    }
    let bet = f64::from(spec.bet);
    let setting_levels = spec
        .tables
        .iter()
        .map(|table| figures(table, bet, basis, spec.at_rules.as_ref()))
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Analysis {
        engine_version: EngineVersion::CURRENT,
        schema_version: spec.schema_version,
        setting_levels,
    })
}
