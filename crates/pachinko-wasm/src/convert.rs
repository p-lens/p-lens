//! DTOs into domain values and back. Every value the domain refuses is named
//! by where it sits in the request.

use std::collections::{BTreeMap, BTreeSet};
use std::num::{NonZeroU32, NonZeroU64};

use pachinko_domain::conditions::{
    BallValue, CalculationConditions, PlayConditions, RoundPayout, SpinPerformance,
};
use pachinko_domain::normalized::{
    NormalizedReliefDrive, NormalizedSpec, Outcome, Reward, State, StateIndex, StateOrigin, Target,
};
use pachinko_domain::probability::{BasisPoints, Denominator, Probability, ProbabilitySource};
use pachinko_domain::quantity::{Balls, PayoutRule, RoundCount, SpinCount};
use pachinko_domain::spec::{
    Allotment, Component, Components, LeftoverQueue, LuckyTrigger, ModeId, Next, OtherRounds,
    Rapid, RegularGame, ReliefDrive, Resources, Rushing, Spec, SpecialTime,
};
use pachinko_domain::version::{SchemaVersion, SpecVersion};
use pachinko_engine::analysis::Analysis;
use pachinko_engine::error::{Location, ProbabilityProblem, SolveError, SpecError, Unsupported};
use pachinko_engine::relief_drive::Restart;
use pachinko_simulator::aggregate::{Aggregate, HISTOGRAM_BUCKET_YEN};
use pachinko_simulator::combo::ReliefGauge;
use pachinko_simulator::estimate::{Estimate, Tally};
use pachinko_simulator::hyena_hunt::{HyenaHunt, HyenaHuntTally};
use pachinko_simulator::inference::{
    BINS, Belief, Beyond, Inference, InferenceSetup, InferenceTally, Told, VALUE_BINS, Way, Weighed,
};
use pachinko_simulator::rng::Rng;
use pachinko_simulator::simulation::{Plan, Progress};

use crate::dto::{
    AllotmentDto, AnalysisDto, BeyondDto, BucketDto, ComponentsDto, ConditionsDto, DerivationDto,
    EndingChanceDto, EndingDto, ErrorDto, EstimateProgressDto, EstimateSummaryDto,
    HyenaHuntProgressDto, HyenaHuntSummaryDto, InferenceProgressDto, InferenceRequest,
    InferenceSummaryDto, LocationDto, ModeEntryDto, NextDto, NormalizedReliefDriveDto,
    NormalizedSpecDto, OriginDto, OtherRoundsDto, OutcomeDto, PlanDto, PlayDto, ProbabilityDto,
    ProgressDto, ReadingDto, ReliefDriveFiguresDto, RestartDto, RestartKindDto, RoundPayoutDto,
    SpecDto, StateDto, SummaryDto, TargetDto, UnsupportedDto, WayDto, WeighedDto,
};

fn invalid(field: &str) -> ErrorDto {
    ErrorDto::InvalidValue {
        field: field.to_owned(),
    }
}

fn nonzero(value: u32, field: &str) -> Result<NonZeroU32, ErrorDto> {
    NonZeroU32::new(value).ok_or_else(|| invalid(field))
}

fn mode_id(name: &str, field: &str) -> Result<ModeId, ErrorDto> {
    ModeId::new(name).ok_or_else(|| invalid(field))
}

fn probability_source(dto: &ProbabilityDto, field: &str) -> Result<ProbabilitySource, ErrorDto> {
    match *dto {
        ProbabilityDto::Ratio {
            numerator,
            denominator_hundredths,
        } => Ok(ProbabilitySource::Ratio {
            numerator,
            denominator: Denominator::from_hundredths(nonzero(
                denominator_hundredths,
                &format!("{field}.denominatorHundredths"),
            )?),
        }),
        ProbabilityDto::Percent { basis_points } => BasisPoints::new(basis_points)
            .map(ProbabilitySource::Percent)
            .map_err(|_| invalid(&format!("{field}.basisPoints"))),
    }
}

fn next(dto: &NextDto, field: &str) -> Result<Next, ErrorDto> {
    match dto {
        NextDto::Regular => Ok(Next::Regular),
        NextDto::Mode { mode } => mode_id(mode, &format!("{field}.mode")).map(Next::Mode),
    }
}

fn allotment(dtos: &[AllotmentDto], field: &str) -> Result<Vec<Allotment>, ErrorDto> {
    dtos.iter()
        .enumerate()
        .map(|(index, dto)| {
            let at = format!("{field}[{index}]");
            Ok(Allotment {
                share: BasisPoints::new(dto.share_basis_points)
                    .map_err(|_| invalid(&format!("{at}.shareBasisPoints")))?,
                rounds: RoundCount::new(nonzero(dto.rounds, &format!("{at}.rounds"))?),
                next: next(&dto.next, &format!("{at}.next"))?,
                prize_balls: optional_nonzero(dto.prize_balls, &format!("{at}.prizeBalls"))?,
                count: optional_nonzero(dto.count, &format!("{at}.count"))?,
                other_rounds: other_rounds(&dto.other_rounds, &format!("{at}.otherRounds"))?,
                jackpots: optional_nonzero(dto.jackpots, &format!("{at}.jackpots"))?
                    .unwrap_or(NonZeroU32::MIN),
            })
        })
        .collect()
}

fn optional_nonzero(value: Option<u32>, field: &str) -> Result<Option<NonZeroU32>, ErrorDto> {
    value.map(|value| nonzero(value, field)).transpose()
}

fn other_rounds(dtos: &[OtherRoundsDto], field: &str) -> Result<Vec<OtherRounds>, ErrorDto> {
    dtos.iter()
        .enumerate()
        .map(|(index, dto)| {
            let at = format!("{field}[{index}]");
            Ok(OtherRounds {
                rounds: RoundCount::new(nonzero(dto.rounds, &format!("{at}.rounds"))?),
                prize_balls: optional_nonzero(dto.prize_balls, &format!("{at}.prizeBalls"))?,
                count: optional_nonzero(dto.count, &format!("{at}.count"))?,
            })
        })
        .collect()
}

/// One component table read entry by entry, each value at its own path.
fn table<D, T>(
    dtos: &BTreeMap<String, D>,
    field: &str,
    read: impl Fn(&D, &str) -> Result<T, ErrorDto>,
) -> Result<BTreeMap<ModeId, T>, ErrorDto> {
    dtos.iter()
        .map(|(entity, dto)| {
            let at = format!("{field}.{entity}");
            Ok((mode_id(entity, &at)?, read(dto, &at)?))
        })
        .collect()
}

fn components(dto: &ComponentsDto) -> Result<Components, ErrorDto> {
    const AT: &str = "spec.components";
    if let Some(name) = dto.unsupported.keys().next() {
        return Err(ErrorDto::UnsupportedComponent {
            field: format!("{AT}.{name}"),
        });
    }
    Ok(Components {
        regular_game: table(
            &dto.regular_game,
            &format!("{AT}.regularGame"),
            |game, at| {
                Ok(RegularGame {
                    chance: probability_source(&game.chance, &format!("{at}.chance"))?,
                })
            },
        )?,
        label: table(&dto.label, &format!("{AT}.label"), |label, _| {
            Ok(label.clone())
        })?,
        allotment: table(&dto.allotment, &format!("{AT}.allotment"), |shares, at| {
            allotment(shares, at)
        })?,
        special_time: table(
            &dto.special_time,
            &format!("{AT}.specialTime"),
            |special, at| {
                Ok(SpecialTime {
                    spins: SpinCount::new(nonzero(special.spins, &format!("{at}.spins"))?),
                    chance: probability_source(&special.chance, &format!("{at}.chance"))?,
                })
            },
        )?,
        rapid: table(&dto.rapid, &format!("{AT}.rapid"), |rapid, at| {
            Ok(Rapid {
                spins: SpinCount::new(nonzero(rapid.spins, &format!("{at}.spins"))?),
            })
        })?,
        leftover_queue: table(
            &dto.leftover_queue,
            &format!("{AT}.leftoverQueue"),
            |queue, at| {
                Ok(LeftoverQueue {
                    draws: SpinCount::new(nonzero(queue.draws, &format!("{at}.draws"))?),
                })
            },
        )?,
        rushing: table(&dto.rushing, &format!("{AT}.rushing"), |rushing, at| {
            Ok(Rushing {
                continuation_rate: probability_source(
                    &rushing.continuation_rate,
                    &format!("{at}.continuationRate"),
                )?,
            })
        })?,
        until_hit: dto
            .until_hit
            .iter()
            .enumerate()
            .map(|(index, entity)| mode_id(entity, &format!("{AT}.untilHit[{index}]")))
            .collect::<Result<BTreeSet<_>, _>>()?,
        on_miss: table(&dto.on_miss, &format!("{AT}.onMiss"), |miss, at| {
            next(miss, at)
        })?,
        lucky_trigger: table(
            &dto.lucky_trigger,
            &format!("{AT}.luckyTrigger"),
            |trigger, at| {
                Ok(LuckyTrigger {
                    at_combo: nonzero(trigger.at_combo, &format!("{at}.atCombo"))?,
                    to: mode_id(&trigger.to, &format!("{at}.to"))?,
                })
            },
        )?,
        relief_drive: table(
            &dto.relief_drive,
            &format!("{AT}.reliefDrive"),
            |relief_drive, at| {
                Ok(ReliefDrive {
                    gauge: SpinCount::new(nonzero(relief_drive.gauge, &format!("{at}.gauge"))?),
                    to: mode_id(&relief_drive.to, &format!("{at}.to"))?,
                })
            },
        )?,
    })
}

/// # Errors
/// A value the domain refuses, named by its path.
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
            .map(|(index, entity)| mode_id(entity, &format!("spec.entities[{index}]")))
            .collect::<Result<_, _>>()?,
        components: components(&dto.components)?,
        resources: Resources {
            payout: PayoutRule {
                prize_balls: nonzero(
                    dto.resources.payout.prize_balls,
                    "spec.resources.payout.prizeBalls",
                )?,
                count: nonzero(dto.resources.payout.count, "spec.resources.payout.count")?,
            },
        },
    })
}

fn probability(value: f64, field: &str) -> Result<Probability, ErrorDto> {
    Probability::new(value).map_err(|_| invalid(field))
}

fn target(dto: &TargetDto) -> Target {
    match dto {
        TargetDto::State { index } => Target::State(StateIndex::new(*index)),
        TargetDto::End => Target::End,
    }
}

fn target_dto(target: Target) -> TargetDto {
    match target {
        Target::State(index) => TargetDto::State { index: index.get() },
        Target::End => TargetDto::End,
    }
}

fn outcome(dto: &OutcomeDto, net_balls_per_round: u32, field: &str) -> Result<Outcome, ErrorDto> {
    Ok(Outcome {
        probability: probability(dto.probability, &format!("{field}.probability"))?,
        reward: Reward {
            rounds: dto.rounds,
            hits: dto.hits,
            balls: dto
                .balls
                .unwrap_or_else(|| dto.rounds.saturating_mul(net_balls_per_round)),
        },
        next: target(&dto.next),
    })
}

fn outcomes(
    dtos: &[OutcomeDto],
    net_balls_per_round: u32,
    field: &str,
) -> Result<Vec<Outcome>, ErrorDto> {
    dtos.iter()
        .enumerate()
        .map(|(index, dto)| outcome(dto, net_balls_per_round, &format!("{field}[{index}]")))
        .collect()
}

/// # Errors
/// A stored normalised spec is read in any shape up to the latest this
/// engine knows, each as its version says. One stored by a later engine is
/// refused by its number, never read as if it were in a shape known here,
/// and one that says no shape at all is no normalised spec.
fn schema_version(dto: &NormalizedSpecDto) -> Result<SchemaVersion, ErrorDto> {
    let known = SchemaVersion::CURRENT.get();
    match dto.schema_version {
        0 => Err(invalid("normalized.schemaVersion")),
        version if version > known => Err(ErrorDto::UnsupportedSchemaVersion { version, known }),
        version => Ok(SchemaVersion::new(version)),
    }
}

/// # Errors
/// A value the domain refuses, named by its path, or a shape this engine
/// does not read yet.
pub fn normalized_spec(dto: &NormalizedSpecDto) -> Result<NormalizedSpec, ErrorDto> {
    let shape = schema_version(dto)?;
    Ok(NormalizedSpec {
        schema_version: shape,
        hit_chance: probability(dto.hit_chance, "normalized.hitChance")?,
        entry: outcomes(&dto.entry, dto.net_balls_per_round, "normalized.entry")?,
        states: dto
            .states
            .iter()
            .enumerate()
            .map(|(index, state)| {
                Ok(State {
                    outcomes: outcomes(
                        &state.outcomes,
                        dto.net_balls_per_round,
                        &format!("normalized.states[{index}].outcomes"),
                    )?,
                    fills_gauge: state.fills_gauge,
                })
            })
            .collect::<Result<_, ErrorDto>>()?,
        origins: dto
            .origins
            .iter()
            .enumerate()
            .map(|(index, origin)| {
                Ok(StateOrigin {
                    mode: mode_id(&origin.mode, &format!("normalized.origins[{index}].mode"))?,
                    combo: origin.combo,
                })
            })
            .collect::<Result<_, ErrorDto>>()?,
        net_balls_per_round: dto.net_balls_per_round,
        relief_drive: dto
            .relief_drive
            .as_ref()
            .map(|relief_drive| NormalizedReliefDrive {
                gauge: relief_drive.gauge,
                target: target(&relief_drive.target),
            }),
    })
}

/// # Errors
/// A value the domain refuses, named by its path.
pub fn conditions(dto: &ConditionsDto) -> Result<CalculationConditions, ErrorDto> {
    Ok(CalculationConditions {
        round_payout: match dto.round_payout {
            RoundPayoutDto::FromSpec => RoundPayout::FromSpec,
            RoundPayoutDto::Measured { balls } => RoundPayout::Measured(
                Balls::new(balls).ok_or_else(|| invalid("conditions.roundPayout.balls"))?,
            ),
        },
    })
}

/// # Errors
/// A value the domain refuses, named by its path.
pub fn play(dto: &PlayDto) -> Result<PlayConditions, ErrorDto> {
    Ok(PlayConditions {
        spin_performance: SpinPerformance::new(dto.spin_performance)
            .ok_or_else(|| invalid("play.spinPerformance"))?,
        ball_value: BallValue::new(dto.ball_value).ok_or_else(|| invalid("play.ballValue"))?,
    })
}

/// # Errors
/// A value the domain refuses, named by its path.
pub fn plan(dto: &PlanDto, payout_scale: f64, play: PlayConditions) -> Result<Plan, ErrorDto> {
    Ok(Plan {
        sessions: NonZeroU64::new(dto.sessions).ok_or_else(|| invalid("plan.sessions"))?,
        setup: pachinko_simulator::session::SessionSetup {
            spins: SpinCount::new(nonzero(dto.spins_per_session, "plan.spinsPerSession")?),
            payout_scale,
            play,
        },
    })
}

fn word(text: &str, field: &str) -> Result<u64, ErrorDto> {
    text.parse::<u64>().map_err(|_| invalid(field))
}

/// # Errors
/// When the seed is not a 64-bit decimal number.
pub fn seed(text: &str) -> Result<pachinko_simulator::rng::Seed, ErrorDto> {
    word(text, "seed").map(pachinko_simulator::rng::Seed)
}

/// # Errors
/// When the carried generator or aggregate is not one this adapter wrote.
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
            first_hits: dto.first_hits,
            rounds: dto.rounds,
            hits: dto.hits,
            truncated_combos: dto.truncated_combos,
            histogram: dto.histogram.iter().copied().collect(),
        },
    })
}

pub fn progress_dto(progress: &Progress) -> ProgressDto {
    let [a, b, c, d] = progress.rng.state();
    let aggregate = &progress.aggregate;
    ProgressDto {
        rng: [a.to_string(), b.to_string(), c.to_string(), d.to_string()],
        sessions: aggregate.sessions,
        mean: aggregate.mean,
        m2: aggregate.m2,
        min_yen: aggregate.min_yen,
        max_yen: aggregate.max_yen,
        wins: aggregate.wins,
        first_hits: aggregate.first_hits,
        rounds: aggregate.rounds,
        hits: aggregate.hits,
        truncated_combos: aggregate.truncated_combos,
        histogram: aggregate
            .histogram
            .iter()
            .map(|(&bucket, &count)| (bucket, count))
            .collect(),
    }
}

pub fn summary_dto(progress: &Progress, plan: &Plan) -> SummaryDto {
    let aggregate = &progress.aggregate;
    SummaryDto {
        sessions: aggregate.sessions,
        planned: plan.sessions.get(),
        finished: progress.is_finished(plan),
        mean_yen: aggregate.mean_yen(),
        standard_deviation_yen: aggregate.standard_deviation(),
        win_rate: aggregate.win_rate(),
        min_yen: aggregate.min_yen,
        max_yen: aggregate.max_yen,
        rounds_per_first_hit: aggregate.rounds_per_first_hit(),
        average_combo: aggregate.average_combo(),
        truncated_combos: aggregate.truncated_combos,
        histogram: histogram_dto(aggregate),
    }
}

fn outcome_dto(outcome: &Outcome, net_balls_per_round: u32) -> OutcomeDto {
    let by_the_machine = outcome.reward.rounds.saturating_mul(net_balls_per_round);
    OutcomeDto {
        probability: outcome.probability.value(),
        rounds: outcome.reward.rounds,
        hits: outcome.reward.hits,
        next: target_dto(outcome.next),
        balls: (outcome.reward.balls != by_the_machine).then_some(outcome.reward.balls),
    }
}

pub fn normalized_dto(spec: &NormalizedSpec) -> NormalizedSpecDto {
    NormalizedSpecDto {
        schema_version: spec.schema_version.get(),
        hit_chance: spec.hit_chance.value(),
        entry: spec
            .entry
            .iter()
            .map(|outcome| outcome_dto(outcome, spec.net_balls_per_round))
            .collect(),
        states: spec
            .states
            .iter()
            .map(|state| StateDto {
                outcomes: state
                    .outcomes
                    .iter()
                    .map(|outcome| outcome_dto(outcome, spec.net_balls_per_round))
                    .collect(),
                fills_gauge: state.fills_gauge,
            })
            .collect(),
        origins: spec
            .origins
            .iter()
            .map(|origin| OriginDto {
                mode: origin.mode.as_str().to_owned(),
                combo: origin.combo,
            })
            .collect(),
        net_balls_per_round: spec.net_balls_per_round,
        relief_drive: spec
            .relief_drive
            .map(|relief_drive| NormalizedReliefDriveDto {
                gauge: relief_drive.gauge,
                target: target_dto(relief_drive.target),
            }),
    }
}

fn restart_kind_dto(restart: Restart) -> RestartKindDto {
    match restart {
        Restart::Filled(spins) => RestartKindDto::Filled { spins },
        Restart::Spent => RestartKindDto::Spent,
    }
}

pub fn analysis_dto(analysis: &Analysis, normalized: &NormalizedSpec) -> AnalysisDto {
    AnalysisDto {
        engine_version: analysis.engine_version.get(),
        schema_version: analysis.schema_version.get(),
        average_rounds: analysis.average_rounds,
        average_combo: analysis.average_combo,
        balls_per_round: analysis.balls_per_round.value(),
        average_payout: analysis.average_payout.value(),
        payout_scale: analysis.payout_scale,
        total_chance_one_in: analysis.total_chance.value(),
        round_chance_one_in: analysis.round_chance.value(),
        mode_entry: analysis
            .mode_entry
            .iter()
            .map(|entry| ModeEntryDto {
                mode: entry.mode.as_str().to_owned(),
                probability: entry.probability,
            })
            .collect(),
        derivation: analysis
            .derivation
            .iter()
            .map(|state| DerivationDto {
                mode: state.origin.mode.as_str().to_owned(),
                combo: state.origin.combo,
                average_rounds: state.average_rounds,
                average_combo: state.average_combo,
                average_balls: state.average_balls,
            })
            .collect(),
        normalized: normalized_dto(normalized),
        relief_drive: analysis
            .relief_drive
            .as_ref()
            .map(|relief_drive| ReliefDriveFiguresDto {
                gauge: relief_drive.gauge,
                reach_probability: relief_drive.reach_probability,
                rounds_after: relief_drive.rounds_after,
                combo_after: relief_drive.combo_after,
                balls_after: relief_drive.balls_after,
                restarts: relief_drive
                    .restarts
                    .iter()
                    .map(|restart| RestartDto {
                        restart: restart_kind_dto(restart.restart),
                        weight: restart.weight,
                        spins: restart.spins,
                        rounds: restart.rounds,
                        hits: restart.hits,
                        balls: restart.balls,
                    })
                    .collect(),
                endings: relief_drive
                    .endings
                    .iter()
                    .map(|ending| EndingDto {
                        state: ending.state,
                        filled: ending.filled,
                        unbroken: ending.unbroken,
                        chances: ending
                            .chances
                            .iter()
                            .map(|&(restart, chance)| EndingChanceDto {
                                restart: restart_kind_dto(restart),
                                chance,
                            })
                            .collect(),
                    })
                    .collect(),
            }),
    }
}

/// A component's name as the JSON names its table.
fn component_name(component: Component) -> String {
    match component {
        Component::RegularGame => "regularGame",
        Component::Label => "label",
        Component::Allotment => "allotment",
        Component::SpecialTime => "specialTime",
        Component::Rapid => "rapid",
        Component::LeftoverQueue => "leftoverQueue",
        Component::Rushing => "rushing",
        Component::UntilHit => "untilHit",
        Component::OnMiss => "onMiss",
        Component::LuckyTrigger => "luckyTrigger",
        Component::ReliefDrive => "reliefDrive",
    }
    .to_owned()
}

fn location_dto(location: &Location) -> LocationDto {
    match location {
        Location::Regular => LocationDto::Regular,
        Location::Mode(mode) => LocationDto::Mode {
            mode: mode.as_str().to_owned(),
        },
    }
}

fn problem_name(problem: ProbabilityProblem) -> String {
    match problem {
        ProbabilityProblem::NotFinite => "not-finite",
        ProbabilityProblem::OutOfRange => "out-of-range",
        ProbabilityProblem::Zero => "zero",
    }
    .to_owned()
}

pub fn spec_error_dto(error: &SpecError) -> ErrorDto {
    match error {
        SpecError::InvalidProbability { at, problem } => ErrorDto::InvalidProbability {
            at: location_dto(at),
            problem: problem_name(*problem),
        },
        SpecError::InvalidDistribution { at, sum } => ErrorDto::InvalidDistribution {
            at: location_dto(at),
            sum_basis_points: *sum,
        },
        SpecError::DuplicateMode { mode } => ErrorDto::DuplicateMode {
            mode: mode.as_str().to_owned(),
        },
        SpecError::NoRegularGame => ErrorDto::NoRegularGame,
        SpecError::SeveralRegularGames => ErrorDto::SeveralRegularGames,
        SpecError::MissingComponent { entity, component } => ErrorDto::MissingComponent {
            entity: entity.as_str().to_owned(),
            component: component_name(*component),
        },
        SpecError::MissingKind { entity } => ErrorDto::MissingKind {
            entity: entity.as_str().to_owned(),
        },
        SpecError::ConflictingComponents {
            entity,
            first,
            second,
        } => ErrorDto::ConflictingComponents {
            entity: entity.as_str().to_owned(),
            first: component_name(*first),
            second: component_name(*second),
        },
        SpecError::StrayComponent { entity, component } => ErrorDto::StrayComponent {
            entity: entity.as_str().to_owned(),
            component: component_name(*component),
        },
        SpecError::UnknownMode { at, mode } => ErrorDto::UnknownMode {
            at: location_dto(at),
            mode: mode.as_str().to_owned(),
        },
        SpecError::UnreachableState { mode } => ErrorDto::UnreachableState {
            mode: mode.as_str().to_owned(),
        },
        SpecError::NonAbsorbingModel { mode } => ErrorDto::NonAbsorbingModel {
            mode: mode.as_str().to_owned(),
        },
        SpecError::UnsupportedSpec { reason } => ErrorDto::UnsupportedSpec {
            reason: match *reason {
                Unsupported::TooManyStates { states, limit } => {
                    UnsupportedDto::TooManyStates { states, limit }
                }
                Unsupported::LuckyTriggerToItself => UnsupportedDto::LuckyTriggerToItself,
                Unsupported::LuckyTriggerOnEntry => UnsupportedDto::LuckyTriggerOnEntry,
            },
        },
    }
}

pub fn solve_error_dto(error: SolveError) -> ErrorDto {
    ErrorDto::SolveFailed {
        reason: match error {
            SolveError::Singular => "singular",
            SolveError::DanglingTarget => "dangling-target",
        }
        .to_owned(),
    }
}

/// # Errors
/// When the carried generator is not one this adapter wrote.
pub fn generator(rng: &[String; 4]) -> Result<Rng, ErrorDto> {
    let [a, b, c, d] = rng;
    let state = [
        word(a, "progress.rng[0]")?,
        word(b, "progress.rng[1]")?,
        word(c, "progress.rng[2]")?,
        word(d, "progress.rng[3]")?,
    ];
    Rng::from_state(state).ok_or_else(|| invalid("progress.rng"))
}

/// # Errors
/// When the carried generator is not one this adapter wrote.
pub fn estimate(dto: &EstimateProgressDto) -> Result<Estimate, ErrorDto> {
    Ok(Estimate {
        rng: generator(&dto.rng)?,
        tally: Tally {
            cycles: dto.cycles,
            spins: dto.spins,
            rounds: dto.rounds,
            truncated_combos: dto.truncated_combos,
            spins_squared: dto.spins_squared,
            rounds_squared: dto.rounds_squared,
            spins_rounds: dto.spins_rounds,
        },
        gauge: ReliefGauge {
            filled: dto.filled,
            spent: dto.spent,
        },
    })
}

pub fn estimate_progress_dto(estimate: &Estimate) -> EstimateProgressDto {
    let [a, b, c, d] = estimate.rng.state();
    let tally = &estimate.tally;
    EstimateProgressDto {
        rng: [a.to_string(), b.to_string(), c.to_string(), d.to_string()],
        cycles: tally.cycles,
        spins: tally.spins,
        rounds: tally.rounds,
        truncated_combos: tally.truncated_combos,
        spins_squared: tally.spins_squared,
        rounds_squared: tally.rounds_squared,
        spins_rounds: tally.spins_rounds,
        filled: estimate.gauge.filled,
        spent: estimate.gauge.spent,
    }
}

pub fn estimate_summary_dto(
    estimate: &Estimate,
    planned: NonZeroU64,
    payout_per_round: Balls,
) -> EstimateSummaryDto {
    let tally = &estimate.tally;
    EstimateSummaryDto {
        cycles: tally.cycles,
        planned: planned.get(),
        finished: estimate.is_finished(planned),
        round_chance_one_in: tally.round_chance_one_in(),
        round_chance_margin: tally.round_chance_margin(),
        rounds_per_first_hit: tally.rounds_per_cycle(),
        payout_per_round: payout_per_round.value(),
        truncated_combos: tally.truncated_combos,
    }
}

fn amount(value: f64, field: &str) -> Result<f64, ErrorDto> {
    (value.is_finite() && value >= 0.0)
        .then_some(value)
        .ok_or_else(|| invalid(field))
}

/// # Errors
/// When the value is not a finite figure above nothing.
pub fn positive(value: f64, field: &str) -> Result<f64, ErrorDto> {
    (value.is_finite() && value > 0.0)
        .then_some(value)
        .ok_or_else(|| invalid(field))
}

/// # Errors
/// A figure that is not one a play can have, named by its path.
pub fn inference_setup(
    request: &InferenceRequest,
    payout_scale: f64,
) -> Result<InferenceSetup, ErrorDto> {
    Ok(InferenceSetup {
        told: Told {
            hours: positive(request.told.hours, "told.hours")?,
            outlay: amount(request.told.outlay, "told.outlay")?,
            takings: amount(request.told.takings, "told.takings")?,
            jackpots: request.told.jackpots,
        },
        belief: Belief {
            mean: positive(request.belief.mean, "belief.mean")?,
            deviation: amount(request.belief.deviation, "belief.deviation")?,
        },
        spins_per_hour: positive(request.spins_per_hour, "spinsPerHour")?,
        rented_per_thousand: positive(request.rented_per_thousand, "rentedPerThousand")?,
        ball_value: BallValue::new(request.ball_value).ok_or_else(|| invalid("ballValue"))?,
        payout_scale,
        balls_per_spin: positive(request.balls_per_spin, "ballsPerSpin")?,
    })
}

/// # Errors
/// When the carried generator or weights are not ones this adapter wrote.
pub fn inference(dto: &InferenceProgressDto) -> Result<Inference, ErrorDto> {
    if dto.weighed.bins.len() != BINS || dto.weighed.values.len() != VALUE_BINS {
        return Err(invalid("progress.weighed"));
    }
    Ok(Inference {
        rng: generator(&dto.rng)?,
        tally: InferenceTally {
            trials: dto.trials,
            weighed: Weighed {
                bins: dto.weighed.bins.clone(),
                values: dto.weighed.values.clone(),
                weight: dto.weighed.weight,
                weight_squared: dto.weighed.weight_squared,
                spins: dto.weighed.spins,
            },
            beyond: Beyond {
                outlay_at_least: dto.beyond.outlay_at_least,
                outlay_at_most: dto.beyond.outlay_at_most,
                takings_at_least: dto.beyond.takings_at_least,
                takings_at_most: dto.beyond.takings_at_most,
                result_at_least: dto.beyond.result_at_least,
                result_at_most: dto.beyond.result_at_most,
            },
        },
    })
}

pub fn inference_progress_dto(inference: &Inference) -> InferenceProgressDto {
    let [a, b, c, d] = inference.rng.state();
    let (weighed, beyond) = (&inference.tally.weighed, &inference.tally.beyond);
    InferenceProgressDto {
        rng: [a.to_string(), b.to_string(), c.to_string(), d.to_string()],
        trials: inference.tally.trials,
        weighed: WeighedDto {
            bins: weighed.bins.clone(),
            values: weighed.values.clone(),
            weight: weighed.weight,
            weight_squared: weighed.weight_squared,
            spins: weighed.spins,
        },
        beyond: BeyondDto {
            outlay_at_least: beyond.outlay_at_least,
            outlay_at_most: beyond.outlay_at_most,
            takings_at_least: beyond.takings_at_least,
            takings_at_most: beyond.takings_at_most,
            result_at_least: beyond.result_at_least,
            result_at_most: beyond.result_at_most,
        },
    }
}

pub fn inference_summary_dto(inference: &Inference, planned: NonZeroU64) -> InferenceSummaryDto {
    let (rarest, way) = inference.tally.beyond.rarest();
    InferenceSummaryDto {
        trials: inference.tally.trials,
        planned: planned.get(),
        finished: inference.is_finished(planned),
        reading: inference.tally.reading().map(|reading| ReadingDto {
            lower: reading.lower,
            middle: reading.middle,
            upper: reading.upper,
            spins: reading.spins,
            value: reading.value,
            effective_trials: reading.effective_trials,
        }),
        rarest,
        rarest_way: match way {
            Way::OutlayAtLeast => WayDto::OutlayAtLeast,
            Way::OutlayAtMost => WayDto::OutlayAtMost,
            Way::TakingsAtLeast => WayDto::TakingsAtLeast,
            Way::TakingsAtMost => WayDto::TakingsAtMost,
            Way::ResultAtLeast => WayDto::ResultAtLeast,
            Way::ResultAtMost => WayDto::ResultAtMost,
        },
    }
}

/// # Errors
/// When the carried generator or tally is not one this adapter wrote.
pub fn hyena_hunt(dto: &HyenaHuntProgressDto) -> Result<HyenaHunt, ErrorDto> {
    let sittings = progress(&dto.sittings)?;
    Ok(HyenaHunt {
        rng: sittings.rng,
        tally: HyenaHuntTally {
            aggregate: sittings.aggregate,
            relief_drives: dto.relief_drives,
            spins: dto.spins,
        },
    })
}

pub fn hyena_hunt_progress_dto(hyena_hunt: &HyenaHunt) -> HyenaHuntProgressDto {
    HyenaHuntProgressDto {
        sittings: progress_dto(&Progress {
            rng: hyena_hunt.rng,
            aggregate: hyena_hunt.tally.aggregate.clone(),
        }),
        relief_drives: hyena_hunt.tally.relief_drives,
        spins: hyena_hunt.tally.spins,
    }
}

pub fn hyena_hunt_summary_dto(hyena_hunt: &HyenaHunt, planned: NonZeroU64) -> HyenaHuntSummaryDto {
    let tally = &hyena_hunt.tally;
    let aggregate = &tally.aggregate;
    HyenaHuntSummaryDto {
        trials: tally.trials(),
        planned: planned.get(),
        finished: hyena_hunt.is_finished(planned),
        mean_yen: aggregate.mean_yen(),
        margin_yen: tally.margin_yen(),
        standard_deviation_yen: aggregate.standard_deviation(),
        win_rate: aggregate.win_rate(),
        min_yen: aggregate.min_yen,
        max_yen: aggregate.max_yen,
        relief_drive_rate: tally.relief_drive_rate(),
        mean_spins: tally.mean_spins(),
        truncated_combos: aggregate.truncated_combos,
        histogram: histogram_dto(aggregate),
    }
}

fn histogram_dto(aggregate: &Aggregate) -> Vec<BucketDto> {
    #[allow(clippy::cast_precision_loss)]
    aggregate
        .histogram
        .iter()
        .map(|(&bucket, &count)| BucketDto {
            from_yen: bucket as f64 * HISTOGRAM_BUCKET_YEN,
            to_yen: (bucket + 1) as f64 * HISTOGRAM_BUCKET_YEN,
            count,
        })
        .collect()
}
