//! The shapes that cross to JavaScript. Kept apart from the domain types, so
//! a change inside the engine does not move the boundary, and mirrored in
//! `packages/contracts/src/pachinko/engine.ts`.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(
    tag = "type",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum ProbabilityDto {
    Ratio {
        numerator: u32,
        denominator_hundredths: u32,
    },
    Percent {
        basis_points: u32,
    },
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum NextDto {
    Regular,
    Mode { mode: String },
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AllotmentDto {
    pub share_basis_points: u32,
    pub rounds: u32,
    pub next: NextDto,
    /// The prize of the attacker this share's rounds open, where it is not the machine's.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prize_balls: Option<u32>,
    /// The count of that attacker, where it is not the machine's.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub count: Option<u32>,
    /// The rounds of the same jackpot that open another attacker.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub other_rounds: Vec<OtherRoundsDto>,
}

/// Rounds of a jackpot through another attacker than the share's first rounds.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OtherRoundsDto {
    pub rounds: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prize_balls: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub count: Option<u32>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LuckyTriggerDto {
    pub at_combo: u32,
    pub to: String,
}

/// An ST: so many spins at a raised chance.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SpecialTimeDto {
    pub spins: u32,
    pub chance: ProbabilityDto,
}

/// A 時短: so many spins at the regular game's chance.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RapidDto {
    pub spins: u32,
}

/// 残保留: the draws still queued, at the regular game's chance.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LeftoverQueueDto {
    pub draws: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RushingDto {
    pub continuation_rate: ProbabilityDto,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RegularGameDto {
    pub chance: ProbabilityDto,
}

/// A 遊タイム: once its `gauge` of regular-game spins fills without a jackpot, play moves to mode `to`.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ReliefDriveDto {
    pub gauge: u32,
    pub to: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedReliefDriveDto {
    pub gauge: u32,
    pub target: TargetDto,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PayoutDto {
    pub prize_balls: u32,
    pub count: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SpecDto {
    /// The version of this shape (`SpecVersion`): asked for, never assumed.
    pub v: u32,
    pub entities: Vec<String>,
    pub components: ComponentsDto,
    pub resources: ResourcesDto,
}

/// One table per component, keyed by entity; a table no entity has is left
/// out. A table this engine does not know is kept in `unsupported` and
/// refused by its name, never misread.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ComponentsDto {
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub regular_game: BTreeMap<String, RegularGameDto>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub label: BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub allotment: BTreeMap<String, Vec<AllotmentDto>>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub special_time: BTreeMap<String, SpecialTimeDto>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub rapid: BTreeMap<String, RapidDto>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub leftover_queue: BTreeMap<String, LeftoverQueueDto>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub rushing: BTreeMap<String, RushingDto>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub until_hit: Vec<String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub on_miss: BTreeMap<String, NextDto>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub lucky_trigger: BTreeMap<String, LuckyTriggerDto>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub relief_drive: BTreeMap<String, ReliefDriveDto>,
    #[serde(flatten, skip_serializing_if = "BTreeMap::is_empty")]
    pub unsupported: BTreeMap<String, serde_json::Value>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ResourcesDto {
    pub payout: PayoutDto,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum TargetDto {
    State { index: usize },
    End,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OutcomeDto {
    pub probability: f64,
    pub rounds: u32,
    pub hits: u32,
    pub next: TargetDto,
    /// Balls the rounds gain, said only where they are not the machine's
    /// payout rule times the rounds: a spec normalised before shares could
    /// pay on their own reads as it always did.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub balls: Option<u32>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StateDto {
    pub outcomes: Vec<OutcomeDto>,
    /// Spins that fill the relief gauge toward the 遊タイム when the state runs out; none is left out.
    #[serde(default, skip_serializing_if = "is_zero")]
    pub fills_gauge: u32,
}

#[allow(clippy::trivially_copy_pass_by_ref)]
fn is_zero(value: &u32) -> bool {
    *value == 0
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OriginDto {
    pub mode: String,
    pub combo: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedSpecDto {
    pub schema_version: u32,
    pub hit_chance: f64,
    pub entry: Vec<OutcomeDto>,
    pub states: Vec<StateDto>,
    pub origins: Vec<OriginDto>,
    pub net_balls_per_round: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub relief_drive: Option<NormalizedReliefDriveDto>,
}

/// What a calculation starts from: a spec to normalise, or a spec already
/// normalised — the form a stored model version keeps.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum SourceDto {
    Spec { spec: Box<SpecDto> },
    Normalized { normalized: NormalizedSpecDto },
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum RoundPayoutDto {
    FromSpec,
    Measured { balls: f64 },
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConditionsDto {
    pub round_payout: RoundPayoutDto,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlayDto {
    pub spin_performance: f64,
    pub ball_value: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NormalizeRequest {
    pub spec: SpecDto,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeRequest {
    pub source: SourceDto,
    pub conditions: ConditionsDto,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ModeEntryDto {
    pub mode: String,
    pub probability: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DerivationDto {
    pub mode: String,
    pub combo: u32,
    pub average_rounds: f64,
    pub average_combo: f64,
    pub average_balls: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisDto {
    pub engine_version: u32,
    pub schema_version: u32,
    pub average_rounds: f64,
    pub average_combo: f64,
    pub balls_per_round: f64,
    pub average_payout: f64,
    pub payout_scale: f64,
    pub total_chance_one_in: f64,
    pub round_chance_one_in: f64,
    pub mode_entry: Vec<ModeEntryDto>,
    pub derivation: Vec<DerivationDto>,
    /// The normalised spec the figures were solved from, for showing how.
    pub normalized: NormalizedSpecDto,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub relief_drive: Option<ReliefDriveFiguresDto>,
}

/// What the 遊タイム adds, filled from a jackpot.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ReliefDriveFiguresDto {
    pub gauge: u32,
    pub reach_probability: f64,
    pub rounds_after: f64,
    pub combo_after: f64,
    pub balls_after: f64,
    pub restarts: Vec<RestartDto>,
}

/// How regular play starts again after a combo: with spins already filled, or with the 遊タイム spent.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum RestartKindDto {
    Filled { spins: u32 },
    Spent,
}

/// One way of starting again over the long run: how often, and what a cycle from it yields.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RestartDto {
    pub restart: RestartKindDto,
    pub weight: f64,
    pub spins: f64,
    pub rounds: f64,
    pub hits: f64,
    pub balls: f64,
}

/// 遊タイム狙い sampled: sittings from initial spins, each played until a first jackpot
/// — or the 遊タイム — and its combo are over.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HyenaHuntRequest {
    pub source: SourceDto,
    pub conditions: ConditionsDto,
    pub play: PlayDto,
    /// Regular-game spins since the cabinet's last jackpot, played by whoever sat there before.
    pub initial_spins: u32,
    pub trials: u64,
    /// A 64-bit seed as a decimal string.
    pub seed: String,
    pub chunk: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub progress: Option<HyenaHuntProgressDto>,
}

/// A hyena hunt in progress, carried across chunks. Opaque to JavaScript.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HyenaHuntProgressDto {
    #[serde(flatten)]
    pub sittings: ProgressDto,
    pub relief_drives: u64,
    pub spins: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HyenaHuntSummaryDto {
    pub trials: u64,
    pub planned: u64,
    pub finished: bool,
    pub mean_yen: Option<f64>,
    /// The 95% margin of `mean_yen`.
    pub margin_yen: Option<f64>,
    pub standard_deviation_yen: Option<f64>,
    pub win_rate: Option<f64>,
    pub min_yen: Option<f64>,
    pub max_yen: Option<f64>,
    pub relief_drive_rate: Option<f64>,
    pub mean_spins: Option<f64>,
    pub truncated_combos: u64,
    pub histogram: Vec<BucketDto>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HyenaHuntResponse {
    pub progress: HyenaHuntProgressDto,
    pub summary: HyenaHuntSummaryDto,
}

/// 遊タイム狙い solved exactly, from each of several initial spins.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HyenaHuntTableRequest {
    pub source: SourceDto,
    pub conditions: ConditionsDto,
    pub play: PlayDto,
    pub initial_spins: Vec<u32>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HyenaHuntRowDto {
    pub initial_spins: u32,
    pub yen: f64,
    pub spins: f64,
    pub rounds: f64,
    pub relief_drive_probability: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlanDto {
    pub sessions: u64,
    pub spins_per_session: u32,
}

/// A simulation in progress, carried across chunks. Opaque to JavaScript:
/// it is handed back as it was received.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProgressDto {
    /// The generator's four words, as decimal strings: JavaScript numbers
    /// cannot hold a 64-bit word exactly.
    pub rng: [String; 4],
    pub sessions: u64,
    pub mean: f64,
    pub m2: f64,
    pub min_yen: Option<f64>,
    pub max_yen: Option<f64>,
    pub wins: u64,
    pub first_hits: u64,
    pub rounds: u64,
    pub hits: u64,
    pub truncated_combos: u64,
    pub histogram: Vec<(i64, u64)>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SimulateRequest {
    pub source: SourceDto,
    pub conditions: ConditionsDto,
    pub play: PlayDto,
    pub plan: PlanDto,
    /// A 64-bit seed as a decimal string, for the same reason as the generator.
    pub seed: String,
    pub chunk: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub progress: Option<ProgressDto>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BucketDto {
    pub from_yen: f64,
    pub to_yen: f64,
    pub count: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SummaryDto {
    pub sessions: u64,
    pub planned: u64,
    pub finished: bool,
    pub mean_yen: Option<f64>,
    pub standard_deviation_yen: Option<f64>,
    pub win_rate: Option<f64>,
    pub min_yen: Option<f64>,
    pub max_yen: Option<f64>,
    pub rounds_per_first_hit: Option<f64>,
    pub average_combo: Option<f64>,
    pub truncated_combos: u64,
    pub histogram: Vec<BucketDto>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SimulateResponse {
    pub progress: ProgressDto,
    pub summary: SummaryDto,
}

/// An estimate in progress, carried across chunks. Opaque to JavaScript:
/// it is handed back as it was received.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EstimateProgressDto {
    /// The generator's four words, as decimal strings.
    pub rng: [String; 4],
    pub cycles: u64,
    pub spins: u64,
    pub rounds: u64,
    pub truncated_combos: u64,
    pub spins_squared: f64,
    pub rounds_squared: f64,
    pub spins_rounds: f64,
    #[serde(default)]
    pub filled: u64,
    #[serde(default)]
    pub spent: bool,
}

/// A formula's figures estimated by sampling so many cycles — regular play to
/// its first jackpot and the combo after — from a seed.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EstimateRequest {
    pub source: SourceDto,
    pub conditions: ConditionsDto,
    pub cycles: u64,
    /// A 64-bit seed as a decimal string.
    pub seed: String,
    pub chunk: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub progress: Option<EstimateProgressDto>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EstimateSummaryDto {
    pub cycles: u64,
    pub planned: u64,
    pub finished: bool,
    pub round_chance_one_in: Option<f64>,
    /// The 95% margin of `round_chance_one_in`.
    pub round_chance_margin: Option<f64>,
    pub rounds_per_first_hit: Option<f64>,
    /// Balls a round pays under the conditions: given by them, not sampled.
    pub payout_per_round: f64,
    pub truncated_combos: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EstimateResponse {
    pub progress: EstimateProgressDto,
    pub summary: EstimateSummaryDto,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum LocationDto {
    Regular,
    Mode { mode: String },
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(
    tag = "type",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum UnsupportedDto {
    TooManyStates { states: usize, limit: usize },
    LuckyTriggerToItself,
    LuckyTriggerOnEntry,
}

/// Why a call produced no answer, as a case and its particulars.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(
    tag = "type",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum ErrorDto {
    MalformedRequest {
        detail: String,
    },
    /// A value the domain refuses: a zero count, a negative rate. `field` is
    /// a path into the request.
    InvalidValue {
        field: String,
    },
    /// A kind of component this engine does not know, by its path.
    UnsupportedComponent {
        field: String,
    },
    /// A spec written in a shape this engine does not know: its version,
    /// and the one the engine reads.
    UnsupportedSpecVersion {
        version: u32,
        known: u32,
    },
    InvalidProbability {
        at: LocationDto,
        problem: String,
    },
    InvalidDistribution {
        at: LocationDto,
        sum_basis_points: u32,
    },
    DuplicateMode {
        mode: String,
    },
    NoRegularGame,
    SeveralRegularGames,
    MissingComponent {
        entity: String,
        component: String,
    },
    MissingKind {
        entity: String,
    },
    ConflictingComponents {
        entity: String,
        first: String,
        second: String,
    },
    StrayComponent {
        entity: String,
        component: String,
    },
    UnknownMode {
        at: LocationDto,
        mode: String,
    },
    UnreachableState {
        mode: String,
    },
    NonAbsorbingModel {
        mode: String,
    },
    UnsupportedSpec {
        reason: UnsupportedDto,
    },
    SolveFailed {
        reason: String,
    },
}

/// The envelope every answer travels in.
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(untagged)]
pub enum Envelope<T> {
    Ok { ok: bool, value: T },
    Err { ok: bool, error: ErrorDto },
}

impl<T> From<Result<T, ErrorDto>> for Envelope<T> {
    fn from(result: Result<T, ErrorDto>) -> Self {
        match result {
            Ok(value) => Self::Ok { ok: true, value },
            Err(error) => Self::Err { ok: false, error },
        }
    }
}
