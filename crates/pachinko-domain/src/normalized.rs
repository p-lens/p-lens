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
/// payout gives them, and the jackpots they were won over — none where it
/// was no jackpot, more than one where a machine gives a run of jackpots as
/// one win. The balls are kept beside
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

/// One way a state can resolve. A miss fills the relief gauge by its
/// state's spins; one that says `fills` — a 時短 ended early, so many spins
/// in — fills it by those instead.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Outcome {
    pub probability: Probability,
    pub reward: Reward,
    pub next: Target,
    pub fills: Option<u32>,
}

impl Outcome {
    /// The spins this outcome fills the relief gauge by, where it is a miss
    /// out of `state`: its own where it says, the state's otherwise.
    pub fn filling(&self, state: &State) -> u32 {
        self.fills.unwrap_or(state.fills_gauge)
    }
}

/// Spins a state plays at the heso, off the 電サポ, until a jackpot or
/// `spins` of them: a CZ or a 潜確 counted out, shot as the regular game is
/// and costing balls as its spins do.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PaidSpins {
    pub spins: u32,
    pub chance: Probability,
}

impl PaidSpins {
    /// The spins played on average before a jackpot ends them or they run
    /// out: one for each spin reached, `(1 - (1 - p)^n) / p`.
    pub fn expected(self) -> f64 {
        let p = self.chance.value();
        if p <= 0.0 {
            f64::from(self.spins)
        } else {
            (1.0 - self.chance.complement().value().powf(f64::from(self.spins))) / p
        }
    }
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
    /// Whether the state is played on the 電サポ, so that the balls its
    /// jackpots gain are touched by a formula's support gain.
    pub supported: bool,
    /// The spins it plays at the heso, costing balls as the regular game's
    /// do: a mode played off the 電サポ whose spins run out. None for every
    /// other state, whose spins cost nothing.
    pub paid: Option<PaidSpins>,
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
