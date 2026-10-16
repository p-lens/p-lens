use crate::probability::Probability;
use crate::setting_level::SettingLevel;
use std::num::NonZeroU32;

use crate::spec::{Base, EntityId, Medals};

/// What an AT gains, as a law over its medals under one setting: a fixed
/// figure — its average, where nothing more is known — so many for its
/// first set and so many for each set it carries on to at its 継続率, or a
/// table of medals and their chances.
#[derive(Clone, Debug, PartialEq)]
pub enum PayoutLaw {
    Fixed(Medals),
    Sets {
        first: Medals,
        set: Medals,
        continuation_rate: Probability,
    },
    Table(Vec<(Medals, Probability)>),
}
use crate::version::SchemaVersion;

/// A spec as the engine works with it: for each setting, the things a regular
/// game can come up with, mutually exclusive, each with its chance and what it
/// pays. Whatever is not listed is a game that pays nothing.
#[derive(Clone, Debug, PartialEq)]
pub struct NormalizedSpec {
    pub schema_version: SchemaVersion,
    /// Medals a regular game takes.
    pub bet: u32,
    pub tables: Vec<SettingLevelTable>,
    /// How a machine of an AT plays between ATs; none for one of bonuses
    /// and small wins.
    pub at_rules: Option<AtRules>,
    /// What a player watches over each of a bonus, whose cues each table
    /// gives the chances of.
    pub watches: Vec<WatchRule>,
}

/// A watch as the engine weighs it: the bonus it is watched over, the
/// trials each of the bonus gives, and whether a trial shows one of its
/// cues certainly — then a trial with none counted was not watched.
#[derive(Clone, Debug, PartialEq)]
pub struct WatchRule {
    pub id: EntityId,
    pub bonus: EntityId,
    pub trials: NonZeroU32,
    pub whole: bool,
}

/// One cue of a watch and its chance on a trial under one setting.
#[derive(Clone, Debug, PartialEq)]
pub struct CueChance {
    pub id: EntityId,
    pub watch: EntityId,
    pub chance: Probability,
}

/// An AT machine's regular games, as the engine plays them. Each game may
/// bring its trigger — a CZ, or on a machine without one the AT itself — at
/// one chance below the ceiling of the mode play is in, and certainly on it;
/// a trigger wins the AT at the setting's success rate, certainly once it
/// has missed as many times since the last AT as the mode allows; and a second ceiling, in
/// games since the last AT, the mode's own, wins it whatever came before.
/// Every game loses what the ベース says otherwise.
#[derive(Clone, Debug, PartialEq)]
pub struct AtRules {
    pub base: Base,
    /// The AT; what it gains is each setting's `PayoutLaw`.
    pub at: EntityId,
    /// The CZ that brings the AT, where the AT is not won directly.
    pub trigger: Option<EntityId>,
    /// The modes, each with its trigger's ceiling, its AT間天井 in regular
    /// games and its スルー天井. A machine without modes has one, and a
    /// second for the shorter ceilings of a setting change.
    pub modes: Vec<ModeRule>,
    /// 純増: the medals a game of the AT gains, over all its medals where
    /// shares of them are won at another 純増 than its own. With it the
    /// machine's 機械割 follows from what its AT gains; without it the
    /// 機械割 is measured.
    pub net_per_game: Option<Medals>,
    /// 有利区間の上限: the medals a 有利区間 may gain from its lowest point;
    /// an AT that reaches it ends there, and the 有利区間 with it.
    pub cap: Option<Medals>,
    /// The regular games after an AT that did not reach the cap for which
    /// its 有利区間 carries on; none where it ends with the AT.
    pub window: Option<NonZeroU32>,
    /// Whether play starts again as after a setting change once an AT
    /// reaches the cap, rather than as after any AT.
    pub reset_on_cap: bool,
    /// What the trigger pays each time it comes, where it is a bonus: its
    /// medals, and the medals a game of it gains where its games are
    /// counted. A win on the AT間天井 is no trigger's and pays none of it.
    pub trigger_payout: Option<TriggerPayout>,
}

/// What a bonus that wins the AT at a share pays each time it comes.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TriggerPayout {
    pub medals: Medals,
    pub net_per_game: Option<Medals>,
}

impl TriggerPayout {
    /// The games of its own a trigger takes; none where they are not counted.
    pub fn games(self) -> f64 {
        self.net_per_game
            .map_or(0.0, |net| self.medals.get() / net.get())
    }
}

/// One mode as the engine plays it: its trigger's ceiling in regular games,
/// and its AT間天井 — the regular game since the last AT on which the AT is
/// won at the latest, whatever the trigger did. A mode a setting change
/// alone enters has the setting change's, which therefore holds only until
/// the first AT.
#[derive(Clone, Debug, PartialEq)]
pub struct ModeRule {
    pub id: EntityId,
    pub ceiling: Option<NonZeroU32>,
    pub at_ceiling: Option<NonZeroU32>,
    /// スルー天井: the triggers missed since the last AT after which the
    /// next wins it, the mode's own or the CZ's.
    pub misses: Option<NonZeroU32>,
}

/// How one setting allots play between an AT machine's modes, in the order
/// of its rules: after an AT, and after a setting change. Each sums to one.
#[derive(Clone, Debug, PartialEq)]
pub struct Allotments {
    pub after_at: Vec<f64>,
    pub after_reset: Vec<f64>,
}

impl Allotments {
    /// The shares play starts from: after a setting change, or after an AT.
    pub fn of(&self, after_reset: bool) -> &[f64] {
        if after_reset {
            &self.after_reset
        } else {
            &self.after_at
        }
    }
}

/// An AT machine under one setting: its trigger's chance a regular game
/// below the ceiling, the chance a trigger wins the AT — one for a machine
/// won directly — and its allotment between the modes.
#[derive(Clone, Debug, PartialEq)]
pub struct AtTable {
    pub chance: Probability,
    pub success: Probability,
    pub allotments: Allotments,
    pub payout: PayoutLaw,
}

/// One setting's outcomes of a regular game.
#[derive(Clone, Debug, PartialEq)]
pub struct SettingLevelTable {
    pub setting_level: SettingLevel,
    /// What a regular game comes up with that can be counted: on a machine
    /// of bonuses every outcome, on an AT machine its small wins and replays,
    /// whose games are otherwise its `at`'s.
    pub events: Vec<Event>,
    pub at: Option<AtTable>,
    /// What each watch's cues come up with on a trial.
    pub cues: Vec<CueChance>,
}

/// One outcome of a regular game.
#[derive(Clone, Debug, PartialEq)]
pub struct Event {
    pub id: EntityId,
    /// The bonus a part belongs to, so counting the bonus counts every part.
    pub group: Option<EntityId>,
    pub kind: EventKind,
    pub chance: Probability,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum EventKind {
    /// Gains its medals over the bonus's own games; `None` when the spec
    /// leaves them to a measured payout rate.
    Bonus(Option<Medals>),
    /// Pays its medals on the game it comes up; `None` on an AT machine,
    /// where they are counted in the ベース.
    Role(Option<Medals>),
    Replay,
}

impl Event {
    /// Whether a count filed under `id` counts this outcome.
    pub fn answers_to(&self, id: &EntityId) -> bool {
        self.id == *id || self.group.as_ref() == Some(id)
    }
}

impl NormalizedSpec {
    pub fn table(&self, setting_level: SettingLevel) -> Option<&SettingLevelTable> {
        self.tables
            .iter()
            .find(|table| table.setting_level == setting_level)
    }

    pub fn setting_levels(&self) -> impl Iterator<Item = SettingLevel> + '_ {
        self.tables.iter().map(|table| table.setting_level)
    }
}
