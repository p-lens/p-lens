//! Turns a pachislot spec into per-setting tables and answers from them
//! exactly: payout rates, the setting a cabinet is likely on given what was
//! seen at it, and the theoretical value of playing it. Pure functions;
//! nothing here samples, reads a clock or touches I/O.

pub mod analysis;
pub mod at;
mod at_machine;
pub mod error;
pub mod hunt;
pub mod normalize;
pub mod payout;
pub mod posterior;
pub mod query;
pub mod rate;
pub mod theoretical;
