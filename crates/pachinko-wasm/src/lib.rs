//! The JavaScript boundary of the pachinko engine: a few coarse calls, JSON
//! text in and out, every failure an `{ ok: false, error }` envelope. No
//! domain logic lives here.

pub mod api;
mod convert;
pub mod dto;

use wasm_bindgen::prelude::wasm_bindgen;

#[wasm_bindgen]
pub fn normalize(request: &str) -> String {
    api::normalize(request)
}

#[wasm_bindgen]
pub fn analyze(request: &str) -> String {
    api::analyze(request)
}

#[wasm_bindgen(js_name = simulateChunk)]
pub fn simulate_chunk(request: &str) -> String {
    api::simulate_chunk(request)
}

#[wasm_bindgen(js_name = estimateChunk)]
pub fn estimate_chunk(request: &str) -> String {
    api::estimate_chunk(request)
}

#[wasm_bindgen(js_name = hyenaHuntChunk)]
pub fn hyena_hunt_chunk(request: &str) -> String {
    api::hyena_hunt_chunk(request)
}

#[wasm_bindgen(js_name = hyenaHuntTable)]
pub fn hyena_hunt_table(request: &str) -> String {
    api::hyena_hunt_table(request)
}
