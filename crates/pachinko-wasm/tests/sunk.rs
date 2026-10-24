//! ハマり台の投資額 across the boundary, driven with the JSON the web app sends.
#![allow(clippy::expect_used, clippy::indexing_slicing)]

use pachinko_wasm::sunk::sunk_chunk;
use serde_json::{Value, json};

const SPEC: &str = include_str!("../../../packages/contracts/fixtures/pachinko/made-up/spec.json");

fn value(text: &str) -> Value {
    serde_json::from_str(text).expect("JSON")
}

fn request(counter: &Value, progress: Option<&Value>) -> Value {
    let mut request = json!({
        "source": { "type": "spec", "spec": value(SPEC) },
        "conditions": { "roundPayout": { "type": "from-spec" } },
        "counter": counter,
        "spinPerformance": 17.0,
        "rentedPerThousand": 250.0,
        "trials": 20_000,
        "enough": 1_000_000,
        "seed": "42",
        "chunk": 10_000,
    });
    if let Some(progress) = progress {
        request["progress"] = progress.clone();
    }
    request
}

#[test]
fn a_counter_with_no_jackpot_is_its_spins_in_cash() {
    let reply = value(&sunk_chunk(
        &request(
            &json!({ "spins": 4100, "jackpots": 0, "sinceLast": 4100 }),
            None,
        )
        .to_string(),
    ));
    assert_eq!(reply["ok"], json!(true), "{reply}");
    assert_eq!(
        reply["value"]["summary"]["outlay"]["middle"],
        json!(241_500)
    );
}

#[test]
fn a_run_in_two_chunks_comes_out_as_one() {
    let counter = json!({ "spins": 3000, "jackpots": 3, "sinceLast": 300 });
    let first = value(&sunk_chunk(&request(&counter, None).to_string()));
    let progress = &first["value"]["progress"];
    let second = value(&sunk_chunk(&request(&counter, Some(progress)).to_string()));
    let mut whole = request(&counter, None);
    whole["chunk"] = json!(20_000);
    let once = value(&sunk_chunk(&whole.to_string()));
    assert_eq!(second["value"]["summary"], once["value"]["summary"]);
    assert_eq!(once["value"]["summary"]["trials"], json!(20_000));
    assert_eq!(once["value"]["summary"]["finished"], json!(true));
}

#[test]
fn a_bad_spin_performance_is_refused() {
    let mut bad = request(&json!({ "spins": 100, "jackpots": 0 }), None);
    bad["spinPerformance"] = json!(0.0);
    let reply = value(&sunk_chunk(&bad.to_string()));
    assert_eq!(reply["ok"], json!(false));
    assert_eq!(reply["error"]["field"], json!("spinPerformance"));
}
