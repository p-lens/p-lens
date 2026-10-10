use std::num::NonZeroU64;

use pachinko_domain::normalized::NormalizedSpec;

use crate::aggregate::Aggregate;
use crate::rng::{Rng, Seed};
use crate::session::{SessionSetup, play_session};

/// A whole simulation: how many sessions, each played how.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Plan {
    pub sessions: NonZeroU64,
    pub setup: SessionSetup,
}

/// A simulation part-way through. Everything needed to resume it, so a long
/// run can be done in chunks — reporting progress and checking for a
/// cancellation between them — and come out exactly as one run would.
#[derive(Clone, Debug, PartialEq)]
pub struct Progress {
    pub rng: Rng,
    pub aggregate: Aggregate,
}

impl Progress {
    pub fn start(seed: Seed) -> Self {
        Self {
            rng: Rng::from_seed(seed),
            aggregate: Aggregate::default(),
        }
    }

    pub fn done(&self) -> u64 {
        self.aggregate.sessions
    }

    pub fn is_finished(&self, plan: &Plan) -> bool {
        self.done() >= plan.sessions.get()
    }
}

/// Play up to `chunk` more sessions of a plan, never past its end.
pub fn advance(
    spec: &NormalizedSpec,
    plan: &Plan,
    progress: &Progress,
    chunk: NonZeroU64,
) -> Progress {
    let remaining = plan.sessions.get().saturating_sub(progress.done());
    (0..chunk.get().min(remaining)).fold(progress.clone(), |current, _| {
        let (session, rng) = play_session(spec, &plan.setup, current.rng);
        Progress {
            rng,
            aggregate: current.aggregate.with(&session),
        }
    })
}
