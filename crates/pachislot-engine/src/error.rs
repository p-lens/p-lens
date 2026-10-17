use std::num::NonZeroU32;

use pachislot_domain::setting_level::SettingLevel;
use pachislot_domain::spec::{Component, EntityId};

/// What is wrong with a probability.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProbabilityProblem {
    NotFinite,
    OutOfRange,
}

/// What can stop a spec being normalised. Each case says where, by the
/// entity and the setting, so a form can point at the cell.
#[derive(Clone, Debug, PartialEq)]
pub enum SpecError {
    NoSettingLevels,
    DuplicateSettingLevel {
        at: Option<EntityId>,
        setting_level: SettingLevel,
    },
    /// An entity's chance gives no value for one of the machine's settings.
    MissingSettingLevel {
        at: EntityId,
        setting_level: SettingLevel,
    },
    /// An entity's chance gives a value for a setting the machine does not have.
    UnknownSettingLevel {
        at: EntityId,
        setting_level: SettingLevel,
    },
    DuplicateEntity {
        entity: EntityId,
    },
    /// An entity lacks a component it needs: anything its chance, a small
    /// win its payout.
    MissingComponent {
        entity: EntityId,
        component: Component,
    },
    /// An entity with two components that cannot go together: a bonus that
    /// is a replay, a bonus with a chance of its own and parts too.
    ConflictingComponents {
        entity: EntityId,
        first: Component,
        second: Component,
    },
    /// A component on an entity the world does not have.
    StrayComponent {
        entity: EntityId,
        component: Component,
    },
    /// A part of something that is not a bonus.
    PartOfNonBonus {
        entity: EntityId,
        of: EntityId,
    },
    /// A watch over something that is not a bonus.
    WatchOfNonBonus {
        entity: EntityId,
        of: EntityId,
    },
    /// A cue of something that is not a watch.
    CueOfNonWatch {
        entity: EntityId,
        of: EntityId,
    },
    /// A watch's cues on a trial coming to more than certainty.
    CuesExceedOne {
        entity: EntityId,
        setting_level: SettingLevel,
        sum: f64,
    },
    /// A watch whose cues a trial shows certainly under some settings and
    /// not under others: either a trial with none counted was not watched,
    /// or it showed none, under every setting alike.
    WatchPartlyWhole {
        entity: EntityId,
    },
    InvalidProbability {
        at: EntityId,
        setting_level: SettingLevel,
        problem: ProbabilityProblem,
    },
    /// The outcomes of a regular game come to more than certainty.
    ProbabilitiesExceedOne {
        setting_level: SettingLevel,
        sum: f64,
    },
    /// An AT beside other things a regular game comes up with, or a second
    /// AT: a machine of an AT is its AT and its ベース.
    AtNotAlone {
        entity: EntityId,
    },
    /// A machine of an AT without its ベース.
    MissingBase,
    /// A ベース on a machine with no AT, where it would mean nothing.
    BaseWithoutAt,
    /// An AT's published 初当たり as rare as its ceiling or rarer, which no
    /// chance a regular game can give.
    FirstHitBeyondCeiling {
        at: EntityId,
        setting_level: SettingLevel,
    },
    /// A mode on a machine with no AT, where it would mean nothing.
    ModeWithoutAt {
        entity: EntityId,
    },
    /// An AT with a ceiling of its own on a machine of modes, whose ceilings
    /// are its modes'.
    CeilingBesideModes {
        entity: EntityId,
    },
    /// A setting's allotment between the modes, after an AT or after a
    /// setting change, that does not come to exactly 100%; in hundredths of
    /// a percent.
    AllotmentNotWhole {
        setting_level: SettingLevel,
        after_reset: bool,
        sum: u32,
    },
    /// An allotment after a setting change given for some modes and not for
    /// this one: either every mode has one, or none does.
    ResetAllotmentPartial {
        entity: EntityId,
    },
    /// A CZ on a machine with no AT for it to win.
    CzWithoutAt {
        entity: EntityId,
    },
    /// An AT given a 初当たり of its own though a CZ brings it: its 初当たり
    /// is worked out from the CZ's.
    FirstHitBesideCz {
        entity: EntityId,
    },
    /// A small win on an AT machine given medals of its own: the ベース
    /// counts every regular game's medals, so they would be counted twice.
    PayoutBesideAt {
        entity: EntityId,
    },
    /// An AT a CZ brings given an AT間天井 after a setting change on a
    /// machine of modes: a setting change allots the same modes an AT does,
    /// so there is no mode of its own to hold the shorter ceiling.
    ResetCeilingBesideModes {
        entity: EntityId,
    },
    /// A mode given an AT間天井 of its own on a machine without a CZ: its
    /// trigger is the AT, so its ceiling is already the AT's.
    AtCeilingWithoutCz {
        entity: EntityId,
    },
    /// A mode given a スルー天井 of its own on a machine without a CZ: its
    /// trigger is the AT, which never misses.
    MissesWithoutCz {
        entity: EntityId,
    },
    /// A CZ's ceiling counted from the AT that some mode play may enter has
    /// no AT間天井 at it or beyond: once it has passed, a cycle would go on
    /// unbounded past where it can be followed.
    SinceAtCeilingBeyondAtCeiling {
        entity: EntityId,
    },
    /// A CZ given a ceiling counted from the AT after a setting change and
    /// none after an AT: the shorter one stands for the other, and there is
    /// no other.
    ResetSinceAtCeilingWithoutSinceAtCeiling {
        entity: EntityId,
    },
    /// A CZ given a ceiling counted from the AT after a setting change on a
    /// machine of modes: a setting change allots the same modes an AT does,
    /// so a mode play enters after one carries the shorter ceiling itself.
    ResetSinceAtCeilingBesideModes {
        entity: EntityId,
    },
    /// An AT given a chance of being won outright on a machine without a
    /// CZ, where every win is its trigger's already.
    DirectWithoutCz {
        entity: EntityId,
    },
    /// An AT whose AT間天井 brings the trigger on a machine without a CZ,
    /// where its trigger is the AT and its ceiling the trigger's already.
    CeilingTriggersWithoutCz {
        entity: EntityId,
    },
    /// An AT given an AT間天井 counted across the bonuses that start play
    /// again on a machine whose bonuses do not: there it is the AT間天井
    /// itself.
    CeilingAcrossBonusesWithoutRestart {
        entity: EntityId,
    },
    /// A set of an AT paid in sets that pays nothing.
    EmptySet {
        entity: EntityId,
    },
    /// A 継続率 of 100%: an AT that never ends.
    EndlessContinuation {
        entity: EntityId,
        setting_level: SettingLevel,
    },
    /// An AT's table of medals whose shares under a setting do not come to
    /// 100%, in hundredths of a percent.
    PayoutTableNotWhole {
        entity: EntityId,
        setting_level: SettingLevel,
        sum: u32,
    },
    /// A 純増 of nothing: an AT that never gains a medal.
    EmptyNetPerGame {
        entity: EntityId,
    },
    /// Shares of an AT's medals won at another 純増 that come to more than
    /// 100%, or one of them to nothing, in hundredths of a percent.
    OtherNetBeyondWhole {
        entity: EntityId,
        sum: u32,
    },
    /// A 機械割 no AT of the machine's 純増 could bring: one so low that its
    /// ベース alone gives more, or so high that an AT's own games pay for
    /// themselves and it would never have to end.
    UnattainableRate {
        entity: EntityId,
        setting_level: SettingLevel,
    },
    /// Something only a 有利区間's cap gives meaning to, on a machine with no cap.
    NeedsCap {
        entity: EntityId,
        component: Component,
    },
    /// A 有利区間's cap on a machine with no AT.
    CapWithoutAt,
    /// Ceilings said to be counted both on the screen and in another unit:
    /// they are counted one way.
    CeilingUnitBesideLcdRate,
    /// A zone whose shares of the trigger and of the AT outright come to
    /// more than the whole under a setting.
    GateBeyondWhole {
        entity: EntityId,
        game: NonZeroU32,
        setting_level: SettingLevel,
    },
    /// Two zones of a mode, or of a CZ, on the same game.
    GateTwice {
        entity: EntityId,
        game: NonZeroU32,
    },
    /// Zones on the CZ of a machine with modes, where each mode draws at
    /// its own.
    GatesBesideModes {
        entity: EntityId,
    },
    /// A mode's own success rate, or a redraw at a missed trigger, on a
    /// machine without a CZ, whose trigger is the AT and never misses.
    NeedsCz {
        entity: EntityId,
        component: Component,
    },
    /// A ceiling counted in a unit on a machine that names none.
    UnitCeilingWithoutUnit {
        entity: EntityId,
    },
    /// A redraw to something that is not one of the machine's modes.
    RedrawToUnknown {
        entity: EntityId,
        to: EntityId,
    },
    /// A mode's redraw whose shares do not come to the whole under a
    /// setting.
    RedrawNotWhole {
        entity: EntityId,
        setting_level: SettingLevel,
        sum: u32,
    },
}

/// What can stop payout rates being worked out.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum AnalysisError {
    /// A bonus with no payout, where the rate is to come from the spec.
    MissingPayout { at: EntityId },
    /// A measured rate missing for one of the machine's settings.
    MissingRate { setting_level: SettingLevel },
    /// A measured rate given for a setting the machine does not have.
    UnknownRate { setting_level: SettingLevel },
    /// A machine of an AT without its 純増, whose rate cannot come from its
    /// spec: what its AT costs in games of its own is not in it. Its rate
    /// is measured.
    RateNotFromSpec,
}

/// What can stop a setting being inferred.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum InferenceError {
    /// A count filed under something the spec does not have.
    UnknownCount { segment: usize, id: EntityId },
    /// A count given twice in a stretch, or both a bonus and one of its
    /// parts, which would count the same games twice.
    OverlappingCounts { segment: usize, id: EntityId },
    /// More things counted than games played.
    CountsExceedGames { segment: usize },
    /// More of a watch's cues counted than the trials of its bonus counted
    /// in the same stretch.
    CuesExceedTrials { segment: usize, id: EntityId },
    /// A path of an AT machine's play given for a machine with no AT.
    PathWithoutAt,
    /// A distribution whose settings are not the machine's.
    PriorMismatch { setting_level: SettingLevel },
    /// A distribution that does not sum to exactly 100%; in hundredths of a percent.
    InvalidPrior { sum: u32 },
    /// What was seen is impossible under every setting the prior allows:
    /// a count of something a setting never gives, or a mistyped figure.
    ContradictoryEvidence,
}
