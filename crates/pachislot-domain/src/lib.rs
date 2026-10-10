//! The words pachislot uses for a machine, the per-setting tables the engine
//! derives from them, and what a player sees at the cabinet. Types only: no
//! I/O, no clock, no randomness.

pub mod conditions;
pub mod distribution;
pub mod normalized;
pub mod observation;
pub mod probability;
pub mod setting_level;
pub mod spec;
pub mod version;
