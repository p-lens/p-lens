//! Seeded, reproducible Monte Carlo over normalised pachinko specs: the
//! spread, win rate and worst cases of play, which the analytical engine does
//! not give. Never the theoretical value itself — that is solved exactly.

pub mod aggregate;
pub mod combo;
pub mod estimate;
pub mod hyena_hunt;
pub mod inference;
pub mod rng;
pub mod session;
pub mod simulation;
