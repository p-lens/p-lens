//! What crosses the boundary, as JSON. Mirrored by
//! `packages/contracts/src/pachislot/engine.ts`.

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

/// One setting's value.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BySettingLevelDto<T> {
    pub setting_level: u8,
    pub value: T,
}

/// A machine as an ECS world: its entities, a table per component keyed by
/// entity, and the resources the whole machine shares.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SpecDto {
    /// The version of this shape (`SpecVersion`): asked for, never assumed.
    pub v: u32,
    pub entities: Vec<String>,
    pub components: ComponentsDto,
    pub resources: ResourcesDto,
}

/// A share of an AT's medals won at another 純増: the medals a game gains
/// there, and the share in hundredths of a percent.
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OtherNetDto {
    pub net: f64,
    pub share_basis_points: u32,
}

/// One table per component, keyed by entity; a table no entity has is left
/// out. A table this engine does not know is kept in `unsupported` and
/// refused by its name, never misread.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ComponentsDto {
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub label: BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub chance: BTreeMap<String, Vec<BySettingLevelDto<ProbabilityDto>>>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub payout: BTreeMap<String, f64>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub bonus: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub replay: Vec<String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub part_of: BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub at: Vec<String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub first_hit: BTreeMap<String, Vec<BySettingLevelDto<ProbabilityDto>>>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub ceiling: BTreeMap<String, u32>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub reset_ceiling: BTreeMap<String, u32>,
    /// A ceiling counted in the machine's unit, the sooner of it and `ceiling` in games.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub unit_ceiling: BTreeMap<String, u32>,
    /// The same after the settings are changed, until the first AT.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub reset_unit_ceiling: BTreeMap<String, u32>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub mode: Vec<String>,
    /// Shares in hundredths of a percent, under each setting.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub allotment: BTreeMap<String, Vec<BySettingLevelDto<u32>>>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub reset_allotment: BTreeMap<String, Vec<BySettingLevelDto<u32>>>,
    /// An ending: one way an AT ends, with its share of ATs in hundredths of
    /// a percent under each setting.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub ending: BTreeMap<String, Vec<BySettingLevelDto<u32>>>,
    /// On a mode: its allotment after an AT that ended a given way, by the
    /// ending, in hundredths of a percent under each setting.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub ending_allotment: BTreeMap<String, BTreeMap<String, Vec<BySettingLevelDto<u32>>>>,
    /// A mode's own AT間天井, in regular games.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub at_ceiling: BTreeMap<String, u32>,
    /// A mode's own AT間天井 counted in the machine's unit.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub at_unit_ceiling: BTreeMap<String, u32>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub cz: Vec<String>,
    /// On a CZ whose success brings a bonus: a bonus that misses the AT starts play again as after an AT.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub restart: Vec<String>,
    /// On a CZ: the CZ its ceiling counted from the AT brings certainly succeeds.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub ceiling_wins: Vec<String>,
    /// On an AT a CZ brings: its AT間天井 brings the trigger, which certainly
    /// wins it, rather than the AT outright.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub ceiling_triggers: Vec<String>,
    /// On an AT a CZ brings, where a bonus that misses the AT starts play
    /// again: an AT間天井 in regular games counted from the last AT across
    /// those bonuses.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub ceiling_across_bonuses: BTreeMap<String, u32>,
    /// On an AT whose AT間天井 brings the trigger: what the trigger brought
    /// there pays, where it is a bonus of its own.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub ceiling_payout: BTreeMap<String, f64>,
    /// A CZ's chance of winning the AT, in hundredths of a percent under each setting.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub success: BTreeMap<String, Vec<BySettingLevelDto<u32>>>,
    /// On a CZ whose success brings a bonus: how often the bonus wins the
    /// AT, in hundredths of a percent under each setting.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub bonus_share: BTreeMap<String, Vec<BySettingLevelDto<u32>>>,
    /// スルー天井: the CZs missed after which the next one wins the AT.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub misses: BTreeMap<String, u32>,
    /// An AT paid in sets: its first set's medals, and each further set's.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub sets: BTreeMap<String, SetsDto>,
    /// 継続率, in hundredths of a percent under each setting.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub continuation_rate: BTreeMap<String, Vec<BySettingLevelDto<u32>>>,
    /// An AT's medals as a table under each setting.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub payout_table: BTreeMap<String, Vec<BySettingLevelDto<Vec<PayoutRowDto>>>>,
    /// 純増: medals a game of an AT gains.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub net_per_game: BTreeMap<String, f64>,
    /// Shares of an AT's medals won at another 純増 than its own.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub other_net: BTreeMap<String, Vec<OtherNetDto>>,
    /// 機械割 as published, in hundredths of a percent under each setting.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub rate: BTreeMap<String, Vec<BySettingLevelDto<u32>>>,
    /// 引き戻し: regular games after an AT short of the cap that its 有利区間 carries on.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub window: BTreeMap<String, u32>,
    /// ATs after which, on reaching the cap, play starts again as after a setting change.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub reset_on_cap: Vec<String>,
    /// A watch: what a player watches over each of a bonus, named by the bonus.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub watch: BTreeMap<String, String>,
    /// The trials each of a watch's bonus gives it; one where left out.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub trials: BTreeMap<String, u32>,
    /// A cue: one thing a watch may show on a trial, named by the watch.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub cue: BTreeMap<String, String>,
    /// On a CZ: the regular game since the last AT on which it comes at the
    /// latest, once. On a mode, the same for play in it, in place of the CZ's.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub since_at_ceiling: BTreeMap<String, u32>,
    /// On the CZ of a machine without modes: that ceiling after a setting
    /// change, until the first AT.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub reset_since_at_ceiling: BTreeMap<String, u32>,
    /// On a CZ: a meter its misses fill, which full makes the next trigger
    /// certainly win the AT.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub meter: BTreeMap<String, MeterDto>,
    /// On an AT a CZ brings: how often a regular game wins it outright, under each setting.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub direct: BTreeMap<String, Vec<BySettingLevelDto<ProbabilityDto>>>,
    /// On an AT a CZ brings, whose success brings a bonus: how often a
    /// regular game brings that bonus outright, past the CZ, under each setting.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub direct_bonus: BTreeMap<String, Vec<BySettingLevelDto<ProbabilityDto>>>,
    /// A side bonus on an AT machine: drawn beside the trigger at its own
    /// chance a game — its `chance` below its own `ceiling`, or its
    /// `firstHit`, that ceiling included — paying its `payout` and winning
    /// nothing.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub side_bonus: Vec<String>,
    /// ゾーン: on a mode, or on the CZ of a machine without modes, the
    /// regular games since the last AT it draws at.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub gates: BTreeMap<String, Vec<GateDto>>,
    /// On a mode: where a missed trigger in it moves play, each mode with
    /// its share in hundredths of a percent under each setting.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub redraw: BTreeMap<String, Vec<RedrawDto>>,
    /// On a mode: the trigger's chance a game in it under each setting, in place of the one read back from the 合算.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub trigger_chance: BTreeMap<String, Vec<BySettingLevelDto<ProbabilityDto>>>,
    /// On a mode: where play moves when so many games since its last trigger bring none.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub expiry: BTreeMap<String, ExpiryDto<String>>,
    /// On a mode: where a missed trigger that came on its ceiling moves
    /// play, where that differs from `redraw`.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub ceiling_redraw: BTreeMap<String, Vec<RedrawDto>>,
    #[serde(flatten, skip_serializing_if = "BTreeMap::is_empty")]
    pub unsupported: BTreeMap<String, serde_json::Value>,
}

/// One mode a missed trigger may move play to, and how often.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RedrawDto {
    pub to: String,
    pub share: Vec<BySettingLevelDto<u32>>,
}

/// A meter a CZ's misses fill: the points that fill it, and what a miss
/// adds, each so many points at its share of misses in hundredths of a
/// percent under each setting; the rest add none.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MeterDto {
    pub full: u32,
    pub gains: Vec<MeterGainDto>,
}

/// So many points a missed trigger adds, and how often under each setting.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MeterGainDto {
    pub points: u32,
    pub share: Vec<BySettingLevelDto<u32>>,
}

/// A zone: the regular game since the last AT it is on, and the shares of
/// play still going there that it brings the trigger to and wins the AT
/// outright on, in hundredths of a percent under each setting.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GateDto {
    pub game: u32,
    /// The games the zone draws over, evenly; one where it is left out.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub span: Option<u32>,
    pub trigger: Vec<BySettingLevelDto<u32>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub at: Option<Vec<BySettingLevelDto<u32>>>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SetsDto {
    pub first: f64,
    pub set: f64,
}

/// So many medals, so often — in hundredths of a percent.
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PayoutRowDto {
    pub medals: f64,
    pub share: u32,
}

/// A ceiling's unit by its name, and how much of it a regular game comes to on average.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CeilingUnitDto {
    pub name: String,
    pub per_game: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ResourcesDto {
    pub setting_levels: Vec<u8>,
    pub bet: u32,
    /// ベース, for a machine of an AT: regular games fifty medals last.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base: Option<f64>,
    /// A screen's games a regular game comes to, where the ceilings are counted on it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lcd_rate: Option<f64>,
    /// What the trigger's ceilings are counted in where it is not games, and how much of it a regular game comes to.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ceiling_unit: Option<CeilingUnitDto>,
    /// 有利区間の上限, in medals.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cap: Option<f64>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(
    tag = "type",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum EventKindDto {
    Bonus {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        payout: Option<f64>,
    },
    Role {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        payout: Option<f64>,
    },
    Replay,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EventDto {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group: Option<String>,
    pub kind: EventKindDto,
    pub chance: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TableDto {
    pub setting_level: u8,
    pub events: Vec<EventDto>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub at: Option<AtTableDto>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub cues: Vec<CueDto>,
}

/// One cue of a watch and its chance on a trial.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CueDto {
    pub id: String,
    pub watch: String,
    pub chance: f64,
}

/// A watch: the bonus it is watched over, the trials each of it gives, and
/// whether a trial shows one of its cues certainly.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WatchDto {
    pub id: String,
    pub bonus: String,
    pub trials: u32,
    pub whole: bool,
}

/// An AT machine's setting: the trigger's chance a regular game below its
/// ceilings, its chance of winning the AT, and how play is allotted
/// between the modes.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AtTableDto {
    pub chance: f64,
    pub success: f64,
    /// How often a regular game wins the AT outright; none where only the trigger does.
    #[serde(default, skip_serializing_if = "is_none")]
    pub direct: f64,
    /// How often a regular game brings the bonus a CZ's success brings
    /// outright, those that win the AT counted in `direct` too; none where
    /// only a CZ brings it.
    #[serde(default, skip_serializing_if = "is_none")]
    pub direct_bonus: f64,
    /// The share of triggers that pay the trigger's medals; all of them
    /// where it is left out.
    #[serde(default = "whole", skip_serializing_if = "is_whole")]
    pub paid: f64,
    /// Where a CZ's success brings a bonus, the share of those bonuses that win the AT; all of them where it is left out.
    #[serde(default = "whole", skip_serializing_if = "is_whole")]
    pub bonus_share: f64,
    /// Each mode's zones under the setting, in the order of the rules'
    /// modes; none where no mode has any.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub gates: Vec<Vec<GateChanceDto>>,
    /// Each mode's own chance a trigger wins the AT; none where every mode takes `success`.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub successes: Vec<f64>,
    /// Where a missed trigger moves play, a row over the modes for each; none where play stays.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub redraws: Vec<Vec<f64>>,
    /// Where a missed trigger that came on its mode's ceiling moves play; none where `redraws` says.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub ceiling_redraws: Vec<Vec<f64>>,
    /// Each mode's own chance a game brings the trigger; none for a mode at the table's.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub own_chances: Vec<Option<f64>>,
    /// The side bonus's chance a regular game below its ceiling; none where the machine has none.
    #[serde(default, skip_serializing_if = "is_none")]
    pub side_chance: f64,
    /// Where the trigger has a meter: the chance the trigger after so many
    /// misses since the AT comes with it full, the last holding past it;
    /// none where it has no meter.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub meter_wins: Vec<f64>,
    pub allotments: AllotmentsDto,
    pub payout: PayoutLawDto,
}

/// A zone under one setting: its game, and the chances play still going
/// there brings the trigger and wins the AT outright.
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GateChanceDto {
    pub game: u32,
    pub trigger: f64,
    #[serde(default, skip_serializing_if = "is_none")]
    pub at: f64,
}

/// Every one: what a share left out is.
fn whole() -> f64 {
    1.0
}

/// Whether a share is every one, and so left out of what is written.
#[allow(
    clippy::trivially_copy_pass_by_ref,
    clippy::float_cmp,
    reason = "serde hands a field to skip_serializing_if by reference; one is written exactly"
)]
fn is_whole(share: &f64) -> bool {
    *share == 1.0
}

/// Whether a chance is none, and so left out of what is written.
#[allow(
    clippy::trivially_copy_pass_by_ref,
    reason = "serde hands a field to skip_serializing_if by reference"
)]
fn is_none(chance: &f64) -> bool {
    *chance == 0.0
}

/// What an AT gains under a setting: a fixed figure, sets carried on at a
/// 継続率, or a table of medals and their chances.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(
    tag = "type",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum PayoutLawDto {
    Fixed {
        medals: f64,
    },
    Sets {
        first: f64,
        set: f64,
        continuation_rate: f64,
    },
    Table {
        rows: Vec<LawRowDto>,
    },
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LawRowDto {
    pub medals: f64,
    pub probability: f64,
}

/// How a setting allots play between an AT machine's modes, in the order of
/// its rules: after an AT, and after a setting change; each sums to one.
/// Where the modes are allotted by how an AT ended, each ending's share and
/// allotment, in the order of the rules' endings — `afterAt` being them
/// mixed; none where they are not.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AllotmentsDto {
    pub after_at: Vec<f64>,
    pub after_reset: Vec<f64>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub after_endings: Vec<AfterEndingDto>,
}

/// One way an AT ends under a setting: its share of ATs, and the modes'
/// shares after an AT that ended so.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AfterEndingDto {
    pub share: f64,
    pub after_at: Vec<f64>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedSpecDto {
    pub schema_version: u32,
    pub bet: u32,
    pub tables: Vec<TableDto>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub at_rules: Option<AtRulesDto>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub watches: Vec<WatchDto>,
}

/// An AT machine's regular games: its ベース, its AT and what it pays, the
/// CZ that brings it if one does, its modes with the trigger's ceilings and
/// their AT間天井 in regular games, and its スルー天井.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AtRulesDto {
    pub base: f64,
    pub at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trigger: Option<String>,
    pub modes: Vec<ModeRuleDto>,
    /// The one AT間天井 of a spec stored in a shape before
    /// `SchemaVersion::AT_CEILING_BY_MODE`, which every mode is read to have;
    /// never written.
    #[serde(default, skip_serializing)]
    pub at_ceiling: Option<u32>,
    /// The one スルー天井 of a spec stored before each mode said its own,
    /// which every mode is read to have; never written.
    #[serde(default, skip_serializing)]
    pub misses: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub net_per_game: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cap: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub window: Option<u32>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub reset_on_cap: bool,
    /// Whether the trigger is a bonus that wins the AT at a share.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub trigger_is_bonus: bool,
    /// What the trigger pays each time it comes, where it is a bonus whose
    /// medals are known.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trigger_payout: Option<TriggerPayoutDto>,
    /// What a bonus a CZ's success brings does when it misses the AT.
    #[serde(default, skip_serializing_if = "BonusMissDto::is_counted")]
    pub bonus_miss: BonusMissDto,
    /// How the CZ a ceiling counted from the AT forces fares.
    #[serde(default, skip_serializing_if = "ForcedCzDto::is_drawn")]
    pub forced_cz: ForcedCzDto,
    /// How the AT間天井 wins the AT; outright where a stored spec says nothing.
    #[serde(default, skip_serializing_if = "CeilingAtDto::is_outright")]
    pub ceiling_at: CeilingAtDto,
    /// The AT間天井 counted from the last AT across the bonuses that start
    /// play again, in regular games, where there is one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ceiling_across_bonuses: Option<u32>,
    /// What the trigger the AT間天井 brings pays, where it is a bonus of its
    /// own rather than the trigger's medals; none where it pays those.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ceiling_payout: Option<f64>,
    /// The ways an AT ends, where the modes are allotted by them; none
    /// where they are not.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub endings: Vec<String>,
    /// A bonus beside the trigger, with its own ceiling, paying its medals
    /// and winning nothing; none where the machine has none.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub side_bonus: Option<SideBonusRuleDto>,
}

/// A side bonus as the engine plays it: its ceiling in regular games since
/// the last of it, where it has one, and what it pays each time.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SideBonusRuleDto {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ceiling: Option<u32>,
    pub payout: TriggerPayoutDto,
}

/// A bonus that misses the AT counted as a miss, or starting play again.
#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum BonusMissDto {
    #[default]
    Counted,
    Restarts,
}

impl BonusMissDto {
    #[allow(
        clippy::trivially_copy_pass_by_ref,
        reason = "serde hands a field to skip_serializing_if by reference"
    )]
    fn is_counted(&self) -> bool {
        *self == Self::Counted
    }
}

/// The CZ a ceiling counted from the AT forces at its rate, or certainly succeeding.
#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ForcedCzDto {
    #[default]
    Drawn,
    Wins,
}

impl ForcedCzDto {
    #[allow(
        clippy::trivially_copy_pass_by_ref,
        reason = "serde hands a field to skip_serializing_if by reference"
    )]
    fn is_drawn(&self) -> bool {
        *self == Self::Drawn
    }
}

/// The AT間天井 winning the AT outright, or by the trigger it brings.
#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum CeilingAtDto {
    #[default]
    Outright,
    Triggered,
}

impl CeilingAtDto {
    #[allow(
        clippy::trivially_copy_pass_by_ref,
        reason = "serde hands a field to skip_serializing_if by reference"
    )]
    fn is_outright(&self) -> bool {
        *self == Self::Outright
    }
}

/// A bonus trigger's medals, and the medals a game of it gains where its
/// games are counted.
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TriggerPayoutDto {
    pub medals: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub net_per_game: Option<f64>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ModeRuleDto {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ceiling: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub at_ceiling: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub misses: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub since_at_ceiling: Option<u32>,
    /// Where play moves when so many games since the mode's last trigger bring none.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expiry: Option<ExpiryDto>,
}

/// A mode left when so many games since its last trigger bring none: the
/// games, and the mode play moves to — in a spec by its name, in the
/// engine's rules by its place among them.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExpiryDto<To = usize> {
    pub games: u32,
    pub to: To,
}

/// A spec to normalise, or one normalised before and stored, solved as it is.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum SourceDto {
    Spec { spec: Box<SpecDto> },
    Normalized { normalized: Box<NormalizedSpecDto> },
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(
    tag = "type",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum PayoutBasisDto {
    FromSpec,
    /// Rates in hundredths of a percent: `105.5%` is `10550`.
    Measured {
        by_setting_level: Vec<BySettingLevelDto<u32>>,
    },
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConditionsDto {
    pub payout_rate: PayoutBasisDto,
}

/// The player's terms: yen a medal is exchanged for, yen renting one costs,
/// the share of what is played rented for cash (`0..=1`), the share drawn
/// from savings and the medals a replay takes off them for each it pays out
/// (none and one where left out), and games an hour.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlayDto {
    pub medal_value: f64,
    pub rental_price: f64,
    pub cash_share: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub replay_share: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub replay_rate: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub games_per_hour: Option<f64>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NormalizeRequest {
    pub spec: SpecDto,
    /// The work the call may take, in steps of walking play game by game;
    /// none where it may take as much as it needs.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub steps: Option<u64>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeRequest {
    pub source: SourceDto,
    pub conditions: ConditionsDto,
    /// The work the call may take, as for normalising.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub steps: Option<u64>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BonusFigureDto {
    pub id: String,
    pub chance: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ContributionDto {
    /// Absent for the games that pay nothing.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub chance: f64,
    pub medals_per_game: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SettingLevelFiguresDto {
    pub setting_level: u8,
    pub net_per_game: f64,
    pub payout_rate: f64,
    pub bonuses: Vec<BonusFigureDto>,
    pub combined: f64,
    pub derivation: Vec<ContributionDto>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub at: Option<AtFigureDto>,
}

/// What an AT comes to under a setting: its medals on average, and the share that reach the cap.
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AtFigureDto {
    pub gain: f64,
    pub completion: f64,
    /// The triggers a cycle's AT間天井 brings; none where it wins the AT outright.
    #[serde(default, skip_serializing_if = "is_none")]
    pub ceiling_triggers: f64,
    /// The bonuses a cycle's games bring outright, past the CZ; none where no game brings one.
    #[serde(default, skip_serializing_if = "is_none")]
    pub direct_bonuses: f64,
    /// The side bonuses a cycle's games bring in the long run; none where the machine has none.
    #[serde(default, skip_serializing_if = "is_none")]
    pub side_bonuses: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisDto {
    pub engine_version: u32,
    pub schema_version: u32,
    /// The spec as it was solved, to be stored with a formula.
    pub normalized: NormalizedSpecDto,
    pub setting_levels: Vec<SettingLevelFiguresDto>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CountDto {
    pub id: String,
    pub count: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SegmentDto {
    pub games: u32,
    pub counts: Vec<CountDto>,
}

/// What an AT machine's play went through: where it stood when first seen,
/// then each leg of regular games and how it ended.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PathDto {
    pub start: PathStartDto,
    pub legs: Vec<LegDto>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PathStartDto {
    pub since_trigger: u32,
    pub since_at: u32,
    pub misses: u32,
    pub after_reset: bool,
    /// What the 有利区間 held at the end of the last AT, where it carries on.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub held: Option<u32>,
    /// The games since the AT itself, across the bonuses that started play
    /// again since it; none where none did.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub since_at_across_bonuses: Option<u32>,
    /// How the last AT ended, by the ending's name, where it is said; play
    /// then starts from that ending's allotment.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ending: Option<String>,
    /// The regular games since the last side bonus, where the machine has
    /// one and the seat says; its next as likely on any game as in the long
    /// run where it does not.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub since_side_bonus: Option<u32>,
    /// The mode play is in, by its name, where the person knows it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LegDto {
    pub games: u32,
    pub end: LegEndDto,
    /// What was seen of the AT a leg ending in one won.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub at: Option<AtSeenDto>,
}

/// Whether an AT reached the cap, the sets it carried on to past its first,
/// the medals it gained, and how it ended — each where it was seen.
#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AtSeenDto {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub completed: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sets: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub medals: Option<u32>,
    /// How the AT ended, by the ending's name, where it was said: play
    /// after it then starts from that ending's allotment.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ending: Option<String>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum LegEndDto {
    Going,
    Missed,
    Bonus,
    WonAt,
}

/// Shares in hundredths of a percent, summing to `10000`.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DistributionDto {
    pub shares: Vec<BySettingLevelDto<u32>>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PosteriorRequest {
    pub source: SourceDto,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prior: Option<DistributionDto>,
    pub segments: Vec<SegmentDto>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<PathDto>,
    /// An AT machine's play told by its totals afterwards, read in place of
    /// the segments and the path.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub told: Option<ToldPathDto>,
}

/// An AT machine's play told by its totals: whether it began after a
/// setting change, the games since the last AT when it was first seen, then each leg of regular games to an AT won or still
/// going, with the triggers missed in it where told.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ToldPathDto {
    pub after_reset: bool,
    #[serde(default)]
    pub since_at: u32,
    pub legs: Vec<ToldLegDto>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ToldLegDto {
    pub games: u32,
    pub won: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub misses: Option<u32>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WeightDto {
    pub setting_level: u8,
    pub probability: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PosteriorDto {
    pub setting_levels: Vec<WeightDto>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TheoreticalValueRequest {
    pub source: SourceDto,
    pub conditions: ConditionsDto,
    pub weights: Vec<WeightDto>,
    pub play: PlayDto,
    pub played: PlayedDto,
}

/// The regular games a theoretical value is of: so many, on a machine whose
/// every game is worth the same, or the path an AT machine's were played
/// along.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(
    tag = "type",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum PlayedDto {
    Games { games: u32 },
    Path { path: PathDto },
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TheoreticalValueDto {
    pub payout_rate: f64,
    pub net_per_game: f64,
    pub medals: f64,
    pub yen: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub yen_per_hour: Option<f64>,
}

/// What sitting down at an AT machine is worth from each of these seats,
/// played on until the next AT is won and over, given how likely each
/// setting is, on the player's terms.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HuntRequest {
    pub source: SourceDto,
    pub weights: Vec<WeightDto>,
    pub play: PlayDto,
    pub seats: Vec<PathStartDto>,
}

/// What a seat comes to: the regular games played on average, the AT's
/// medals and what the bonuses that are its trigger and a side bonus pay
/// on the way, the medals over them and in yen, and the chance the AT is
/// won by a ceiling.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HuntDto {
    pub games: f64,
    pub at_medals: f64,
    pub trigger_medals: f64,
    /// What a side bonus pays on the way; none where the machine has none.
    #[serde(default, skip_serializing_if = "is_none")]
    pub side_medals: f64,
    pub medals: f64,
    pub yen: f64,
    pub by_ceiling: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlanDto {
    pub sessions: u64,
    pub games: u32,
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
    pub histogram: Vec<(i64, u64)>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SimulateRequest {
    pub source: SourceDto,
    pub conditions: ConditionsDto,
    pub weights: Vec<WeightDto>,
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
    pub histogram: Vec<BucketDto>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SimulateResponse {
    pub progress: ProgressDto,
    pub summary: SummaryDto,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TallyDto {
    pub setting_level: u8,
    pub games: u64,
    pub medals: f64,
    pub medals_squared: f64,
}

/// An estimate in progress, carried across chunks. Opaque to JavaScript.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EstimateProgressDto {
    pub rng: [String; 4],
    pub tallies: Vec<TallyDto>,
}

/// Each setting's payout rate sampled, `games_per_setting` regular games each.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EstimateRequest {
    pub source: SourceDto,
    pub conditions: ConditionsDto,
    pub games_per_setting_level: u64,
    pub seed: String,
    pub chunk: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub progress: Option<EstimateProgressDto>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SettingLevelEstimateDto {
    pub setting_level: u8,
    pub games: u64,
    pub payout_rate: Option<f64>,
    /// The 95% margin of `payout_rate`.
    pub payout_rate_margin: Option<f64>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EstimateSummaryDto {
    pub games_per_setting_level: u64,
    pub finished: bool,
    pub setting_levels: Vec<SettingLevelEstimateDto>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EstimateResponse {
    pub progress: EstimateProgressDto,
    pub summary: EstimateSummaryDto,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ProbabilityProblemDto {
    NotFinite,
    OutOfRange,
}

/// Every failure, as data: what went wrong and where, never a sentence.
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
    /// Solving the spec would take more work than the call was given: its
    /// modes, counts of misses and ceilings too many together.
    TooHeavy,
    /// A value the engine cannot take, named by its path in the request.
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
    NoSettingLevels,
    DuplicateSettingLevel {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        at: Option<String>,
        setting_level: u8,
    },
    MissingSettingLevel {
        at: String,
        setting_level: u8,
    },
    UnknownSettingLevel {
        at: String,
        setting_level: u8,
    },
    DuplicateEntity {
        entity: String,
    },
    MissingComponent {
        entity: String,
        component: String,
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
    PartOfNonBonus {
        entity: String,
        of: String,
    },
    WatchOfNonBonus {
        entity: String,
        of: String,
    },
    CueOfNonWatch {
        entity: String,
        of: String,
    },
    CuesExceedOne {
        entity: String,
        setting_level: u8,
        sum: f64,
    },
    WatchPartlyWhole {
        entity: String,
    },
    InvalidProbability {
        at: String,
        setting_level: u8,
        problem: ProbabilityProblemDto,
    },
    ProbabilitiesExceedOne {
        setting_level: u8,
        sum: f64,
    },
    MissingPayout {
        at: String,
    },
    MissingRate {
        setting_level: u8,
    },
    UnknownRate {
        setting_level: u8,
    },
    RateNotFromSpec,
    AtNotAlone {
        entity: String,
    },
    MissingBase,
    BaseWithoutAt,
    FirstHitBeyondCeiling {
        at: String,
        setting_level: u8,
    },
    PathWithoutAt,
    /// A seat hunted at where under some setting the AT might never come.
    AtNeverComes,
    /// Games given for an AT machine, whose games are worth what the path
    /// to them makes them; or a path for a machine with no AT.
    PlayedMismatch,
    ModeWithoutAt {
        entity: String,
    },
    CeilingBesideModes {
        entity: String,
    },
    AllotmentNotWhole {
        setting_level: u8,
        after_reset: bool,
        sum: u32,
    },
    ResetAllotmentPartial {
        entity: String,
    },
    EndingWithoutModes {
        entity: String,
    },
    EndingsNotWhole {
        setting_level: u8,
        sum: u32,
    },
    EndingAllotmentToUnknown {
        entity: String,
        ending: String,
    },
    EndingAllotmentNotWhole {
        ending: String,
        setting_level: u8,
        sum: u32,
    },
    EndingsWithoutAllotment {
        entity: String,
    },
    /// A mode's allotment after an AT beside one after every ending, not
    /// the endings' mix: that mix in basis points.
    AllotmentAgainstEndings {
        entity: String,
        setting_level: u8,
        mix: u32,
    },
    /// A seat that says the last AT ended a way the machine does not have.
    UnknownEnding {
        ending: String,
    },
    /// A seat that says play is in a mode the machine does not have.
    UnknownMode {
        mode: String,
    },
    /// A seat with more games since the last CZ than since the last AT.
    SeatTriggerAboveSinceAt {
        since_trigger: u32,
        since_at: u32,
    },
    /// A seat with fewer games since the AT itself, across bonuses, than
    /// since the last bonus.
    SeatAcrossBonusesBelowSinceAt {
        since_at: u32,
        since_at_across_bonuses: u32,
    },
    CzWithoutAt {
        entity: String,
    },
    FirstHitBesideCz {
        entity: String,
    },
    PayoutBesideAt {
        entity: String,
    },
    ResetCeilingBesideModes {
        entity: String,
    },
    AtCeilingWithoutCz {
        entity: String,
    },
    MissesWithoutCz {
        entity: String,
    },
    SinceAtCeilingBeyondAtCeiling {
        entity: String,
    },
    ResetSinceAtCeilingWithoutSinceAtCeiling {
        entity: String,
    },
    ResetSinceAtCeilingBesideModes {
        entity: String,
    },
    DirectWithoutCz {
        entity: String,
    },
    DirectBonusWithoutBonusShare {
        entity: String,
    },
    SideBonusWithoutAt {
        entity: String,
    },
    SideBonusNotAlone {
        entity: String,
    },
    CeilingTriggersWithoutCz {
        entity: String,
    },
    CeilingAcrossBonusesWithoutRestart {
        entity: String,
    },
    CeilingPayoutWithoutCeilingTriggers {
        entity: String,
    },
    EmptySet {
        entity: String,
    },
    EmptyNetPerGame {
        entity: String,
    },
    OtherNetBeyondWhole {
        entity: String,
        sum: u32,
    },
    UnattainableRate {
        entity: String,
        setting_level: u8,
    },
    EndlessContinuation {
        entity: String,
        setting_level: u8,
    },
    PayoutTableNotWhole {
        entity: String,
        setting_level: u8,
        sum: u32,
    },
    CeilingUnitBesideLcdRate,
    UnitCeilingWithoutUnit {
        entity: String,
    },
    GateBeyondWhole {
        entity: String,
        game: u32,
        setting_level: u8,
    },
    GateTwice {
        entity: String,
        game: u32,
    },
    GatesBesideModes {
        entity: String,
    },
    NeedsCz {
        entity: String,
        component: String,
    },
    RedrawToUnknown {
        entity: String,
        to: String,
    },
    RedrawNotWhole {
        entity: String,
        setting_level: u8,
        sum: u32,
    },
    MeterGainsOverWhole {
        entity: String,
        setting_level: u8,
        sum: u32,
    },
    NeedsCap {
        entity: String,
        component: String,
    },
    CapWithoutAt,
    UnknownCount {
        segment: usize,
        id: String,
    },
    OverlappingCounts {
        segment: usize,
        id: String,
    },
    CountsExceedGames {
        segment: usize,
    },
    CuesExceedTrials {
        segment: usize,
        id: String,
    },
    PriorMismatch {
        setting_level: u8,
    },
    InvalidPrior {
        sum: u32,
    },
    ContradictoryEvidence,
}

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
