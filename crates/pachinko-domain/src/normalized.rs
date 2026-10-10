use crate::probability::Probability;
use crate::spec::ModeId;
use crate::version::SchemaVersion;

/// Where an internal state is, as an index into `NormalizedSpec::states`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct StateIndex(usize);

impl StateIndex {
    pub fn new(index: usize) -> Self {
        Self(index)
    }

    pub fn get(self) -> usize {
        self.0
    }
}

/// What one outcome yields: rounds won, the balls they gain as the spec's
/// payout gives them, and whether it was a jackpot. The balls are kept beside
/// the rounds because a machine's jackpots need not all pay a round alike: a
/// 4R through a ten-ball attacker and a 10R through a fifteen-ball one.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub struct Reward {
    pub rounds: u32,
    pub hits: u32,
    pub balls: u32,
}

/// Where an outcome leads: another state, or the end of the combo — back to
/// the regular game.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Target {
    State(StateIndex),
    End,
}

/// One way a state can resolve.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Outcome {
    pub probability: Probability,
    pub reward: Reward,
    pub next: Target,
}

/// A state of the combo that follows a first jackpot. It knows only its
/// outcomes; what the machine calls it is in `origins`.
#[derive(Clone, Debug, PartialEq)]
pub struct State {
    pub outcomes: Vec<Outcome>,
    /// Spins that fill the relief gauge toward the 遊タイム when this state
    /// runs out without a jackpot: a 時短's or a leftover queue's, played at
    /// the regular game's chance. An ST or a loop fills none.
    pub fills_gauge: u32,
}

/// Which mode of the spec a state came from, and the combo it stands at in
/// that mode, counting the jackpot that entered it: always one, unless the
/// mode was expanded for a lucky trigger.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StateOrigin {
    pub mode: ModeId,
    pub combo: u32,
}

/// A 遊タイム as the combo sees it: once `gauge` spins have filled the relief
/// gauge without a jackpot, play enters `target` with nothing won. It comes
/// once between jackpots: missed, it does not come again until one.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct NormalizedReliefDrive {
    pub gauge: u32,
    pub target: Target,
}

/// A spec as a combo of jackpots: how the first one is allotted, and the
/// states that follow until play returns to the regular game. Every state's
/// outcomes sum to one, and every state can reach the end.
#[derive(Clone, Debug, PartialEq)]
pub struct NormalizedSpec {
    pub schema_version: SchemaVersion,
    pub hit_chance: Probability,
    pub entry: Vec<Outcome>,
    pub states: Vec<State>,
    /// One per state, in the same order.
    pub origins: Vec<StateOrigin>,
    /// Balls gained by one round, as the machine's own payout rule gives it:
    /// what a measured round is set against. A share that pays otherwise
    /// says so in its outcomes' balls.
    pub net_balls_per_round: u32,
    /// The 遊タイム, if the machine has one.
    pub relief_drive: Option<NormalizedReliefDrive>,
}
