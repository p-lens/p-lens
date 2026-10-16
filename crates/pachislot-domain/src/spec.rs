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
    /// A bonus: BIG, REG.
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
    /// A CZ: won from regular games like an AT, and winning the AT at its
    /// success rate. Its `first_hit` is the published CZ合算, ceiling
    /// included; its `ceiling` the CZ間天井.
    pub cz: BTreeSet<EntityId>,
    /// How often a CZ wins the AT, under each setting.
    pub success: BTreeMap<EntityId, PerSettingLevel<BasisPoints>>,
    /// スルー天井: the CZs missed since the last AT after which the next wins it.
    pub misses: BTreeMap<EntityId, NonZeroU32>,
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
/// AT at its success rate, or certainly after so many misses.
#[derive(Clone, Debug, PartialEq)]
pub struct Cz {
    pub id: EntityId,
    pub label: String,
    pub first_hit: PerSettingLevel<ProbabilitySource>,
    pub success: PerSettingLevel<BasisPoints>,
    pub ceiling: Option<NonZeroU32>,
    pub reset_ceiling: Option<NonZeroU32>,
    pub misses: Option<NonZeroU32>,
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
    pub allotment: PerSettingLevel<BasisPoints>,
    pub reset_allotment: Option<PerSettingLevel<BasisPoints>>,
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
