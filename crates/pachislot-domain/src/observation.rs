use crate::spec::EntityId;

/// A stretch of regular games seen the same way: so many games, and how many
/// times each thing counted came up in them. What was not counted in a
/// stretch is simply left out of it.
///
/// A cabinet is usually seen as two stretches: what its data counter shows
/// from before the player sat down — bonuses only — and what the player
/// counted since, which may include small wins.
#[derive(Clone, Debug, PartialEq)]
pub struct Segment {
    pub games: u32,
    pub counts: Vec<(EntityId, u32)>,
}

/// What an AT machine's play went through, as the engine walks it game by
/// game: where play stood when it was first seen, then each leg of regular
/// games and how it ended.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Path {
    pub start: PathStart,
    pub legs: Vec<Leg>,
}

/// Where play stood when the player sat down: the regular games since the
/// last trigger and since the last AT, the triggers missed since that AT,
/// and whether the settings had been changed with no AT since.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PathStart {
    pub since_trigger: u32,
    pub since_at: u32,
    pub misses: u32,
    pub after_reset: bool,
    /// What the 有利区間 had gained by the end of the last AT, where it
    /// carries on into the games since: none where it ended with the AT.
    pub held: Option<u32>,
}

/// So many regular games, the last of which ended as it says.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Leg {
    pub games: u32,
    pub end: LegEnd,
}

/// How a leg's last game ended: with nothing — play went on — a trigger
/// missed, or the AT won, and what is known of how the AT went.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LegEnd {
    Going,
    Missed,
    WonAt(AtSeen),
}

/// What was seen of an AT, each where it was: whether it reached the
/// 有利区間's cap, the sets it carried on to past its first, and the medals
/// it gained.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct AtSeen {
    pub completed: Option<bool>,
    pub sets: Option<u32>,
    pub medals: Option<u32>,
}

impl Path {
    /// The regular games the path played.
    pub fn games(&self) -> u64 {
        self.legs.iter().map(|leg| u64::from(leg.games)).sum()
    }
}
