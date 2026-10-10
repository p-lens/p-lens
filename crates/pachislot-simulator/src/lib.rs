//! Monte Carlo over a normalised pachislot spec, one regular game at a time,
//! from a seed: a formula's payout rates sampled by a second route, and the
//! spread of what a play could come to. Same seed and input, same result,
//! however the work is chunked.

pub mod aggregate;
pub mod estimate;
pub mod game;
pub mod rng;
pub mod session;
