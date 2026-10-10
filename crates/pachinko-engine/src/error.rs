use pachinko_domain::spec::{Component, ModeId};

/// Where in a spec something is wrong.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Location {
    Regular,
    Mode(ModeId),
}

/// What is wrong with a probability.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProbabilityProblem {
    NotFinite,
    OutOfRange,
    /// Zero where a hit has to be possible: a regular game or a mode that can
    /// never hit is a mistake, not a machine.
    Zero,
}

/// What can stop a spec being normalised. Each case says where and what, so
/// a form can point at the field rather than print a sentence.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SpecError {
    InvalidProbability {
        at: Location,
        problem: ProbabilityProblem,
    },
    /// An allotment that is empty, has a share of zero, or does not sum to
    /// exactly 100%. `sum` is in hundredths of a percent.
    InvalidDistribution {
        at: Location,
        sum: u32,
    },
    DuplicateMode {
        mode: ModeId,
    },
    /// No entity has the regular game.
    NoRegularGame,
    /// More than one entity has the regular game; a machine has one.
    SeveralRegularGames,
    /// An entity lacks a component it needs: a mode its allotment or where
    /// a miss goes, the regular game its allotment.
    MissingComponent {
        entity: ModeId,
        component: Component,
    },
    /// A mode with none of the kinds — special time, rapid, leftover queue,
    /// rushing, until hit.
    MissingKind {
        entity: ModeId,
    },
    /// An entity with two components that cannot go together: two kinds of mode.
    ConflictingComponents {
        entity: ModeId,
        first: Component,
        second: Component,
    },
    /// A component on an entity the world does not have, or on one it does not
    /// belong to: a 遊タイム on a mode, a kind on the regular game.
    StrayComponent {
        entity: ModeId,
        component: Component,
    },
    UnknownMode {
        at: Location,
        mode: ModeId,
    },
    /// A mode no jackpot or mode end ever leads to.
    UnreachableState {
        mode: ModeId,
    },
    /// A mode from which play can never return to the regular game: the combo
    /// would never end, and has no theoretical value.
    NonAbsorbingModel {
        mode: ModeId,
    },
    UnsupportedSpec {
        reason: Unsupported,
    },
}

/// Specs this engine declines rather than models badly.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Unsupported {
    /// Expanding lucky triggers would make more states than the engine keeps.
    TooManyStates { states: usize, limit: usize },
    /// A lucky trigger into its own mode, which moves play nowhere.
    LuckyTriggerToItself,
    /// A lucky trigger at the first combo: the jackpot that entered the mode,
    /// which cannot also be one won in it.
    LuckyTriggerOnEntry,
}

/// What can stop a normalised spec being solved. Normalisation rules these
/// out; they are here because a stored spec may come from elsewhere.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SolveError {
    /// The linear system had no unique solution: some state never ends.
    Singular,
    /// An outcome leads to a state the spec does not have.
    DanglingTarget,
}
