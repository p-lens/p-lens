//! Turns a machine spec into a combo of jackpots and solves it exactly:
//! validation, normalisation, and the analytical figures. Pure functions;
//! nothing here samples, reads a clock or touches I/O.

pub mod analysis;
pub mod error;
mod graph;
pub mod hyena_hunt;
mod linear;
pub mod normalize;
pub mod query;
pub mod relief_drive;
mod solve;
