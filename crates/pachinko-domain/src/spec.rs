use std::collections::{BTreeMap, BTreeSet};
use std::num::NonZeroU32;

use crate::probability::{BasisPoints, ProbabilitySource};
use crate::quantity::{PayoutRule, RoundCount, SpinCount};

/// An entity of a machine: the regular game, or a mode, named as the person
/// writing the spec chose — `regular`, `RUSH`, `LT`, `時短`. Never empty. The
/// engine compares these and never reads them.
#[derive(Clone, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct ModeId(String);

impl ModeId {
    pub fn new(name: &str) -> Option<Self> {
        let trimmed = name.trim();
        (!trimmed.is_empty()).then(|| Self(trimmed.to_owned()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// A machine as an ECS world, in the words pachinko uses: its entities — the
/// regular game and the modes a jackpot can lead to — each made of whichever
/// components it has, and the resources the whole machine shares.
///
/// A feature is a component: a mode is a 時短 because it has `rapid`, a
/// 遊タイム is a `relief_drive` on the regular game. A machine the model grows
/// to cover gains a component, not a new shape. Nothing here is a state
/// machine; the engine queries the components and derives one.
#[derive(Clone, Debug, PartialEq, Default)]
pub struct Spec {
    /// Every entity, in the order it was made: the order its states take.
    pub entities: Vec<ModeId>,
    pub components: Components,
    pub resources: Resources,
}

/// What the whole machine shares, belonging to no one entity.
#[derive(Clone, Debug, PartialEq)]
pub struct Resources {
    pub payout: PayoutRule,
}

impl Default for Resources {
    fn default() -> Self {
        Self {
            payout: PayoutRule {
                prize_balls: NonZeroU32::MIN,
                count: NonZeroU32::MIN,
            },
        }
    }
}

/// One table per component, each keyed by the entity that has it.
#[derive(Clone, Debug, PartialEq, Default)]
pub struct Components {
    /// The regular game: how often it hits. Exactly one entity has it.
    pub regular_game: BTreeMap<ModeId, RegularGame>,
    pub label: BTreeMap<ModeId, String>,
    /// How a jackpot won there is allotted.
    pub allotment: BTreeMap<ModeId, Vec<Allotment>>,
    /// An ST: so many spins at a raised chance.
    pub special_time: BTreeMap<ModeId, SpecialTime>,
    /// A 時短: so many spins at the regular game's chance, played fast and
    /// with tulip support.
    pub rapid: BTreeMap<ModeId, Rapid>,
    /// 残保留: the draws still queued when a mode's spins run out, made at
    /// the regular game's chance.
    pub leftover_queue: BTreeMap<ModeId, LeftoverQueue>,
    /// A RUSH as many spec sheets summarise it: a continuation rate given directly.
    pub rushing: BTreeMap<ModeId, Rushing>,
    /// Until the next jackpot, which is certain: a 確変 loop.
    pub until_hit: BTreeSet<ModeId>,
    /// Where play goes when a mode ends without a jackpot.
    pub on_miss: BTreeMap<ModeId, Next>,
    pub lucky_trigger: BTreeMap<ModeId, LuckyTrigger>,
    /// The regular game's 遊タイム.
    pub relief_drive: BTreeMap<ModeId, ReliefDrive>,
}

/// The component that makes an entity the regular game.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RegularGame {
    pub chance: ProbabilitySource,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SpecialTime {
    pub spins: SpinCount,
    pub chance: ProbabilitySource,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Rapid {
    pub spins: SpinCount,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct LeftoverQueue {
    pub draws: SpinCount,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Rushing {
    pub continuation_rate: ProbabilitySource,
}

/// The names of the components, for saying which one is missing or in conflict.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Component {
    RegularGame,
    Label,
    Allotment,
    SpecialTime,
    Rapid,
    LeftoverQueue,
    Rushing,
    UntilHit,
    OnMiss,
    LuckyTrigger,
    ReliefDrive,
}

/// The regular game as the engine queries it from its entity: how often it
/// hits, how its jackpots are allotted, and its 遊タイム if it has one.
#[derive(Clone, Debug, PartialEq)]
pub struct RegularPlay {
    pub chance: ProbabilitySource,
    pub allotment: Vec<Allotment>,
    pub relief_drive: Option<ReliefDrive>,
}

/// A 遊タイム: after so many spins at the regular game's chance without a
/// jackpot, play moves to a mode, usually a long 時短. Those spins fill the
/// relief gauge — the regular game's, a 時短's, a leftover queue's; an
/// ST's do not. The gauge empties at every jackpot, and the 遊タイム comes
/// once between jackpots: missed, it does not come again until the next one.
#[derive(Clone, Debug, PartialEq)]
pub struct ReliefDrive {
    pub gauge: SpinCount,
    pub to: ModeId,
}

/// One share of a jackpot's allotment: this many rounds, then on to there.
/// Its rounds pay by the machine's payout rule unless it names its own
/// `prize_balls` or `count`: the attacker its rounds open, where a machine
/// has more than one. Where one jackpot opens more than one attacker — a V
/// round through a one-ball attacker, then nine through the fifteen-ball
/// one — the rounds that pay otherwise are its `other_rounds`.
#[derive(Clone, Debug, PartialEq)]
pub struct Allotment {
    pub share: BasisPoints,
    pub rounds: RoundCount,
    pub next: Next,
    pub prize_balls: Option<NonZeroU32>,
    pub count: Option<NonZeroU32>,
    pub other_rounds: Vec<OtherRounds>,
}

/// Rounds of a jackpot that open another attacker than the share's first
/// rounds do: so many of them, by a prize and a count of their own, each the
/// machine's where it names none.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct OtherRounds {
    pub rounds: RoundCount,
    pub prize_balls: Option<NonZeroU32>,
    pub count: Option<NonZeroU32>,
}

impl Allotment {
    /// Every round the share's jackpot opens, whichever attacker.
    pub fn total_rounds(&self) -> u32 {
        self.other_rounds
            .iter()
            .fold(self.rounds.get(), |rounds, other| {
                rounds.saturating_add(other.rounds.get())
            })
    }

    /// Balls the share's jackpot gains: each round by the attacker it opens.
    pub fn net_balls(&self, payout: PayoutRule) -> u32 {
        let first = self
            .rounds
            .get()
            .saturating_mul(payout.paying(self.prize_balls, self.count).net_per_round());
        self.other_rounds.iter().fold(first, |balls, other| {
            balls.saturating_add(
                other.rounds.get().saturating_mul(
                    payout
                        .paying(other.prize_balls, other.count)
                        .net_per_round(),
                ),
            )
        })
    }
}

/// Where play goes after a jackpot or a mode's end.
#[derive(Clone, Debug, PartialEq)]
pub enum Next {
    Regular,
    Mode(ModeId),
}

/// A mode a jackpot can lead to — a RUSH, an LT, an ST, a 時短, a leftover
/// queue — as the engine queries it from its entity's components.
#[derive(Clone, Debug, PartialEq)]
pub struct Mode {
    pub id: ModeId,
    pub label: String,
    pub kind: ModeKind,
    /// How a jackpot won in this mode is allotted.
    pub allotment: Vec<Allotment>,
    /// Where play goes when the mode ends without a jackpot. Modes follow one
    /// another this way: an ST into a 時短, a 時短 into its leftover queue,
    /// that into the regular game.
    pub on_miss: Next,
    pub lucky_trigger: Option<LuckyTrigger>,
}

/// How a mode ends, as the engine derives it from its entity's kind component.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ModeKind {
    /// When its spins run out without a jackpot: an ST, a 時短, a leftover
    /// queue. `fills_gauge` when they are played at the regular game's chance
    /// and so count toward the 遊タイム: a 時短's and a leftover queue's.
    Runout {
        spins: SpinCount,
        chance: ProbabilitySource,
        fills_gauge: bool,
    },
    /// At the next jackpot, which is certain: a 確変 loop.
    UntilHit,
    /// At each jackpot, by a continuation rate: a RUSH as its spec sheet
    /// summarises it.
    Continuation { rate: ProbabilitySource },
}

/// ラッキートリガー: the jackpot that makes combo `at_combo` in this mode,
/// counting the one that entered it, moves play to `to` rather than keeping
/// it here. Entering a RUSH on a first jackpot and moving to LT at the third
/// in a row is `at_combo: 3` — "3連で LT". A combo of one is the entering
/// jackpot itself, so `at_combo` is at least two.
#[derive(Clone, Debug, PartialEq)]
pub struct LuckyTrigger {
    pub at_combo: NonZeroU32,
    pub to: ModeId,
}
