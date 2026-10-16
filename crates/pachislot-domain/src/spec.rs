use std::collections::{BTreeMap, BTreeSet};
use std::num::NonZeroU32;

use crate::conditions::PayoutRate;
use crate::probability::{BasisPoints, ProbabilitySource};
use crate::setting_level::{PerSettingLevel, SettingLevel};

/// An entity of a machine: something a regular game can come up with, or a
/// bonus it can win — `big`, `reg`, `reg-solo`, `grape` — named as the person
/// writing the spec chose. Never empty. Counts a player keeps are filed under
/// these, so the engine compares them and never reads them.
#[derive(Clone, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct EntityId(String);

impl EntityId {
    pub fn new(name: &str) -> Option<Self> {
        let trimmed = name.trim();
        (!trimmed.is_empty()).then(|| Self(trimmed.to_owned()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// A number of medals: finite and not negative. An average, so not whole.
#[derive(Clone, Copy, Debug, PartialEq, PartialOrd)]
pub struct Medals(f64);

impl Medals {
    pub const NONE: Self = Self(0.0);

    pub fn new(value: f64) -> Option<Self> {
        (value.is_finite() && value >= 0.0).then_some(Self(value))
    }

    pub fn get(self) -> f64 {
        self.0
    }
}

/// A machine as an ECS world, in the words pachislot uses: its entities —
/// the bonuses and small wins a regular game can come up with — each made of
/// whichever components it has, and the resources the whole machine shares.
///
/// A feature is a component: an entity is a bonus because it has `bonus`, a
/// replay because it has `replay`, a part of a bonus because it has `part_of`.
/// A machine the model grows to cover gains a component, not a new shape.
/// The engine queries the components and derives one table of outcomes per
/// setting.
#[derive(Clone, Debug, PartialEq)]
pub struct Spec {
    /// Every entity, in the order it was made: the order its outcomes take.
    pub entities: Vec<EntityId>,
    pub components: Components,
    pub resources: Resources,
}

/// What the whole machine shares, belonging to no one entity.
#[derive(Clone, Debug, PartialEq)]
pub struct Resources {
    /// The settings the machine has: `1..=6`, or some of them.
    pub setting_levels: Vec<SettingLevel>,
    /// Medals a regular game takes.
    pub bet: NonZeroU32,
    /// ベース, for a machine of an AT: how a regular game's small wins and
    /// replays come out, as the games fifty medals last.
    pub base: Option<Base>,
    /// For a machine whose ceilings are counted on its screen: the screen's
    /// games a regular game comes to on average, when the screen adds games
    /// of its own — on a スイカ, say. None where the ceilings count regular
    /// games.
    pub lcd_rate: Option<LcdRate>,
    /// For a machine whose trigger's ceilings are counted in something
    /// other than games — points, periods — what it is and how much of it a
    /// regular game comes to on average. None where they count games.
    pub ceiling_unit: Option<CeilingUnit>,
    /// 有利区間の上限: the medals an AT machine's 有利区間 may gain, counted
    /// from its lowest point, before it ends. None where the machine has no
    /// such cap, or it is not modelled.
    pub cap: Option<Medals>,
}

/// How many games a screen counts, on average, for each regular game played:
/// one or more, finite. A ceiling of so many screen games comes that much
/// sooner in regular games.
#[derive(Clone, Copy, Debug, PartialEq, PartialOrd)]
pub struct LcdRate(f64);

impl LcdRate {
    pub fn new(rate: f64) -> Option<Self> {
        (rate.is_finite() && rate >= 1.0).then_some(Self(rate))
    }

    pub fn get(self) -> f64 {
        self.0
    }
}

/// What a ceiling counted in something other than games is counted in —
/// `pt`, `周期` — and how much of it a regular game comes to on average:
/// positive and finite. A ceiling of so much of it comes after that over the
/// rate in regular games, on average; the spread around it is not kept.
#[derive(Clone, Debug, PartialEq)]
pub struct CeilingUnit {
    name: String,
    per_game: f64,
}

impl CeilingUnit {
    pub fn new(name: &str, per_game: f64) -> Option<Self> {
        let name = name.trim();
        (!name.is_empty() && per_game.is_finite() && per_game > 0.0).then(|| Self {
            name: name.to_owned(),
            per_game,
        })
    }

    pub fn name(&self) -> &str {
        &self.name
    }

    pub fn per_game(&self) -> f64 {
        self.per_game
    }
}

/// ベース: regular games fifty medals last, small wins and replays paid back
/// as they come — the one figure an AT machine's regular game is known by.
/// Positive and finite.
#[derive(Clone, Copy, Debug, PartialEq, PartialOrd)]
pub struct Base(f64);

impl Base {
    /// Medals a base is counted in.
    pub const MEDALS: f64 = 50.0;

    pub fn new(games: f64) -> Option<Self> {
        (games.is_finite() && games > 0.0).then_some(Self(games))
    }

    pub fn games(self) -> f64 {
        self.0
    }

    /// Theoretical medals a regular game loses, ATs aside.
    pub fn loss_per_game(self) -> f64 {
        Self::MEDALS / self.0
    }
}

/// One table per component, each keyed by the entity that has it.
#[derive(Clone, Debug, PartialEq, Default)]
pub struct Components {
    pub label: BTreeMap<EntityId, String>,
    /// How often a regular game comes up with it, under each setting.
    pub chance: BTreeMap<EntityId, PerSettingLevel<ProbabilitySource>>,
    /// Medals it pays on the game it comes up — a small win — or gains over
    /// its own games — a bonus.
    pub payout: BTreeMap<EntityId, Medals>,
    /// A bonus: BIG, REG — or, beside `cz`, a bonus that brings the AT in a
    /// CZ's place.
    pub bonus: BTreeSet<EntityId>,
    /// A replay: the next game costs nothing.
    pub replay: BTreeSet<EntityId>,
    /// One way a bonus is won — 単独, チェリー重複 — which a player may count
    /// apart from the bonus.
    pub part_of: BTreeMap<EntityId, EntityId>,
    /// An AT: won from regular games, it gains its payout over games of its
    /// own, and the count towards its ceiling starts over after it.
    pub at: BTreeSet<EntityId>,
    /// 初当たり: how often an AT is won, ceiling included, as analysis sheets
    /// publish it, under each setting.
    pub first_hit: BTreeMap<EntityId, PerSettingLevel<ProbabilitySource>>,
    /// 天井: the regular game since the last AT on which it is won at the latest.
    pub ceiling: BTreeMap<EntityId, NonZeroU32>,
    /// The ceiling after the settings are changed, until the first AT.
    pub reset_ceiling: BTreeMap<EntityId, NonZeroU32>,
    /// A ceiling counted in the machine's `ceiling_unit` — points, 周期 —
    /// where it reaches the same thing as `ceiling` in games, whichever
    /// comes first: on the trigger its ceiling, on an AT a CZ brings its
    /// AT間天井, on a mode its trigger's. Beside one, `ceiling` counts games.
    pub unit_ceiling: BTreeMap<EntityId, NonZeroU32>,
    /// The same after the settings are changed, until the first AT.
    pub reset_unit_ceiling: BTreeMap<EntityId, NonZeroU32>,
    /// A mode: a hidden state between ATs with a ceiling of its own — 天国,
    /// 通常A — that the player never sees and the engine infers.
    pub mode: BTreeSet<EntityId>,
    /// 振り分け: how often play enters a mode after an AT, under each setting.
    pub allotment: BTreeMap<EntityId, PerSettingLevel<BasisPoints>>,
    /// How often play enters a mode after the settings are changed, under
    /// each setting, where that differs.
    pub reset_allotment: BTreeMap<EntityId, PerSettingLevel<BasisPoints>>,
    /// A mode's own AT間天井 on a machine a CZ brings the AT on: the regular
    /// game since the last AT on which play in the mode wins it at the
    /// latest, in place of the AT's — an AT間天井 drawn after each AT, 450G
    /// or 999G, is a mode for each.
    pub at_ceiling: BTreeMap<EntityId, NonZeroU32>,
    /// A mode's own AT間天井 counted in the machine's `ceiling_unit`,
    /// beside or in place of its `at_ceiling`.
    pub at_unit_ceiling: BTreeMap<EntityId, NonZeroU32>,
    /// A CZ: won from regular games like an AT, and winning the AT at its
    /// success rate. Its `first_hit` is the published CZ合算, ceiling
    /// included; its `ceiling` the CZ間天井.
    pub cz: BTreeSet<EntityId>,
    /// How often a CZ wins the AT, under each setting.
    pub success: BTreeMap<EntityId, PerSettingLevel<BasisPoints>>,
    /// スルー天井: the CZs missed since the last AT after which the next
    /// wins it — on a CZ, or on a mode where each has its own.
    pub misses: BTreeMap<EntityId, NonZeroU32>,
    /// On an AT a CZ brings: how often a regular game wins it outright,
    /// before the CZ is drawn, below the ceilings, under each setting.
    pub direct: BTreeMap<EntityId, PerSettingLevel<ProbabilitySource>>,
    /// On a CZ whose success brings a bonus before the AT — CZ, then BIG,
    /// then the AT at a share: how often that bonus wins the AT, under each
    /// setting. The bonus pays the CZ's `payout`, over its `net_per_game`,
    /// each time a CZ succeeds; a bonus missing the AT is a CZ missed.
    pub bonus_share: BTreeMap<EntityId, PerSettingLevel<BasisPoints>>,
    /// ゾーン: the regular games since the last AT at which a mode — or the
    /// CZ of a machine without modes — draws besides its chance a game: the
    /// trigger at one share, and the AT outright at another, under each
    /// setting. 規定ゲーム数 zones, 100G gates, a 周期 drawn every so many
    /// games.
    pub gates: BTreeMap<EntityId, Vec<Gate>>,
    /// On a mode: the trigger's chance a regular game in it, under each
    /// setting, in place of the one read back from the 合算 — a CZ連 at
    /// 1/19.7 a game.
    pub trigger_chance: BTreeMap<EntityId, PerSettingLevel<ProbabilitySource>>,
    /// On a mode: the games since its last trigger after which, none come,
    /// play moves to another mode.
    pub expiry: BTreeMap<EntityId, SpecExpiry>,
    /// On a CZ whose success brings a bonus: a bonus that misses the AT
    /// starts play again as after an AT — its ceilings, its スルー天井 and
    /// its modes counted from the bonus, ボーナス&AT間.
    pub restart: BTreeSet<EntityId>,
    /// On a CZ: its ceiling counted from the AT — or from the last bonus,
    /// where play starts again at one — brings a CZ that certainly
    /// succeeds.
    pub ceiling_wins: BTreeSet<EntityId>,
    /// On a mode: where play goes when a trigger in it misses — the mode
    /// drawn again at each failed CZ — each mode it may go to with its share
    /// under each setting, the whole of it. A mode without stays.
    pub redraw: BTreeMap<EntityId, Vec<Redraw>>,
    /// On a mode: where a missed trigger that came on the mode's ceiling
    /// moves play, where that differs from `redraw` — a ceiling CZ that
    /// shortens the next ceiling.
    pub ceiling_redraw: BTreeMap<EntityId, Vec<Redraw>>,
    /// On a CZ: the regular game since the last AT on which it comes at the
    /// latest, once — a bonus's ceiling that a bonus missing the AT does not
    /// start again, short of the AT間天井.
    pub since_at_ceiling: BTreeMap<EntityId, NonZeroU32>,
    /// An AT paid in sets: the medals of its first, and of each set it
    /// carries on to.
    pub sets: BTreeMap<EntityId, Sets>,
    /// 継続率: how often an AT paid in sets carries on to one more, under
    /// each setting.
    pub continuation_rate: BTreeMap<EntityId, PerSettingLevel<BasisPoints>>,
    /// An AT's medals as a table under each setting: so many medals, so
    /// often.
    pub payout_table: BTreeMap<EntityId, PerSettingLevel<Vec<PayoutRow>>>,
    /// 純増: the medals a game of an AT gains. It says how many games an AT
    /// of so many medals takes, which is what ties an AT's gain to the
    /// machine's 機械割: with it, either follows from the other.
    pub net_per_game: BTreeMap<EntityId, Medals>,
    /// 上位AT, or a bonus inside the AT: shares of an AT's medals won at
    /// another 純増 than its own. What is left of the medals is won at the
    /// AT's `net_per_game`.
    pub other_net: BTreeMap<EntityId, Vec<OtherNet>>,
    /// 機械割 as published, under each setting: what an AT gains on average
    /// is then what it and the 純増 imply, in place of a `payout`.
    pub rate: BTreeMap<EntityId, PerSettingLevel<PayoutRate>>,
    /// 引き戻し: the regular games after an AT that did not reach the cap for
    /// which its 有利区間 carries on, and with it what the AT gained.
    pub window: BTreeMap<EntityId, NonZeroU32>,
    /// An AT after which, once it reaches the cap, play starts again as
    /// after a setting change: its ceilings and allotments are those.
    pub reset_on_cap: BTreeSet<EntityId>,
    /// A watch: what a player watches over each of a bonus, named by the
    /// bonus — the BIG's games for a スイカ, the REG's side lamp — and never
    /// a regular game's.
    pub watch: BTreeMap<EntityId, EntityId>,
    /// The trials each of a watch's bonus gives it — a BIG's games for a
    /// スイカ in them — one where it is left out.
    pub trials: BTreeMap<EntityId, NonZeroU32>,
    /// A cue: one thing a watch may show on a trial — a スイカ, a lamp's
    /// colour — named by the watch. Its chance is a trial's, under each
    /// setting, and a watch's cues are never shown on the same trial.
    pub cue: BTreeMap<EntityId, EntityId>,
}

/// An AT paid in sets: so many medals for its first, and so many for each
/// set it carries on to. A set pays something.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Sets {
    pub first: Medals,
    pub set: Medals,
}

/// One row of an AT's table of medals: so many, so often.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PayoutRow {
    pub medals: Medals,
    pub share: BasisPoints,
}

/// The names of the components, for saying which one is missing or in conflict.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Component {
    Label,
    Chance,
    Payout,
    Bonus,
    Replay,
    PartOf,
    At,
    FirstHit,
    Ceiling,
    ResetCeiling,
    Mode,
    Allotment,
    ResetAllotment,
    AtCeiling,
    Cz,
    Success,
    Misses,
    Sets,
    ContinuationRate,
    PayoutTable,
    NetPerGame,
    OtherNet,
    Rate,
    Window,
    ResetOnCap,
    Watch,
    Trials,
    Cue,
    SinceAtCeiling,
    Direct,
    BonusShare,
    Gates,
    Redraw,
    CeilingRedraw,
    Restart,
    CeilingWins,
    UnitCeiling,
    ResetUnitCeiling,
    AtUnitCeiling,
    TriggerChance,
    Expiry,
}

/// A mode left when so many games since its last trigger bring none: the
/// games, and the mode play moves to.
#[derive(Clone, Debug, PartialEq)]
pub struct SpecExpiry {
    pub games: NonZeroU32,
    pub to: EntityId,
}

/// One mode a missed trigger may move play to, and how often under each
/// setting.
#[derive(Clone, Debug, PartialEq)]
pub struct Redraw {
    pub to: EntityId,
    pub share: PerSettingLevel<BasisPoints>,
}

/// A zone a mode draws at: the regular game since the last AT it begins
/// on, and the share of play still going there that the trigger comes to
/// and that the AT is won outright on, under each setting — the two
/// together no more than the whole. A zone of a `span` of games draws
/// those shares over all of them, evenly game by game: a 引き戻し of 66
/// games after the AT.
#[derive(Clone, Debug, PartialEq)]
pub struct Gate {
    pub game: NonZeroU32,
    pub span: Option<NonZeroU32>,
    pub trigger: PerSettingLevel<BasisPoints>,
    pub at: Option<PerSettingLevel<BasisPoints>>,
}

/// What an entity is, as the engine queries it from its components.
#[derive(Clone, Debug, PartialEq)]
pub enum Element {
    Bonus(Bonus),
    Role(Role),
    Replay(Replay),
    At(At),
    Mode(Mode),
    Cz(Cz),
    Watch(Watch),
}

/// A watch: what a player watches over each of a bonus — its games, or a
/// lamp once — so many trials a bonus, and the cues a trial may show. A
/// trial shows one cue at most; where under every setting it shows one
/// certainly, a trial with none counted was not watched, and otherwise it
/// showed none.
#[derive(Clone, Debug, PartialEq)]
pub struct Watch {
    pub id: EntityId,
    pub label: String,
    pub bonus: EntityId,
    pub trials: NonZeroU32,
    pub cues: Vec<Cue>,
}

/// One thing a watch may show on a trial, and how often it does under each
/// setting.
#[derive(Clone, Debug, PartialEq)]
pub struct Cue {
    pub id: EntityId,
    pub label: String,
    pub chance: PerSettingLevel<ProbabilitySource>,
}

/// A CZ: won from regular games at its published 合算 — its ceiling, its
/// ceiling after a setting change and its modes included — and winning the
/// AT at its success rate, or certainly after so many misses. A bonus that
/// wins the AT at a share of its own is one too, paying its medals each
/// time it comes, whether it wins the AT or not.
#[derive(Clone, Debug, PartialEq)]
pub struct Cz {
    pub id: EntityId,
    pub label: String,
    pub first_hit: PerSettingLevel<ProbabilitySource>,
    pub success: PerSettingLevel<BasisPoints>,
    pub ceiling: Option<NonZeroU32>,
    pub reset_ceiling: Option<NonZeroU32>,
    /// Its ceilings counted in the machine's unit, where they are.
    pub unit_ceiling: Option<NonZeroU32>,
    pub reset_unit_ceiling: Option<NonZeroU32>,
    pub misses: Option<NonZeroU32>,
    /// The regular game since the last AT on which it comes at the latest,
    /// once, whatever came before.
    pub since_at_ceiling: Option<NonZeroU32>,
    /// Whether the CZ that ceiling brings certainly succeeds.
    pub ceiling_wins: bool,
    /// Whether a bonus its success brings that misses the AT starts play
    /// again as after an AT.
    pub restart: bool,
    /// Whether it is a bonus that wins the AT at a share, rather than a CZ:
    /// marked so, or given medals of its own without a bonus after it.
    pub bonus: bool,
    /// Medals it gains over its own games each time it comes: a bonus's,
    /// where they are known; none for a CZ, which pays nothing. On a CZ
    /// whose success brings a bonus, that bonus's, paid each time it
    /// succeeds.
    pub payout: Option<Medals>,
    /// 純増: the medals a game of it gains, which says the games it takes;
    /// none where they are not counted.
    pub net_per_game: Option<Medals>,
    /// Where its success brings a bonus: how often the bonus wins the AT,
    /// under each setting. None where its success wins the AT itself.
    pub bonus_share: Option<PerSettingLevel<BasisPoints>>,
    /// The zones it draws at, on a machine without modes.
    pub gates: Vec<Gate>,
}

/// A mode between ATs: its ceiling and its own AT間天井, if it has them,
/// and how often play enters it after an AT and after a setting change,
/// under each setting.
#[derive(Clone, Debug, PartialEq)]
pub struct Mode {
    pub id: EntityId,
    pub label: String,
    pub ceiling: Option<NonZeroU32>,
    pub at_ceiling: Option<NonZeroU32>,
    /// Its ceilings counted in the machine's unit, where they are.
    pub unit_ceiling: Option<NonZeroU32>,
    pub at_unit_ceiling: Option<NonZeroU32>,
    /// A mode's own スルー天井 on a machine a CZ brings the AT on: the
    /// triggers missed since the last AT after which the next wins it, in
    /// place of the CZ's — a スルー天井 drawn after each AT, two, four or
    /// six, is a mode for each.
    pub misses: Option<NonZeroU32>,
    pub allotment: PerSettingLevel<BasisPoints>,
    pub reset_allotment: Option<PerSettingLevel<BasisPoints>>,
    /// The zones play in it draws at.
    pub gates: Vec<Gate>,
    /// How often a trigger in it wins the AT under each setting, where it
    /// is not the CZ's: a 高確 after a failed CZ.
    pub success: Option<PerSettingLevel<BasisPoints>>,
    /// Where a missed trigger in it moves play to; none where play stays.
    pub redraw: Vec<Redraw>,
    /// Where a missed trigger that came on its ceiling moves play; none
    /// where `redraw` says.
    pub ceiling_redraw: Vec<Redraw>,
    /// Its own chance a game brings the trigger, where it has one.
    pub trigger_chance: Option<PerSettingLevel<ProbabilitySource>>,
    /// Where play moves when so many games bring no trigger in it.
    pub expiry: Option<SpecExpiry>,
}

/// A share of an AT's medals won at another 純増 than the AT's own: an
/// 上位AT gaining five a game where the AT gains under three.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct OtherNet {
    pub net: Medals,
    pub share: BasisPoints,
}

/// An AT: won from regular games — by the game's own chance, or on its
/// ceiling at the latest — or through a CZ, and gaining its payout over
/// games of its own. Through a CZ, its ceiling is the AT間天井 and its
/// 初当たり is worked out, not given.
#[derive(Clone, Debug, PartialEq)]
pub struct At {
    pub id: EntityId,
    pub label: String,
    /// 初当たり as published, ceiling included; none through a CZ.
    pub first_hit: Option<PerSettingLevel<ProbabilitySource>>,
    /// Where a CZ brings it: how often a regular game wins it outright
    /// besides, before the CZ is drawn, under each setting.
    pub direct: Option<PerSettingLevel<ProbabilitySource>>,
    /// 平均獲得枚数: medals an AT gains on average, where its medals are not
    /// given as sets or a table.
    pub payout: Option<Medals>,
    pub sets: Option<Sets>,
    pub continuation_rate: Option<PerSettingLevel<BasisPoints>>,
    pub payout_table: Option<PerSettingLevel<Vec<PayoutRow>>>,
    /// 純増: the medals a game of the AT gains.
    pub net_per_game: Option<Medals>,
    /// The shares of its medals won at another 純増.
    pub other_net: Vec<OtherNet>,
    /// 機械割 as published, where the AT's medals are to follow from it.
    pub rate: Option<PerSettingLevel<PayoutRate>>,
    pub ceiling: Option<NonZeroU32>,
    pub reset_ceiling: Option<NonZeroU32>,
    /// Its ceilings counted in the machine's unit, where they are.
    pub unit_ceiling: Option<NonZeroU32>,
    pub reset_unit_ceiling: Option<NonZeroU32>,
    pub window: Option<NonZeroU32>,
    pub reset_on_cap: bool,
}

/// A bonus: BIG, REG. Its chance is either one figure per setting or the sum
/// of the ways it is won — 単独 and チェリー重複 — so a player who tells them
/// apart counts each, and one who does not counts the bonus.
#[derive(Clone, Debug, PartialEq)]
pub struct Bonus {
    pub id: EntityId,
    pub label: String,
    pub chance: Chance,
    /// Medals the bonus gains over its own games. Not needed when the payout
    /// rate is measured rather than worked out from the spec.
    pub payout: Option<Medals>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Chance {
    Whole(PerSettingLevel<ProbabilitySource>),
    Parts(Vec<Part>),
}

/// One way a bonus is won.
#[derive(Clone, Debug, PartialEq)]
pub struct Part {
    pub id: EntityId,
    pub label: String,
    pub chance: PerSettingLevel<ProbabilitySource>,
}

/// A small win: ブドウ, チェリー, ベル. On a machine of bonuses it pays its
/// medals on the game it comes up; on an AT machine it pays through the
/// ベース, which counts every regular game's medals, and has none of its own.
#[derive(Clone, Debug, PartialEq)]
pub struct Role {
    pub id: EntityId,
    pub label: String,
    pub chance: PerSettingLevel<ProbabilitySource>,
    pub payout: Option<Medals>,
}

/// A replay: the next game costs nothing, which is counted as the bet paid
/// back, as a payout rate is.
#[derive(Clone, Debug, PartialEq)]
pub struct Replay {
    pub id: EntityId,
    pub label: String,
    pub chance: PerSettingLevel<ProbabilitySource>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_name_is_trimmed_and_never_empty() {
        assert_eq!(EntityId::new("  "), None);
        assert_eq!(
            EntityId::new(" big ").map(|id| id.as_str().to_owned()),
            Some("big".to_owned())
        );
    }

    #[test]
    fn medals_are_finite_and_not_negative() {
        assert_eq!(Medals::new(-1.0), None);
        assert_eq!(Medals::new(f64::INFINITY), None);
        assert_eq!(Medals::new(252.0).map(Medals::get), Some(252.0));
    }
}
