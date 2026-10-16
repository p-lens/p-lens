//! The calls the boundary offers, as plain functions over JSON text,
//! so they are tested natively and wrapped for WebAssembly unchanged.

use std::num::NonZeroU64;

use pachislot_domain::normalized::NormalizedSpec;
use pachislot_engine::analysis::{Analysis, analyze as solve};
use pachislot_engine::normalize::normalize as normalise;
use pachislot_engine::posterior::{posterior as infer, posterior_told};
use pachislot_engine::theoretical::{
    hunt_theoretical_value, path_theoretical_value as weigh_path, theoretical_value as weigh,
};
use pachislot_simulator::estimate::{Estimate, advance_estimate};
use pachislot_simulator::game::{GameModel, models};
use pachislot_simulator::session::{Mix, Plan, Progress, advance};
use serde::Serialize;
use serde::de::DeserializeOwned;

use crate::convert;
use crate::dto::{
    AnalysisDto, AnalyzeRequest, ConditionsDto, Envelope, ErrorDto, EstimateRequest,
    EstimateResponse, HuntDto, HuntRequest, NormalizeRequest, NormalizedSpecDto, PlayedDto,
    PosteriorDto, PosteriorRequest, SimulateRequest, SimulateResponse, SourceDto,
    TheoreticalValueDto, TheoreticalValueRequest,
};

fn parse<T: DeserializeOwned>(json: &str) -> Result<T, ErrorDto> {
    serde_json::from_str(json).map_err(|error| ErrorDto::MalformedRequest {
        detail: error.to_string(),
    })
}

/// The envelope as JSON. Serialising these types cannot fail; were it ever to,
/// the answer is still an envelope, never a panic across the boundary.
fn reply<T: Serialize>(result: Result<T, ErrorDto>) -> String {
    serde_json::to_string(&Envelope::from(result)).unwrap_or_else(|error| {
        format!(
            r#"{{"ok":false,"error":{{"type":"malformed-request","detail":{}}}}}"#,
            serde_json::Value::String(error.to_string())
        )
    })
}

fn source(source: &SourceDto) -> Result<NormalizedSpec, ErrorDto> {
    match source {
        SourceDto::Spec { spec } => {
            normalise(&convert::spec(spec)?).map_err(|error| convert::spec_error_dto(&error))
        }
        SourceDto::Normalized { normalized } => convert::normalized_spec(normalized),
    }
}

fn solved(spec: &NormalizedSpec, conditions: &ConditionsDto) -> Result<Analysis, ErrorDto> {
    solve(spec, &convert::conditions(conditions)?)
        .map_err(|error| convert::analysis_error_dto(&error))
}

fn game_models(spec: &NormalizedSpec, analysis: &Analysis) -> Result<Vec<GameModel>, ErrorDto> {
    models(spec, analysis).map_err(|error| convert::analysis_error_dto(&error))
}

fn positive_count(value: u64, field: &str) -> Result<NonZeroU64, ErrorDto> {
    NonZeroU64::new(value).ok_or_else(|| ErrorDto::InvalidValue {
        field: field.to_owned(),
    })
}

fn normalized(request: &NormalizeRequest) -> Result<NormalizedSpecDto, ErrorDto> {
    let spec = convert::spec(&request.spec)?;
    normalise(&spec)
        .map(|normalized| convert::normalized_dto(&normalized))
        .map_err(|error| convert::spec_error_dto(&error))
}

fn analysis(request: &AnalyzeRequest) -> Result<AnalysisDto, ErrorDto> {
    let spec = source(&request.source)?;
    let analysis = solved(&spec, &request.conditions)?;
    Ok(convert::analysis_dto(&analysis, &spec))
}

fn posterior_of(request: &PosteriorRequest) -> Result<PosteriorDto, ErrorDto> {
    let spec = source(&request.source)?;
    let prior = request
        .prior
        .as_ref()
        .map(convert::distribution)
        .transpose()?;
    let segments = convert::segments(&request.segments)?;
    let path = request.path.as_ref().map(convert::path);
    match &request.told {
        Some(told) => posterior_told(&spec, prior.as_ref(), &convert::told(told)),
        None => infer(&spec, prior.as_ref(), &segments, path.as_ref()),
    }
    .map(|posterior| convert::posterior_dto(&posterior))
    .map_err(|error| convert::inference_error_dto(&error))
}

fn theoretical_value_of(
    request: &TheoreticalValueRequest,
) -> Result<TheoreticalValueDto, ErrorDto> {
    let spec = source(&request.source)?;
    let analysis = solved(&spec, &request.conditions)?;
    let weights = convert::weights(&request.weights)?;
    let play = convert::play(&request.play)?;
    let value = match (&request.played, &spec.at_rules) {
        (PlayedDto::Games { games }, None) => weigh(&analysis, spec.bet, &weights, play, *games),
        (PlayedDto::Path { path }, Some(rules)) => weigh_path(
            &spec,
            rules,
            &analysis,
            &weights,
            play,
            &convert::path(path),
        ),
        _ => return Err(ErrorDto::PlayedMismatch),
    };
    Ok(convert::theoretical_value_dto(&value))
}

fn hunts(request: &HuntRequest) -> Result<Vec<HuntDto>, ErrorDto> {
    let spec = source(&request.source)?;
    let rules = spec.at_rules.as_ref().ok_or(ErrorDto::PathWithoutAt)?;
    let weights = convert::weights(&request.weights)?;
    let play = convert::play(&request.play)?;
    request
        .seats
        .iter()
        .map(|seat| {
            hunt_theoretical_value(&spec, rules, &weights, play, convert::path_start(seat))
                .map(|value| HuntDto {
                    games: value.games,
                    at_medals: value.at_medals,
                    trigger_medals: value.trigger_medals,
                    medals: value.medals,
                    yen: value.yen,
                    by_ceiling: value.by_ceiling,
                })
                .ok_or(ErrorDto::AtNeverComes)
        })
        .collect()
}

fn simulation(request: &SimulateRequest) -> Result<SimulateResponse, ErrorDto> {
    let spec = source(&request.source)?;
    let analysis = solved(&spec, &request.conditions)?;
    let mix = Mix::new(
        game_models(&spec, &analysis)?,
        convert::weights(&request.weights)?,
    )
    .ok_or_else(|| ErrorDto::InvalidValue {
        field: "weights".to_owned(),
    })?;
    let plan = Plan {
        sessions: positive_count(request.plan.sessions, "plan.sessions")?,
        games: request.plan.games,
        bet: spec.bet,
        play: convert::play(&request.play)?,
    };
    let progress = match &request.progress {
        Some(carried) => convert::progress(carried)?,
        None => Progress::start(convert::seed(&request.seed)?),
    };
    let advanced = advance(
        &mix,
        &plan,
        &progress,
        positive_count(request.chunk, "chunk")?,
    );
    Ok(SimulateResponse {
        progress: convert::progress_dto(&advanced),
        summary: convert::summary_dto(&advanced, &plan),
    })
}

fn estimation(request: &EstimateRequest) -> Result<EstimateResponse, ErrorDto> {
    let spec = source(&request.source)?;
    let analysis = solved(&spec, &request.conditions)?;
    let models = game_models(&spec, &analysis)?;
    let estimate = match &request.progress {
        Some(carried) => {
            let estimate = convert::estimate(carried)?;
            let matches = estimate
                .tallies
                .iter()
                .map(|tally| tally.setting_level)
                .eq(models.iter().map(|model| model.setting_level));
            if !matches {
                return Err(ErrorDto::InvalidValue {
                    field: "progress.tallies".to_owned(),
                });
            }
            estimate
        }
        None => Estimate::start(convert::seed(&request.seed)?, &models),
    };
    let games_per_setting_level =
        positive_count(request.games_per_setting_level, "gamesPerSettingLevel")?;
    let advanced = advance_estimate(
        &models,
        games_per_setting_level,
        &estimate,
        positive_count(request.chunk, "chunk")?,
    );
    Ok(EstimateResponse {
        progress: convert::estimate_progress_dto(&advanced),
        summary: convert::estimate_summary_dto(&advanced, games_per_setting_level, spec.bet),
    })
}

pub fn normalize(json: &str) -> String {
    reply(parse::<NormalizeRequest>(json).and_then(|request| normalized(&request)))
}

pub fn analyze(json: &str) -> String {
    reply(parse::<AnalyzeRequest>(json).and_then(|request| analysis(&request)))
}

pub fn posterior(json: &str) -> String {
    reply(parse::<PosteriorRequest>(json).and_then(|request| posterior_of(&request)))
}

pub fn theoretical_value(json: &str) -> String {
    reply(parse::<TheoreticalValueRequest>(json).and_then(|request| theoretical_value_of(&request)))
}

pub fn hunt(json: &str) -> String {
    reply(parse::<HuntRequest>(json).and_then(|request| hunts(&request)))
}

pub fn simulate_chunk(json: &str) -> String {
    reply(parse::<SimulateRequest>(json).and_then(|request| simulation(&request)))
}

pub fn estimate_chunk(json: &str) -> String {
    reply(parse::<EstimateRequest>(json).and_then(|request| estimation(&request)))
}
