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
    /// Whether the trigger is a bonus that wins the AT at a share, rather
    /// than a CZ.
    pub trigger_is_bonus: bool,
    /// What the trigger pays each time it comes, where it is a bonus whose
    /// medals are known: its medals, and the medals a game of it gains
    /// where its games are counted. A win on the AT間天井 pays it only
    /// where the AT間天井 brings the trigger (`ceiling_at`), and then in
    /// full: that trigger certainly wins.
    pub trigger_payout: Option<TriggerPayout>,
    /// What a bonus a CZ's success brings does when it misses the AT.
    pub bonus_miss: BonusMiss,
    /// How the CZ a ceiling counted from the AT forces fares.
    pub forced_cz: ForcedCz,
    /// How the AT間天井 wins the AT: outright, or by the trigger it brings.
    pub ceiling_at: CeilingAt,
    /// Where a bonus that misses the AT starts play again: an AT間天井 in
    /// regular games counted from the last AT across those bonuses, which
    /// every mode's own — counted from the bonus — stands beside, the
    /// sooner winning it.
    pub ceiling_across_bonuses: Option<NonZeroU32>,
    /// The ways an AT ends, where the modes are allotted by them: each
    /// table's `allotments.after_endings` in this order. None where the
    /// machine allots its modes alike after every AT.
    pub endings: Vec<EntityId>,
}

/// What a bonus a CZ's success brings does when it misses the AT: counted
/// as a miss like a failed CZ, or starting play again as after an AT.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BonusMiss {
    Counted,
    Restarts,
}

/// How the CZ a ceiling counted from the AT forces fares: at the CZ's own
/// success rate, or certainly succeeding — it and any other on its game.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ForcedCz {
    Drawn,
    Wins,
}

/// How the AT間天井 wins the AT: outright, no trigger's and paying none of
/// it, or by a trigger it brings that certainly wins — counted among a
/// cycle's triggers, in the published 合算, and paying the trigger's medals
/// in full, a CZ's bonus certainly won.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CeilingAt {
    Outright,
    Triggered,
}

impl AtRules {
    /// Whether a bonus that misses the AT starts play again.
    pub fn restarts(&self) -> bool {
        self.bonus_miss == BonusMiss::Restarts
    }

    /// Whether the CZ a ceiling counted from the AT forces certainly succeeds.
    pub fn ceiling_wins(&self) -> bool {
        self.forced_cz == ForcedCz::Wins
    }

    /// Whether the AT間天井 brings the trigger, certainly winning the AT.
    pub fn ceiling_triggers(&self) -> bool {
        self.ceiling_at == CeilingAt::Triggered
    }
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
    /// The regular game since the last AT on which the trigger comes at the
    /// latest, once, short of the AT間天井: a bonus's ceiling that a bonus
    /// missing the AT does not start again.
    pub since_at_ceiling: Option<NonZeroU32>,
    /// Where play moves when so many games in the mode since its last
    /// trigger have brought none: a CZ連 ending.
    pub expiry: Option<Expiry>,
}

/// A mode left when so many games since the last trigger bring none in it:
/// the games, and the mode play moves to, by its place among the rules'.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Expiry {
    pub games: NonZeroU32,
    pub to: usize,
}

/// How one setting allots play between an AT machine's modes, in the order
/// of its rules: after an AT, and after a setting change. Each sums to one.
/// Where the modes are allotted by how an AT ended, `after_at` is every
/// ending's allotment weighed by its share — what play after an AT not
/// seen to end starts from, and what every figure of the machine is worked
/// from — and `after_endings` keeps each, in the order of the rules'
/// endings, for play seen after an AT that ended so.
#[derive(Clone, Debug, PartialEq)]
pub struct Allotments {
    pub after_at: Vec<f64>,
    pub after_reset: Vec<f64>,
    pub after_endings: Vec<AfterEnding>,
}

/// One way an AT ends under a setting: its share of ATs, and how play is
/// allotted between the modes after an AT that ended so, summing to one.
#[derive(Clone, Debug, PartialEq)]
pub struct AfterEnding {
    pub share: f64,
    pub after_at: Vec<f64>,
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

    /// The shares play seen where it stands starts from: after a setting
    /// change, after an AT that ended the way `ending` says — by its place
    /// among the rules' endings — or after an AT that ended any way.
    pub fn starting(&self, after_reset: bool, ending: Option<usize>) -> &[f64] {
        match ending.and_then(|ending| self.after_endings.get(ending)) {
            Some(ended) if !after_reset => &ended.after_at,
            _ => self.of(after_reset),
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
    /// How often a regular game below the ceilings wins the AT outright,
    /// before the trigger is drawn; none where only the trigger wins it.
    pub direct: Probability,
    /// The share of triggers that pay the trigger's medals: all of them
    /// where the trigger is a bonus, those that succeed where a CZ's
    /// success brings the bonus. `success` is then the CZ's success times
    /// the bonus's share.
    pub paid: Probability,
    /// Where a CZ's success brings a bonus, the share of those bonuses
    /// that win the AT; one otherwise. `success` is the CZ's own times it.
    pub bonus_share: Probability,
    /// Each mode's zones under the setting, in the order of the rules'
    /// modes, each in the order of its games; none for a mode without.
    pub gates: Vec<Vec<Gate>>,
    /// Each mode's chance a trigger wins the AT, in the order of the rules'
    /// modes, where any mode has its own; none where every mode takes
    /// `success`.
    pub successes: Vec<Probability>,
    /// Where a missed trigger moves play, mode by mode: a row of shares
    /// over the rules' modes for each, summing to one; none where play
    /// stays in its mode from one AT to the next.
    pub redraws: Vec<Vec<f64>>,
    /// Where a missed trigger that came on its mode's ceiling moves play,
    /// mode by mode; none where `redraws` says.
    pub ceiling_redraws: Vec<Vec<f64>>,
    /// Each mode's own chance a game brings the trigger, in the order of
    /// the rules' modes, where any mode has one; none for a mode at the
    /// chance read back from the 合算, and none at all where no mode has.
    pub own_chances: Vec<Option<Probability>>,
    pub allotments: Allotments,
    pub payout: PayoutLaw,
}

/// A zone under one setting: the regular game since the last AT it is on,
/// the chance play still going there brings the trigger, and the chance it
/// wins the AT outright, before the trigger is drawn.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Gate {
    pub game: NonZeroU32,
    pub trigger: Probability,
    pub at: Probability,
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
