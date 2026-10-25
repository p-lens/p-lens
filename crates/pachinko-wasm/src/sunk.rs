//! ハマり台の投資額 across the boundary: its shapes, mirrored in
//! `packages/contracts/src/pachinko/sunk.ts`, and its one call. Kept in a
//! file of its own, as the feature is kept in a folder of its own, so that
//! it is taken out whole.

use std::collections::BTreeMap;
use std::num::NonZeroU64;

use pachinko_domain::normalized::NormalizedSpec;
use pachinko_simulator::sunk::{
    Sunk, SunkSetup, SunkTally, Way, advance_sunk, dry_one_in, mean_outlay, outlay_at, way_of,
};
use serde::{Deserialize, Serialize};

use crate::api::{parse, payout_yield, positive_count, reply, source};
use crate::convert;
use crate::dto::{ConditionsDto, ErrorDto, SourceDto};

/// What a cabinet's data counter shows for the day.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CounterDto {
    pub spins: u64,
    pub jackpots: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub since_last: Option<u64>,
}

/// A counter's day played out until so many days match it, or so many are played.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SunkRequest {
    pub source: SourceDto,
    pub conditions: ConditionsDto,
    pub counter: CounterDto,
    /// Spins for ¥1,000.
    pub spin_performance: f64,
    /// Balls ¥1,000 rents.
    pub rented_per_thousand: f64,
    pub trials: u64,
    /// Days matching the counter after which no more are played.
    pub enough: u64,
    /// A 64-bit seed as a decimal string.
    pub seed: String,
    pub chunk: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub progress: Option<SunkProgressDto>,
}

/// A run in progress, carried across chunks. Opaque to JavaScript.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SunkProgressDto {
    /// The generator's four words, as decimal strings.
    pub rng: [String; 4],
    pub trials: u64,
    pub matched: u64,
    pub lots: Vec<(u64, u64)>,
}

/// The cash the matching days took, in yen: at a tenth, a quarter, half,
/// three quarters and nine tenths of them, and on average.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OutlayDto {
    pub low: u64,
    pub lower: u64,
    pub middle: u64,
    pub upper: u64,
    pub high: u64,
    pub mean: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SunkSummaryDto {
    pub trials: u64,
    pub planned: u64,
    pub matched: u64,
    pub finished: bool,
    pub way: WayDto,
    /// How seldom a cabinet goes the counter's spins since its last jackpot
    /// without one, where that is known exactly: once in so many times.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dry_one_in: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub outlay: Option<OutlayDto>,
}

/// How a counter was played out: one day of no jackpot, days with the last
/// jackpot where the counter says, or days searched for the counter.
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum WayDto {
    Dry,
    Pinned,
    Searched,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SunkResponse {
    pub progress: SunkProgressDto,
    pub summary: SunkSummaryDto,
}

const SHARES: [f64; 5] = [0.1, 0.25, 0.5, 0.75, 0.9];

fn progress(dto: &SunkProgressDto) -> Result<Sunk, ErrorDto> {
    Ok(Sunk {
        rng: convert::generator(&dto.rng)?,
        tally: SunkTally {
            trials: dto.trials,
            matched: dto.matched,
            lots: dto.lots.iter().copied().collect::<BTreeMap<_, _>>(),
        },
    })
}

fn progress_dto(sunk: &Sunk) -> SunkProgressDto {
    let [a, b, c, d] = sunk.rng.state();
    SunkProgressDto {
        rng: [a.to_string(), b.to_string(), c.to_string(), d.to_string()],
        trials: sunk.tally.trials,
        matched: sunk.tally.matched,
        lots: sunk
            .tally
            .lots
            .iter()
            .map(|(&lots, &count)| (lots, count))
            .collect(),
    }
}

fn outlay_dto(tally: &SunkTally, setup: &SunkSetup, way: Way) -> Option<OutlayDto> {
    let at = outlay_at(tally, setup, way, &SHARES)?;
    let mean = mean_outlay(tally, setup, way)?;
    match at.as_slice() {
        &[low, lower, middle, upper, high] => Some(OutlayDto {
            low,
            lower,
            middle,
            upper,
            high,
            mean,
        }),
        _ => None,
    }
}

fn way_dto(way: Way) -> WayDto {
    match way {
        Way::Dry => WayDto::Dry,
        Way::Pinned { .. } => WayDto::Pinned,
        Way::Searched => WayDto::Searched,
    }
}

fn summary_dto(
    spec: &NormalizedSpec,
    setup: &SunkSetup,
    sunk: &Sunk,
    trials: NonZeroU64,
    enough: NonZeroU64,
) -> SunkSummaryDto {
    let way = way_of(spec, setup);
    SunkSummaryDto {
        trials: sunk.tally.trials,
        planned: trials.get(),
        matched: sunk.tally.matched,
        finished: sunk.is_finished(way, trials, enough),
        way: way_dto(way),
        dry_one_in: dry_one_in(spec, setup, way),
        outlay: outlay_dto(&sunk.tally, setup, way),
    }
}

fn sunk(request: &SunkRequest) -> Result<SunkResponse, ErrorDto> {
    let spec = source(&request.source)?;
    let conditions = convert::conditions(&request.conditions)?;
    let setup = SunkSetup {
        spins: request.counter.spins,
        jackpots: request.counter.jackpots,
        since_last: request.counter.since_last,
        spin_performance: convert::positive(request.spin_performance, "spinPerformance")?,
        rented_per_thousand: convert::positive(request.rented_per_thousand, "rentedPerThousand")?,
        payout: payout_yield(&spec, &conditions)?,
    };
    let trials = positive_count(request.trials, "trials")?;
    let enough = positive_count(request.enough, "enough")?;
    let carried = match &request.progress {
        Some(carried) => progress(carried)?,
        None => Sunk::start(convert::seed(&request.seed)?),
    };
    let advanced = advance_sunk(
        &spec,
        &setup,
        way_of(&spec, &setup),
        (trials, enough),
        &carried,
        positive_count(request.chunk, "chunk")?,
    );
    Ok(SunkResponse {
        progress: progress_dto(&advanced),
        summary: summary_dto(&spec, &setup, &advanced, trials, enough),
    })
}

/// One chunk of a counter's day played out, resumable from the progress it returns.
pub fn sunk_chunk(json: &str) -> String {
    reply(parse::<SunkRequest>(json).and_then(|request| sunk(&request)))
}
