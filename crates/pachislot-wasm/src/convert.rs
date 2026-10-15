//! Between the boundary's DTOs and the domain. Every refusal names the field
//! by its path in the request, so a form can point at it.

use std::collections::{BTreeMap, BTreeSet};
use std::num::{NonZeroU32, NonZeroU64};

use pachislot_domain::conditions::{PayoutBasis, PayoutRate, PlayConditions};
use pachislot_domain::distribution::Distribution;
use pachislot_domain::normalized::{
    Allotments, AtRules, AtTable, Event, EventKind, ModeRule, NormalizedSpec, PayoutLaw,
    SettingLevelTable,
};
use pachislot_domain::observation::{
    AtSeen, Leg, LegEnd, Path, PathStart, Segment, ToldLeg, ToldPath,
};
use pachislot_domain::probability::{BasisPoints, Denominator, Probability, ProbabilitySource};
use pachislot_domain::setting_level::{PerSettingLevel, SettingLevel};
use pachislot_domain::spec::{
    Base, Component, Components, EntityId, LcdRate, Medals, OtherNet, PayoutRow, Resources, Sets,
    Spec,
};
use pachislot_domain::version::{SchemaVersion, SpecVersion};
use pachislot_engine::analysis::Analysis;
use pachislot_engine::error::{AnalysisError, InferenceError, ProbabilityProblem, SpecError};
use pachislot_engine::posterior::Posterior;
use pachislot_engine::theoretical::TheoreticalValue;
use pachislot_simulator::aggregate::{Aggregate, HISTOGRAM_BUCKET_YEN};
use pachislot_simulator::estimate::{Estimate, Tally};
use pachislot_simulator::rng::{Rng, Seed};
use pachislot_simulator::session::{Plan, Progress};

use crate::dto::{
    AllotmentsDto, AnalysisDto, AtFigureDto, AtRulesDto, AtTableDto, BonusFigureDto, BucketDto,
    BySettingLevelDto, ComponentsDto, ConditionsDto, ContributionDto, DistributionDto, ErrorDto,
    EstimateProgressDto, EstimateSummaryDto, EventDto, EventKindDto, LawRowDto, LegEndDto,
    ModeRuleDto, NormalizedSpecDto, PathDto, PathStartDto, PayoutBasisDto, PayoutLawDto,
    PayoutRowDto, PlayDto, PosteriorDto, ProbabilityDto, ProbabilityProblemDto, ProgressDto,
    SegmentDto, SettingLevelEstimateDto, SettingLevelFiguresDto, SpecDto, SummaryDto, TableDto,
    TallyDto, TheoreticalValueDto, ToldPathDto, WeightDto,
};

fn invalid(field: &str) -> ErrorDto {
    ErrorDto::InvalidValue {
        field: field.to_owned(),
    }
}

fn setting_level(value: u8, field: &str) -> Result<SettingLevel, ErrorDto> {
    SettingLevel::new(value).ok_or_else(|| invalid(field))
}

fn id(name: &str, field: &str) -> Result<EntityId, ErrorDto> {
    EntityId::new(name).ok_or_else(|| invalid(field))
}

fn medals(value: f64, field: &str) -> Result<Medals, ErrorDto> {
    Medals::new(value).ok_or_else(|| invalid(field))
}

fn probability_source(dto: &ProbabilityDto, field: &str) -> Result<ProbabilitySource, ErrorDto> {
    match dto {
        ProbabilityDto::Ratio {
            numerator,
            denominator_hundredths,
        } => NonZeroU32::new(*denominator_hundredths)
            .map(|hundredths| ProbabilitySource::Ratio {
                numerator: *numerator,
                denominator: Denominator::from_hundredths(hundredths),
            })
            .ok_or_else(|| invalid(&format!("{field}.denominatorHundredths"))),
        ProbabilityDto::Percent { basis_points } => BasisPoints::new(*basis_points)
            .map(ProbabilitySource::Percent)
            .map_err(|_| invalid(&format!("{field}.basisPoints"))),
    }
}

fn by_setting_level<D, T>(
    values: &[BySettingLevelDto<D>],
    field: &str,
    read: impl Fn(&D, &str) -> Result<T, ErrorDto>,
) -> Result<PerSettingLevel<T>, ErrorDto> {
    values
        .iter()
        .enumerate()
        .map(|(index, each)| {
            let at = format!("{field}[{index}]");
            Ok((
                setting_level(each.setting_level, &format!("{at}.settingLevel"))?,
                read(&each.value, &format!("{at}.value"))?,
            ))
        })
        .collect::<Result<Vec<_>, _>>()
        .map(PerSettingLevel)
}

fn probabilities(
    values: &[BySettingLevelDto<ProbabilityDto>],
    field: &str,
) -> Result<PerSettingLevel<ProbabilitySource>, ErrorDto> {
    by_setting_level(values, field, probability_source)
}

/// A component table, each key read as an entity and each value by `read`.
fn table<D, T>(
    table: &BTreeMap<String, D>,
    field: &str,
    read: impl Fn(&D, &str) -> Result<T, ErrorDto>,
) -> Result<BTreeMap<EntityId, T>, ErrorDto> {
    table
        .iter()
        .map(|(name, value)| {
            let at = format!("{field}.{name}");
            Ok((id(name, &at)?, read(value, &at)?))
        })
        .collect()
}

/// A component every entity listed has, with nothing more to say.
fn listed(names: &[String], field: &str) -> Result<BTreeSet<EntityId>, ErrorDto> {
    names
        .iter()
        .enumerate()
        .map(|(index, name)| id(name, &format!("{field}[{index}]")))
        .collect()
}

fn components(dto: &ComponentsDto) -> Result<Components, ErrorDto> {
    if let Some(name) = dto.unsupported.keys().next() {
        return Err(ErrorDto::UnsupportedComponent {
            field: format!("spec.components.{name}"),
        });
    }
    Ok(Components {
        label: table(&dto.label, "spec.components.label", |label, _| {
            Ok(label.clone())
        })?,
        chance: table(&dto.chance, "spec.components.chance", |values, at| {
            probabilities(values, at)
        })?,
        payout: table(&dto.payout, "spec.components.payout", |value, at| {
            medals(*value, at)
        })?,
        bonus: listed(&dto.bonus, "spec.components.bonus")?,
        replay: listed(&dto.replay, "spec.components.replay")?,
        part_of: table(&dto.part_of, "spec.components.partOf", |of, at| id(of, at))?,
        at: listed(&dto.at, "spec.components.at")?,
        first_hit: table(&dto.first_hit, "spec.components.firstHit", |values, at| {
            probabilities(values, at)
        })?,
        ceiling: table(&dto.ceiling, "spec.components.ceiling", |games, at| {
            NonZeroU32::new(*games).ok_or_else(|| invalid(at))
        })?,
        reset_ceiling: table(
            &dto.reset_ceiling,
            "spec.components.resetCeiling",
            |games, at| NonZeroU32::new(*games).ok_or_else(|| invalid(at)),
        )?,
        mode: listed(&dto.mode, "spec.components.mode")?,
        allotment: table(&dto.allotment, "spec.components.allotment", |values, at| {
            shares(values, at)
        })?,
        reset_allotment: table(
            &dto.reset_allotment,
            "spec.components.resetAllotment",
            |values, at| shares(values, at),
        )?,
        at_ceiling: table(&dto.at_ceiling, "spec.components.atCeiling", |games, at| {
            NonZeroU32::new(*games).ok_or_else(|| invalid(at))
        })?,
        cz: listed(&dto.cz, "spec.components.cz")?,
        success: table(&dto.success, "spec.components.success", |values, at| {
            shares(values, at)
        })?,
        misses: table(&dto.misses, "spec.components.misses", |count, at| {
            NonZeroU32::new(*count).ok_or_else(|| invalid(at))
        })?,
        sets: table(&dto.sets, "spec.components.sets", |sets, at| {
            Ok(Sets {
                first: medals(sets.first, &format!("{at}.first"))?,
                set: medals(sets.set, &format!("{at}.set"))?,
            })
        })?,
        continuation_rate: table(
            &dto.continuation_rate,
            "spec.components.continuationRate",
            |values, at| shares(values, at),
        )?,
        payout_table: table(
            &dto.payout_table,
            "spec.components.payoutTable",
            |values, at| {
                by_setting_level(values, at, |rows: &Vec<PayoutRowDto>, field| {
                    payout_rows(rows, field)
                })
            },
        )?,
        net_per_game: table(
            &dto.net_per_game,
            "spec.components.netPerGame",
            |net, at| medals(*net, at),
        )?,
        other_net: table(&dto.other_net, "spec.components.otherNet", |others, at| {
            others
                .iter()
                .enumerate()
                .map(|(index, other)| {
                    Ok(OtherNet {
                        net: medals(other.net, &format!("{at}[{index}].net"))?,
                        share: BasisPoints::new(other.share_basis_points)
                            .map_err(|_| invalid(&format!("{at}[{index}].shareBasisPoints")))?,
                    })
                })
                .collect()
        })?,
        rate: table(&dto.rate, "spec.components.rate", |values, at| {
            by_setting_level(values, at, |points: &u32, field| {
                PayoutRate::from_basis_points(*points).ok_or_else(|| invalid(field))
            })
        })?,
        window: table(&dto.window, "spec.components.window", |games, at| {
            NonZeroU32::new(*games).ok_or_else(|| invalid(at))
        })?,
        reset_on_cap: listed(&dto.reset_on_cap, "spec.components.resetOnCap")?,
    })
}

fn payout_rows(rows: &[PayoutRowDto], field: &str) -> Result<Vec<PayoutRow>, ErrorDto> {
    rows.iter()
        .enumerate()
        .map(|(index, row)| {
            let at = format!("{field}[{index}]");
            Ok(PayoutRow {
                medals: medals(row.medals, &format!("{at}.medals"))?,
                share: BasisPoints::new(row.share).map_err(|_| invalid(&format!("{at}.share")))?,
            })
        })
        .collect()
}

/// # Errors
/// When a value cannot be what its field says, or a component table is one
/// this engine does not know.
/// A spec is read only in the shape this engine knows: one of another
/// version is refused by its number, whatever else it holds.
fn spec_version(dto: &SpecDto) -> Result<(), ErrorDto> {
    let known = SpecVersion::CURRENT.get();
    if dto.v == known {
        Ok(())
    } else {
        Err(ErrorDto::UnsupportedSpecVersion {
            version: dto.v,
            known,
        })
    }
}

pub fn spec(dto: &SpecDto) -> Result<Spec, ErrorDto> {
    spec_version(dto)?;
    Ok(Spec {
        entities: dto
            .entities
            .iter()
            .enumerate()
            .map(|(index, name)| id(name, &format!("spec.entities[{index}]")))
            .collect::<Result<_, _>>()?,
        components: components(&dto.components)?,
        resources: Resources {
            setting_levels: dto
                .resources
                .setting_levels
                .iter()
                .enumerate()
                .map(|(index, value)| {
                    setting_level(*value, &format!("spec.resources.settingLevels[{index}]"))
                })
                .collect::<Result<_, _>>()?,
            bet: NonZeroU32::new(dto.resources.bet).ok_or_else(|| invalid("spec.resources.bet"))?,
            base: dto
                .resources
                .base
                .map(|games| Base::new(games).ok_or_else(|| invalid("spec.resources.base")))
                .transpose()?,
            lcd_rate: dto
                .resources
                .lcd_rate
                .map(|rate| LcdRate::new(rate).ok_or_else(|| invalid("spec.resources.lcdRate")))
                .transpose()?,
            cap: dto
                .resources
                .cap
                .map(|cap| medals(cap, "spec.resources.cap"))
                .transpose()?,
        },
    })
}

fn event_kind(dto: &EventKindDto, field: &str) -> Result<EventKind, ErrorDto> {
    match dto {
        EventKindDto::Bonus { payout } => payout
            .map(|value| medals(value, &format!("{field}.payout")))
            .transpose()
            .map(EventKind::Bonus),
        EventKindDto::Role { payout } => payout
            .map(|value| medals(value, &format!("{field}.payout")))
            .transpose()
            .map(EventKind::Role),
        EventKindDto::Replay => Ok(EventKind::Replay),
    }
}

fn ceiling(games: Option<u32>, field: &str) -> Result<Option<NonZeroU32>, ErrorDto> {
    games
        .map(|games| NonZeroU32::new(games).ok_or_else(|| invalid(field)))
        .transpose()
}

/// An AT machine's rules as stored in a shape: from one before
/// `SchemaVersion::AT_CEILING_BY_MODE`, the machine's one AT間天井 given to
/// every mode, and from that on each mode's own, the machine giving none.
fn at_rules(dto: &AtRulesDto, shape: SchemaVersion) -> Result<AtRules, ErrorDto> {
    let by_mode = shape >= SchemaVersion::AT_CEILING_BY_MODE;
    if by_mode && dto.at_ceiling.is_some() {
        return Err(invalid("normalized.atRules.atCeiling"));
    }
    let machine_ceiling = ceiling(dto.at_ceiling, "normalized.atRules.atCeiling")?;
    Ok(AtRules {
        base: Base::new(dto.base).ok_or_else(|| invalid("normalized.atRules.base"))?,
        at: id(&dto.at, "normalized.atRules.at")?,
        net_per_game: dto
            .net_per_game
            .map(|net| medals(net, "normalized.atRules.netPerGame"))
            .transpose()?,
        cap: dto
            .cap
            .map(|cap| medals(cap, "normalized.atRules.cap"))
            .transpose()?,
        window: ceiling(dto.window, "normalized.atRules.window")?,
        reset_on_cap: dto.reset_on_cap,
        trigger: dto
            .trigger
            .as_deref()
            .map(|trigger| id(trigger, "normalized.atRules.trigger"))
            .transpose()?,
        misses: ceiling(dto.misses, "normalized.atRules.misses")?,
        modes: dto
            .modes
            .iter()
            .enumerate()
            .map(|(index, mode)| {
                let at = format!("normalized.atRules.modes[{index}]");
                if !by_mode && mode.at_ceiling.is_some() {
                    return Err(invalid(&format!("{at}.atCeiling")));
                }
                Ok(ModeRule {
                    id: id(&mode.id, &format!("{at}.id"))?,
                    ceiling: ceiling(mode.ceiling, &format!("{at}.ceiling"))?,
                    at_ceiling: if by_mode {
                        ceiling(mode.at_ceiling, &format!("{at}.atCeiling"))?
                    } else {
                        machine_ceiling
                    },
                })
            })
            .collect::<Result<_, _>>()?,
    })
}

/// A setting's shares between the modes, each a fraction of one.
fn fractions(values: &[f64], field: &str) -> Result<Vec<f64>, ErrorDto> {
    values
        .iter()
        .enumerate()
        .map(|(index, value)| {
            Probability::new(*value)
                .map(Probability::value)
                .map_err(|_| invalid(&format!("{field}[{index}]")))
        })
        .collect()
}

fn allotments(dto: &AllotmentsDto, field: &str) -> Result<Allotments, ErrorDto> {
    Ok(Allotments {
        after_at: fractions(&dto.after_at, &format!("{field}.afterAt"))?,
        after_reset: fractions(&dto.after_reset, &format!("{field}.afterReset"))?,
    })
}

fn probability(value: f64, field: &str) -> Result<Probability, ErrorDto> {
    Probability::new(value).map_err(|_| invalid(field))
}

fn at_table(dto: &AtTableDto, field: &str) -> Result<AtTable, ErrorDto> {
    Ok(AtTable {
        chance: probability(dto.chance, &format!("{field}.chance"))?,
        success: probability(dto.success, &format!("{field}.success"))?,
        allotments: allotments(&dto.allotments, &format!("{field}.allotments"))?,
        payout: payout_law(&dto.payout, &format!("{field}.payout"))?,
    })
}

fn payout_law(dto: &PayoutLawDto, field: &str) -> Result<PayoutLaw, ErrorDto> {
    match dto {
        PayoutLawDto::Fixed { medals: value } => {
            medals(*value, &format!("{field}.medals")).map(PayoutLaw::Fixed)
        }
        PayoutLawDto::Sets {
            first,
            set,
            continuation_rate,
        } => Ok(PayoutLaw::Sets {
            first: medals(*first, &format!("{field}.first"))?,
            set: medals(*set, &format!("{field}.set"))?,
            continuation_rate: probability(
                *continuation_rate,
                &format!("{field}.continuationRate"),
            )?,
        }),
        PayoutLawDto::Table { rows } => rows
            .iter()
            .enumerate()
            .map(|(index, row)| {
                let at = format!("{field}.rows[{index}]");
                Ok((
                    medals(row.medals, &format!("{at}.medals"))?,
                    probability(row.probability, &format!("{at}.probability"))?,
                ))
            })
            .collect::<Result<_, _>>()
            .map(PayoutLaw::Table),
    }
}

fn payout_law_dto(law: &PayoutLaw) -> PayoutLawDto {
    match law {
        PayoutLaw::Fixed(medals) => PayoutLawDto::Fixed {
            medals: medals.get(),
        },
        PayoutLaw::Sets {
            first,
            set,
            continuation_rate,
        } => PayoutLawDto::Sets {
            first: first.get(),
            set: set.get(),
            continuation_rate: continuation_rate.value(),
        },
        PayoutLaw::Table(rows) => PayoutLawDto::Table {
            rows: rows
                .iter()
                .map(|(medals, probability)| LawRowDto {
                    medals: medals.get(),
                    probability: probability.value(),
                })
                .collect(),
        },
    }
}

/// Shares in hundredths of a percent, under each setting.
fn shares(
    values: &[BySettingLevelDto<u32>],
    field: &str,
) -> Result<PerSettingLevel<BasisPoints>, ErrorDto> {
    by_setting_level(values, field, |points, at| {
        BasisPoints::new(*points).map_err(|_| invalid(at))
    })
}

fn event(dto: &EventDto, field: &str) -> Result<Event, ErrorDto> {
    Ok(Event {
        id: id(&dto.id, &format!("{field}.id"))?,
        group: dto
            .group
            .as_deref()
            .map(|group| id(group, &format!("{field}.group")))
            .transpose()?,
        kind: event_kind(&dto.kind, &format!("{field}.kind"))?,
        chance: Probability::new(dto.chance).map_err(|_| invalid(&format!("{field}.chance")))?,
    })
}

/// # Errors
/// When the stored spec is not one this adapter wrote.
pub fn normalized_spec(dto: &NormalizedSpecDto) -> Result<NormalizedSpec, ErrorDto> {
    Ok(NormalizedSpec {
        schema_version: SchemaVersion::new(dto.schema_version),
        bet: dto.bet,
        tables: dto
            .tables
            .iter()
            .enumerate()
            .map(|(index, table)| {
                let at = format!("normalized.tables[{index}]");
                Ok(SettingLevelTable {
                    setting_level: setting_level(
                        table.setting_level,
                        &format!("{at}.settingLevel"),
                    )?,
                    events: table
                        .events
                        .iter()
                        .enumerate()
                        .map(|(position, each)| event(each, &format!("{at}.events[{position}]")))
                        .collect::<Result<_, _>>()?,
                    at: table
                        .at
                        .as_ref()
                        .map(|each| at_table(each, &format!("{at}.at")))
                        .transpose()?,
                })
            })
            .collect::<Result<_, _>>()?,
        at_rules: dto
            .at_rules
            .as_ref()
            .map(|rules| at_rules(rules, SchemaVersion::new(dto.schema_version)))
            .transpose()?,
    })
}

fn event_kind_dto(kind: EventKind) -> EventKindDto {
    match kind {
        EventKind::Bonus(payout) => EventKindDto::Bonus {
            payout: payout.map(Medals::get),
        },
        EventKind::Role(payout) => EventKindDto::Role {
            payout: payout.map(Medals::get),
        },
        EventKind::Replay => EventKindDto::Replay,
    }
}

pub fn normalized_dto(spec: &NormalizedSpec) -> NormalizedSpecDto {
    NormalizedSpecDto {
        schema_version: spec.schema_version.get(),
        bet: spec.bet,
        tables: spec
            .tables
            .iter()
            .map(|table| TableDto {
                setting_level: table.setting_level.get(),
                events: table
                    .events
                    .iter()
                    .map(|event| EventDto {
                        id: event.id.as_str().to_owned(),
                        group: event.group.as_ref().map(|group| group.as_str().to_owned()),
                        kind: event_kind_dto(event.kind),
                        chance: event.chance.value(),
                    })
                    .collect(),
                at: table.at.as_ref().map(|each| AtTableDto {
                    chance: each.chance.value(),
                    success: each.success.value(),
                    allotments: AllotmentsDto {
                        after_at: each.allotments.after_at.clone(),
                        after_reset: each.allotments.after_reset.clone(),
                    },
                    payout: payout_law_dto(&each.payout),
                }),
            })
            .collect(),
        at_rules: spec.at_rules.as_ref().map(|rules| AtRulesDto {
            base: rules.base.games(),
            at: named(&rules.at),
            net_per_game: rules.net_per_game.map(Medals::get),
            cap: rules.cap.map(Medals::get),
            window: rules.window.map(NonZeroU32::get),
            reset_on_cap: rules.reset_on_cap,
            trigger: rules.trigger.as_ref().map(named),
            at_ceiling: None,
            misses: rules.misses.map(NonZeroU32::get),
            modes: rules
                .modes
                .iter()
                .map(|mode| ModeRuleDto {
                    id: mode.id.as_str().to_owned(),
                    ceiling: mode.ceiling.map(NonZeroU32::get),
                    at_ceiling: mode.at_ceiling.map(NonZeroU32::get),
                })
                .collect(),
        }),
    }
}

/// A path as the engine walks it.
pub fn told(dto: &ToldPathDto) -> ToldPath {
    ToldPath {
        after_reset: dto.after_reset,
        since_at: dto.since_at,
        legs: dto
            .legs
            .iter()
            .map(|leg| ToldLeg {
                games: leg.games,
                won: leg.won,
                misses: leg.misses,
            })
            .collect(),
    }
}

pub fn path_start(dto: &PathStartDto) -> PathStart {
    PathStart {
        since_trigger: dto.since_trigger,
        since_at: dto.since_at,
        misses: dto.misses,
        after_reset: dto.after_reset,
        held: dto.held,
    }
}

pub fn path(dto: &PathDto) -> Path {
    Path {
        start: path_start(&dto.start),
        legs: dto
            .legs
            .iter()
            .map(|leg| Leg {
                games: leg.games,
                end: match leg.end {
                    LegEndDto::Going => LegEnd::Going,
                    LegEndDto::Missed => LegEnd::Missed,
                    LegEndDto::WonAt => {
                        let seen = leg.at.unwrap_or_default();
                        LegEnd::WonAt(AtSeen {
                            completed: seen.completed,
                            sets: seen.sets,
                            medals: seen.medals,
                        })
                    }
                },
            })
            .collect(),
    }
}

/// # Errors
/// When a measured rate is not a positive figure for a setting.
pub fn conditions(dto: &ConditionsDto) -> Result<PayoutBasis, ErrorDto> {
    match &dto.payout_rate {
        PayoutBasisDto::FromSpec => Ok(PayoutBasis::FromSpec),
        PayoutBasisDto::Measured {
            by_setting_level: rates,
        } => by_setting_level(
            rates,
            "conditions.payoutRate.bySettingLevel",
            |points, field| PayoutRate::from_basis_points(*points).ok_or_else(|| invalid(field)),
        )
        .map(PayoutBasis::Measured),
    }
}

/// # Errors
/// When a price or a pace is not a positive number, a share is not between
/// nothing and all or the two come to more than all, or a replay takes
/// fewer medals off savings than it pays out.
pub fn play(dto: &PlayDto) -> Result<PlayConditions, ErrorDto> {
    let cash_share = Probability::new(dto.cash_share).map_err(|_| invalid("play.cashShare"))?;
    let replay_share = Probability::new(dto.replay_share.unwrap_or(0.0))
        .map_err(|_| invalid("play.replayShare"))?;
    PlayConditions::new(
        dto.medal_value,
        dto.rental_price,
        cash_share,
        dto.games_per_hour,
    )
    .ok_or_else(|| invalid("play"))?
    .with_replay(replay_share, dto.replay_rate.unwrap_or(1.0))
    .ok_or_else(|| invalid("play.replay"))
}

/// # Errors
/// When a share is not a setting's hundredths of a percent.
pub fn distribution(dto: &DistributionDto) -> Result<Distribution, ErrorDto> {
    by_setting_level(&dto.shares, "prior.shares", |points, field| {
        BasisPoints::new(*points).map_err(|_| invalid(field))
    })
    .map(Distribution)
}

/// # Errors
/// When a count is filed under an empty name.
pub fn segments(dtos: &[SegmentDto]) -> Result<Vec<Segment>, ErrorDto> {
    dtos.iter()
        .enumerate()
        .map(|(index, segment)| {
            Ok(Segment {
                games: segment.games,
                counts: segment
                    .counts
                    .iter()
                    .enumerate()
                    .map(|(position, count)| {
                        Ok((
                            id(
                                &count.id,
                                &format!("segments[{index}].counts[{position}].id"),
                            )?,
                            count.count,
                        ))
                    })
                    .collect::<Result<_, _>>()?,
            })
        })
        .collect()
}

/// # Errors
/// When a weight is not a setting's probability.
pub fn weights(dtos: &[WeightDto]) -> Result<Vec<(SettingLevel, f64)>, ErrorDto> {
    dtos.iter()
        .enumerate()
        .map(|(index, weight)| {
            let at = format!("weights[{index}]");
            let value = Probability::new(weight.probability)
                .map_err(|_| invalid(&format!("{at}.probability")))?
                .value();
            Ok((
                setting_level(weight.setting_level, &format!("{at}.settingLevel"))?,
                value,
            ))
        })
        .collect()
}

fn problem_dto(problem: ProbabilityProblem) -> ProbabilityProblemDto {
    match problem {
        ProbabilityProblem::NotFinite => ProbabilityProblemDto::NotFinite,
        ProbabilityProblem::OutOfRange => ProbabilityProblemDto::OutOfRange,
    }
}

fn named(id: &EntityId) -> String {
    id.as_str().to_owned()
}

/// A component by the name its table has in the JSON.
fn component_name(component: Component) -> String {
    match component {
        Component::Label => "label",
        Component::Chance => "chance",
        Component::Payout => "payout",
        Component::Bonus => "bonus",
        Component::Replay => "replay",
        Component::PartOf => "partOf",
        Component::At => "at",
        Component::FirstHit => "firstHit",
        Component::Ceiling => "ceiling",
        Component::ResetCeiling => "resetCeiling",
        Component::Mode => "mode",
        Component::Allotment => "allotment",
        Component::ResetAllotment => "resetAllotment",
        Component::AtCeiling => "atCeiling",
        Component::Cz => "cz",
        Component::Success => "success",
        Component::Misses => "misses",
        Component::Sets => "sets",
        Component::ContinuationRate => "continuationRate",
        Component::PayoutTable => "payoutTable",
        Component::NetPerGame => "netPerGame",
        Component::OtherNet => "otherNet",
        Component::Rate => "rate",
        Component::Window => "window",
        Component::ResetOnCap => "resetOnCap",
    }
    .to_owned()
}

#[allow(
    clippy::too_many_lines,
    reason = "one arm for each way a spec is refused, each as plain as the last"
)]
pub fn spec_error_dto(error: &SpecError) -> ErrorDto {
    match error {
        SpecError::NoSettingLevels => ErrorDto::NoSettingLevels,
        SpecError::DuplicateSettingLevel { at, setting_level } => ErrorDto::DuplicateSettingLevel {
            at: at.as_ref().map(named),
            setting_level: setting_level.get(),
        },
        SpecError::MissingSettingLevel { at, setting_level } => ErrorDto::MissingSettingLevel {
            at: named(at),
            setting_level: setting_level.get(),
        },
        SpecError::UnknownSettingLevel { at, setting_level } => ErrorDto::UnknownSettingLevel {
            at: named(at),
            setting_level: setting_level.get(),
        },
        SpecError::DuplicateEntity { entity } => ErrorDto::DuplicateEntity {
            entity: named(entity),
        },
        SpecError::MissingComponent { entity, component } => ErrorDto::MissingComponent {
            entity: named(entity),
            component: component_name(*component),
        },
        SpecError::ConflictingComponents {
            entity,
            first,
            second,
        } => ErrorDto::ConflictingComponents {
            entity: named(entity),
            first: component_name(*first),
            second: component_name(*second),
        },
        SpecError::StrayComponent { entity, component } => ErrorDto::StrayComponent {
            entity: named(entity),
            component: component_name(*component),
        },
        SpecError::PartOfNonBonus { entity, of } => ErrorDto::PartOfNonBonus {
            entity: named(entity),
            of: named(of),
        },
        SpecError::InvalidProbability {
            at,
            setting_level,
            problem,
        } => ErrorDto::InvalidProbability {
            at: named(at),
            setting_level: setting_level.get(),
            problem: problem_dto(*problem),
        },
        SpecError::ProbabilitiesExceedOne { setting_level, sum } => {
            ErrorDto::ProbabilitiesExceedOne {
                setting_level: setting_level.get(),
                sum: *sum,
            }
        }
        SpecError::AtNotAlone { entity } => ErrorDto::AtNotAlone {
            entity: named(entity),
        },
        SpecError::MissingBase => ErrorDto::MissingBase,
        SpecError::BaseWithoutAt => ErrorDto::BaseWithoutAt,
        SpecError::FirstHitBeyondCeiling { at, setting_level } => ErrorDto::FirstHitBeyondCeiling {
            at: named(at),
            setting_level: setting_level.get(),
        },
        SpecError::ModeWithoutAt { entity } => ErrorDto::ModeWithoutAt {
            entity: named(entity),
        },
        SpecError::CeilingBesideModes { entity } => ErrorDto::CeilingBesideModes {
            entity: named(entity),
        },
        SpecError::AllotmentNotWhole {
            setting_level,
            after_reset,
            sum,
        } => ErrorDto::AllotmentNotWhole {
            setting_level: setting_level.get(),
            after_reset: *after_reset,
            sum: *sum,
        },
        SpecError::ResetAllotmentPartial { entity } => ErrorDto::ResetAllotmentPartial {
            entity: named(entity),
        },
        SpecError::CzWithoutAt { entity } => ErrorDto::CzWithoutAt {
            entity: named(entity),
        },
        SpecError::FirstHitBesideCz { entity } => ErrorDto::FirstHitBesideCz {
            entity: named(entity),
        },
        SpecError::PayoutBesideAt { entity } => ErrorDto::PayoutBesideAt {
            entity: named(entity),
        },
        SpecError::ResetCeilingBesideModes { entity } => ErrorDto::ResetCeilingBesideModes {
            entity: named(entity),
        },
        SpecError::AtCeilingWithoutCz { entity } => ErrorDto::AtCeilingWithoutCz {
            entity: named(entity),
        },
        SpecError::EmptySet { entity } => ErrorDto::EmptySet {
            entity: named(entity),
        },
        SpecError::EmptyNetPerGame { entity } => ErrorDto::EmptyNetPerGame {
            entity: named(entity),
        },
        SpecError::OtherNetBeyondWhole { entity, sum } => ErrorDto::OtherNetBeyondWhole {
            entity: named(entity),
            sum: *sum,
        },
        SpecError::UnattainableRate {
            entity,
            setting_level,
        } => ErrorDto::UnattainableRate {
            entity: named(entity),
            setting_level: setting_level.get(),
        },
        SpecError::EndlessContinuation {
            entity,
            setting_level,
        } => ErrorDto::EndlessContinuation {
            entity: named(entity),
            setting_level: setting_level.get(),
        },
        SpecError::PayoutTableNotWhole {
            entity,
            setting_level,
            sum,
        } => ErrorDto::PayoutTableNotWhole {
            entity: named(entity),
            setting_level: setting_level.get(),
            sum: *sum,
        },
        SpecError::NeedsCap { entity, component } => ErrorDto::NeedsCap {
            entity: named(entity),
            component: component_name(*component),
        },
        SpecError::CapWithoutAt => ErrorDto::CapWithoutAt,
    }
}

pub fn analysis_error_dto(error: &AnalysisError) -> ErrorDto {
    match error {
        AnalysisError::MissingPayout { at } => ErrorDto::MissingPayout { at: named(at) },
        AnalysisError::MissingRate { setting_level } => ErrorDto::MissingRate {
            setting_level: setting_level.get(),
        },
        AnalysisError::UnknownRate { setting_level } => ErrorDto::UnknownRate {
            setting_level: setting_level.get(),
        },
        AnalysisError::RateNotFromSpec => ErrorDto::RateNotFromSpec,
    }
}

pub fn inference_error_dto(error: &InferenceError) -> ErrorDto {
    match error {
        InferenceError::UnknownCount { segment, id } => ErrorDto::UnknownCount {
            segment: *segment,
            id: named(id),
        },
        InferenceError::OverlappingCounts { segment, id } => ErrorDto::OverlappingCounts {
            segment: *segment,
            id: named(id),
        },
        InferenceError::CountsExceedGames { segment } => {
            ErrorDto::CountsExceedGames { segment: *segment }
        }
        InferenceError::PriorMismatch { setting_level } => ErrorDto::PriorMismatch {
            setting_level: setting_level.get(),
        },
        InferenceError::InvalidPrior { sum } => ErrorDto::InvalidPrior { sum: *sum },
        InferenceError::ContradictoryEvidence => ErrorDto::ContradictoryEvidence,
        InferenceError::PathWithoutAt => ErrorDto::PathWithoutAt,
    }
}

pub fn analysis_dto(analysis: &Analysis, spec: &NormalizedSpec) -> AnalysisDto {
    AnalysisDto {
        engine_version: analysis.engine_version.get(),
        schema_version: analysis.schema_version.get(),
        normalized: normalized_dto(spec),
        setting_levels: analysis
            .setting_levels
            .iter()
            .map(|figures| SettingLevelFiguresDto {
                setting_level: figures.setting_level.get(),
                net_per_game: figures.net_per_game,
                payout_rate: figures.payout_rate,
                bonuses: figures
                    .bonuses
                    .iter()
                    .map(|bonus| BonusFigureDto {
                        id: named(&bonus.id),
                        chance: bonus.chance,
                    })
                    .collect(),
                combined: figures.combined,
                derivation: figures
                    .derivation
                    .iter()
                    .map(|each| ContributionDto {
                        id: each.id.as_ref().map(named),
                        chance: each.chance,
                        medals_per_game: each.medals_per_game,
                    })
                    .collect(),
                at: figures.at.map(|at| AtFigureDto {
                    gain: at.gain,
                    completion: at.completion,
                }),
            })
            .collect(),
    }
}

pub fn posterior_dto(posterior: &Posterior) -> PosteriorDto {
    PosteriorDto {
        setting_levels: posterior
            .setting_levels
            .iter()
            .map(|(setting_level, probability)| WeightDto {
                setting_level: setting_level.get(),
                probability: *probability,
            })
            .collect(),
    }
}

pub fn theoretical_value_dto(value: &TheoreticalValue) -> TheoreticalValueDto {
    TheoreticalValueDto {
        payout_rate: value.payout_rate,
        net_per_game: value.net_per_game,
        medals: value.medals,
        yen: value.yen,
        yen_per_hour: value.yen_per_hour,
    }
}

fn word(text: &str, field: &str) -> Result<u64, ErrorDto> {
    text.parse::<u64>().map_err(|_| invalid(field))
}

/// # Errors
/// When the seed is not a 64-bit decimal number.
pub fn seed(text: &str) -> Result<Seed, ErrorDto> {
    word(text, "seed").map(Seed)
}

fn generator(rng: &[String; 4]) -> Result<Rng, ErrorDto> {
    let [a, b, c, d] = rng;
    let state = [
        word(a, "progress.rng[0]")?,
        word(b, "progress.rng[1]")?,
        word(c, "progress.rng[2]")?,
        word(d, "progress.rng[3]")?,
    ];
    Rng::from_state(state).ok_or_else(|| invalid("progress.rng"))
}

fn words(rng: Rng) -> [String; 4] {
    rng.state().map(|word| word.to_string())
}

/// # Errors
/// When the carried generator is not one this adapter wrote.
pub fn progress(dto: &ProgressDto) -> Result<Progress, ErrorDto> {
    Ok(Progress {
        rng: generator(&dto.rng)?,
        aggregate: Aggregate {
            sessions: dto.sessions,
            mean: dto.mean,
            m2: dto.m2,
            min_yen: dto.min_yen,
            max_yen: dto.max_yen,
            wins: dto.wins,
            histogram: dto.histogram.iter().copied().collect(),
        },
    })
}

pub fn progress_dto(progress: &Progress) -> ProgressDto {
    let aggregate = &progress.aggregate;
    ProgressDto {
        rng: words(progress.rng),
        sessions: aggregate.sessions,
        mean: aggregate.mean,
        m2: aggregate.m2,
        min_yen: aggregate.min_yen,
        max_yen: aggregate.max_yen,
        wins: aggregate.wins,
        histogram: aggregate
            .histogram
            .iter()
            .map(|(&bucket, &count)| (bucket, count))
            .collect(),
    }
}

pub fn summary_dto(progress: &Progress, plan: &Plan) -> SummaryDto {
    let aggregate = &progress.aggregate;
    #[allow(clippy::cast_precision_loss)]
    let histogram = aggregate
        .histogram
        .iter()
        .map(|(&bucket, &count)| BucketDto {
            from_yen: bucket as f64 * HISTOGRAM_BUCKET_YEN,
            to_yen: (bucket + 1) as f64 * HISTOGRAM_BUCKET_YEN,
            count,
        })
        .collect();
    SummaryDto {
        sessions: aggregate.sessions,
        planned: plan.sessions.get(),
        finished: progress.is_finished(plan),
        mean_yen: aggregate.mean_yen(),
        standard_deviation_yen: aggregate.standard_deviation(),
        win_rate: aggregate.win_rate(),
        min_yen: aggregate.min_yen,
        max_yen: aggregate.max_yen,
        histogram,
    }
}

/// # Errors
/// When the carried generator or a tally's setting is not one this adapter wrote.
pub fn estimate(dto: &EstimateProgressDto) -> Result<Estimate, ErrorDto> {
    Ok(Estimate {
        rng: generator(&dto.rng)?,
        tallies: dto
            .tallies
            .iter()
            .enumerate()
            .map(|(index, tally)| {
                Ok(Tally {
                    setting_level: setting_level(
                        tally.setting_level,
                        &format!("progress.tallies[{index}].settingLevel"),
                    )?,
                    games: tally.games,
                    medals: tally.medals,
                    medals_squared: tally.medals_squared,
                })
            })
            .collect::<Result<_, _>>()?,
    })
}

pub fn estimate_progress_dto(estimate: &Estimate) -> EstimateProgressDto {
    EstimateProgressDto {
        rng: words(estimate.rng),
        tallies: estimate
            .tallies
            .iter()
            .map(|tally| TallyDto {
                setting_level: tally.setting_level.get(),
                games: tally.games,
                medals: tally.medals,
                medals_squared: tally.medals_squared,
            })
            .collect(),
    }
}

pub fn estimate_summary_dto(
    estimate: &Estimate,
    games_per_setting_level: NonZeroU64,
    bet: u32,
) -> EstimateSummaryDto {
    EstimateSummaryDto {
        games_per_setting_level: games_per_setting_level.get(),
        finished: estimate
            .tallies
            .iter()
            .all(|tally| tally.games >= games_per_setting_level.get()),
        setting_levels: estimate
            .tallies
            .iter()
            .map(|tally| SettingLevelEstimateDto {
                setting_level: tally.setting_level.get(),
                games: tally.games,
                payout_rate: tally.net_per_game().map(|net| 1.0 + net / f64::from(bet)),
                payout_rate_margin: tally.payout_rate_margin(bet),
            })
            .collect(),
    }
}
