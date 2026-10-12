//! The calls the boundary offers, as plain functions over JSON text,
//! so they are tested natively and wrapped for WebAssembly unchanged.

use std::num::NonZeroU64;

use pachinko_domain::normalized::NormalizedSpec;
use pachinko_engine::analysis::analyze as solve;
use pachinko_engine::hyena_hunt::hyena_hunt_from;
use pachinko_engine::normalize::normalize as normalise;
use pachinko_simulator::estimate::{Estimate, advance_estimate};
use pachinko_simulator::hyena_hunt::{HyenaHunt, HyenaHuntSetup, advance_hyena_hunt};
use pachinko_simulator::inference::{Inference, advance_inference};
use pachinko_simulator::simulation::{Progress, advance};
use serde::Serialize;
use serde::de::DeserializeOwned;

use crate::convert;
use crate::dto::{
    AnalysisDto, AnalyzeRequest, Envelope, ErrorDto, EstimateRequest, EstimateResponse,
    HyenaHuntRequest, HyenaHuntResponse, HyenaHuntRowDto, HyenaHuntTableRequest, InferenceRequest,
    InferenceResponse, NormalizeRequest, NormalizedSpecDto, SimulateRequest, SimulateResponse,
    SourceDto,
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

fn normalized(request: &NormalizeRequest) -> Result<NormalizedSpecDto, ErrorDto> {
    let spec = convert::spec(&request.spec)?;
    normalise(&spec)
        .map(|normalized| convert::normalized_dto(&normalized))
        .map_err(|error| convert::spec_error_dto(&error))
}

fn analysis(request: &AnalyzeRequest) -> Result<AnalysisDto, ErrorDto> {
    let spec = source(&request.source)?;
    let conditions = convert::conditions(&request.conditions)?;
    let analysis = solve(&spec, &conditions).map_err(convert::solve_error_dto)?;
    Ok(convert::analysis_dto(&analysis, &spec))
}

fn simulation(request: &SimulateRequest) -> Result<SimulateResponse, ErrorDto> {
    let spec = source(&request.source)?;
    let conditions = convert::conditions(&request.conditions)?;
    let play_conditions = convert::play(&request.play)?;
    let payout_scale = solve(&spec, &conditions)
        .map_err(convert::solve_error_dto)?
        .payout_scale;
    let plan = convert::plan(&request.plan, payout_scale, play_conditions)?;
    let progress = match &request.progress {
        Some(carried) => convert::progress(carried)?,
        None => Progress::start(convert::seed(&request.seed)?),
    };
    let chunk = NonZeroU64::new(request.chunk).ok_or_else(|| ErrorDto::InvalidValue {
        field: "chunk".to_owned(),
    })?;
    let advanced = advance(&spec, &plan, &progress, chunk);
    Ok(SimulateResponse {
        progress: convert::progress_dto(&advanced),
        summary: convert::summary_dto(&advanced, &plan),
    })
}

fn estimation(request: &EstimateRequest) -> Result<EstimateResponse, ErrorDto> {
    let spec = source(&request.source)?;
    let conditions = convert::conditions(&request.conditions)?;
    let payout_per_round = solve(&spec, &conditions)
        .map_err(convert::solve_error_dto)?
        .balls_per_round;
    let cycles = NonZeroU64::new(request.cycles).ok_or_else(|| ErrorDto::InvalidValue {
        field: "cycles".to_owned(),
    })?;
    let estimate = match &request.progress {
        Some(carried) => convert::estimate(carried)?,
        None => Estimate::start(convert::seed(&request.seed)?),
    };
    let chunk = NonZeroU64::new(request.chunk).ok_or_else(|| ErrorDto::InvalidValue {
        field: "chunk".to_owned(),
    })?;
    let advanced = advance_estimate(&spec, cycles, &estimate, chunk);
    Ok(EstimateResponse {
        progress: convert::estimate_progress_dto(&advanced),
        summary: convert::estimate_summary_dto(&advanced, cycles, payout_per_round),
    })
}

fn positive_count(value: u64, field: &str) -> Result<NonZeroU64, ErrorDto> {
    NonZeroU64::new(value).ok_or_else(|| ErrorDto::InvalidValue {
        field: field.to_owned(),
    })
}

fn hyena_hunting(request: &HyenaHuntRequest) -> Result<HyenaHuntResponse, ErrorDto> {
    let spec = source(&request.source)?;
    let conditions = convert::conditions(&request.conditions)?;
    let setup = HyenaHuntSetup {
        initial_spins: request.initial_spins,
        payout_scale: solve(&spec, &conditions)
            .map_err(convert::solve_error_dto)?
            .payout_scale,
        play: convert::play(&request.play)?,
    };
    let trials = positive_count(request.trials, "trials")?;
    let hyena_hunt = match &request.progress {
        Some(carried) => convert::hyena_hunt(carried)?,
        None => HyenaHunt::start(convert::seed(&request.seed)?),
    };
    let advanced = advance_hyena_hunt(
        &spec,
        &setup,
        trials,
        &hyena_hunt,
        positive_count(request.chunk, "chunk")?,
    );
    Ok(HyenaHuntResponse {
        progress: convert::hyena_hunt_progress_dto(&advanced),
        summary: convert::hyena_hunt_summary_dto(&advanced, trials),
    })
}

fn inferred(request: &InferenceRequest) -> Result<InferenceResponse, ErrorDto> {
    let spec = source(&request.source)?;
    let conditions = convert::conditions(&request.conditions)?;
    let payout_scale = solve(&spec, &conditions)
        .map_err(convert::solve_error_dto)?
        .payout_scale;
    let setup = convert::inference_setup(request, payout_scale)?;
    let trials = positive_count(request.trials, "trials")?;
    let inference = match &request.progress {
        Some(carried) => convert::inference(carried)?,
        None => Inference::start(convert::seed(&request.seed)?),
    };
    let advanced = advance_inference(
        &spec,
        &setup,
        trials,
        &inference,
        positive_count(request.chunk, "chunk")?,
    );
    Ok(InferenceResponse {
        progress: convert::inference_progress_dto(&advanced),
        summary: convert::inference_summary_dto(&advanced, trials),
    })
}

fn hyena_hunt_rows(request: &HyenaHuntTableRequest) -> Result<Vec<HyenaHuntRowDto>, ErrorDto> {
    let spec = source(&request.source)?;
    let conditions = convert::conditions(&request.conditions)?;
    let play = convert::play(&request.play)?;
    let analysis = solve(&spec, &conditions).map_err(convert::solve_error_dto)?;
    Ok(request
        .initial_spins
        .iter()
        .map(|&initial_spins| {
            let sitting = hyena_hunt_from(&analysis, spec.hit_chance.value(), initial_spins, play);
            HyenaHuntRowDto {
                initial_spins,
                yen: sitting.yen,
                spins: sitting.spins,
                rounds: sitting.rounds,
                relief_drive_probability: sitting.relief_drive_probability,
            }
        })
        .collect())
}

/// A spec normalised, for storing with a model version.
pub fn normalize(json: &str) -> String {
    reply(parse::<NormalizeRequest>(json).and_then(|request| normalized(&request)))
}

/// Exact figures for a spec under a formula's conditions.
pub fn analyze(json: &str) -> String {
    reply(parse::<AnalyzeRequest>(json).and_then(|request| analysis(&request)))
}

/// One chunk of a Monte Carlo run, resumable from the progress it returns.
pub fn simulate_chunk(json: &str) -> String {
    reply(parse::<SimulateRequest>(json).and_then(|request| simulation(&request)))
}

/// One chunk of an estimate of a formula's figures, resumable from the progress it returns.
pub fn estimate_chunk(json: &str) -> String {
    reply(parse::<EstimateRequest>(json).and_then(|request| estimation(&request)))
}

/// One chunk of a sampled 遊タイム狙い, resumable from the progress it returns.
pub fn hyena_hunt_chunk(json: &str) -> String {
    reply(parse::<HyenaHuntRequest>(json).and_then(|request| hyena_hunting(&request)))
}

/// One chunk of the weighing of a play told of afterwards, resumable from the progress it returns.
pub fn inference_chunk(json: &str) -> String {
    reply(parse::<InferenceRequest>(json).and_then(|request| inferred(&request)))
}

/// 遊タイム狙い solved exactly from each of several initial spins.
pub fn hyena_hunt_table(json: &str) -> String {
    reply(parse::<HyenaHuntTableRequest>(json).and_then(|request| hyena_hunt_rows(&request)))
}
