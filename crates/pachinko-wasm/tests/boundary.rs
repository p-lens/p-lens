//! The boundary, driven with the JSON the web app sends: the fixture in
//! `packages/contracts`, so both sides are held to the same shapes.
#![allow(clippy::expect_used, clippy::indexing_slicing)]

use pachinko_wasm::api::{
    analyze, estimate_chunk, hyena_hunt_chunk, hyena_hunt_table, normalize, simulate_chunk,
};
use serde_json::{Value, json};

const SPEC: &str = include_str!("../../../packages/contracts/fixtures/pachinko/made-up/spec.json");
const EXPECTED: &str =
    include_str!("../../../packages/contracts/fixtures/pachinko/made-up/expected.json");

fn value(text: &str) -> Value {
    serde_json::from_str(text).expect("JSON")
}

fn close(left: &Value, right: &Value) -> bool {
    (left.as_f64().expect("a number") - right.as_f64().expect("a number")).abs() < 1e-9
}

fn analyzed() -> Value {
    let request = json!({
        "source": { "type": "spec", "spec": value(SPEC) },
        "conditions": { "roundPayout": { "type": "from-spec" } },
    });
    value(&analyze(&request.to_string()))
}

#[test]
fn the_made_up_fixture_analyses_to_its_expected_figures() {
    let reply = analyzed();
    let expected = value(EXPECTED);
    assert_eq!(reply["ok"], json!(true));
    let figures = &reply["value"];
    for field in [
        "averageRounds",
        "averageCombo",
        "ballsPerRound",
        "averagePayout",
        "totalChanceOneIn",
        "roundChanceOneIn",
    ] {
        assert!(
            close(&figures[field], &expected[field]),
            "{field}: {} vs {}",
            figures[field],
            expected[field]
        );
    }
    assert!(close(
        &figures["modeEntry"][0]["probability"],
        &expected["rushEntry"]
    ));
    assert_eq!(figures["modeEntry"][0]["mode"], json!("RUSH"));
}

#[test]
fn a_stored_normalised_spec_solves_to_the_same_figures_as_its_spec() {
    let normalized = value(&normalize(&json!({ "spec": value(SPEC) }).to_string()));
    assert_eq!(normalized["ok"], json!(true));
    let from_normalized = value(&analyze(
        &json!({
            "source": { "type": "normalized", "normalized": normalized["value"] },
            "conditions": { "roundPayout": { "type": "from-spec" } },
        })
        .to_string(),
    ));
    assert_eq!(
        from_normalized["value"]["averageRounds"],
        analyzed()["value"]["averageRounds"]
    );
    assert_eq!(
        from_normalized["value"]["derivation"],
        analyzed()["value"]["derivation"]
    );
}

#[test]
fn malformed_json_comes_back_as_an_envelope() {
    let reply = value(&analyze("{ not json"));
    assert_eq!(reply["ok"], json!(false));
    assert_eq!(reply["error"]["type"], json!("malformed-request"));
}

#[test]
fn a_component_this_engine_does_not_know_is_refused_by_its_table() {
    let mut spec = value(SPEC);
    spec["components"]["chargeZone"] = json!({ "RUSH": { "spins": 4 } });
    let reply = value(&normalize(&json!({ "spec": spec }).to_string()));
    assert_eq!(
        reply["error"],
        json!({ "type": "unsupported-component", "field": "spec.components.chargeZone" })
    );
}

#[test]
fn a_spec_of_another_version_is_refused_by_its_number_and_one_that_says_none_is_no_spec() {
    let mut later = value(SPEC);
    later["v"] = json!(2);
    let reply = value(&normalize(&json!({ "spec": later }).to_string()));
    assert_eq!(
        reply["error"],
        json!({ "type": "unsupported-spec-version", "version": 2, "known": 1 })
    );
    let mut unsaid = value(SPEC);
    unsaid.as_object_mut().map(|fields| fields.remove("v"));
    let reply = value(&normalize(&json!({ "spec": unsaid }).to_string()));
    assert_eq!(reply["error"]["type"], json!("malformed-request"));
}

#[test]
fn a_refused_value_is_named_by_its_path() {
    let mut spec = value(SPEC);
    spec["components"]["allotment"]["RUSH"][0]["rounds"] = json!(0);
    let reply = value(&normalize(&json!({ "spec": spec }).to_string()));
    assert_eq!(
        reply["error"],
        json!({ "type": "invalid-value", "field": "spec.components.allotment.RUSH[0].rounds" })
    );
}

#[test]
fn a_spec_error_keeps_where_and_what() {
    let mut spec = value(SPEC);
    spec["components"]["allotment"]["regular"][0]["shareBasisPoints"] = json!(4000);
    let reply = value(&normalize(&json!({ "spec": spec }).to_string()));
    assert_eq!(
        reply["error"],
        json!({ "type": "invalid-distribution", "at": { "type": "regular" }, "sumBasisPoints": 9000 })
    );
}

#[test]
fn an_entity_without_the_components_it_needs_is_named_with_what_it_lacks() {
    let mut missing = value(SPEC);
    missing["components"]["onMiss"] = json!({});
    assert_eq!(
        value(&normalize(&json!({ "spec": missing }).to_string()))["error"],
        json!({ "type": "missing-component", "entity": "RUSH", "component": "onMiss" })
    );
    let mut conflicting = value(SPEC);
    conflicting["components"]["untilHit"] = json!(["RUSH"]);
    assert_eq!(
        value(&normalize(&json!({ "spec": conflicting }).to_string()))["error"],
        json!({ "type": "conflicting-components", "entity": "RUSH", "first": "rushing", "second": "untilHit" })
    );
    let mut stray = value(SPEC);
    stray["components"]["label"]["LT"] = json!("LT");
    assert_eq!(
        value(&normalize(&json!({ "spec": stray }).to_string()))["error"],
        json!({ "type": "stray-component", "entity": "LT", "component": "label" })
    );
}

fn chunk(progress: Option<&Value>, size: u64) -> Value {
    value(&simulate_chunk(
        &json!({
            "source": { "type": "spec", "spec": value(SPEC) },
            "conditions": { "roundPayout": { "type": "from-spec" } },
            "play": { "spinPerformance": 18.0, "ballValue": 4.0 },
            "plan": { "sessions": 300, "spinsPerSession": 2000 },
            "seed": "18446744073709551615",
            "chunk": size,
            "progress": progress,
        })
        .to_string(),
    ))
}

#[test]
fn a_simulation_resumed_across_the_boundary_matches_one_run() {
    let whole = chunk(None, 300);
    let first = chunk(None, 120);
    let second = chunk(Some(&first["value"]["progress"]), 120);
    let third = chunk(Some(&second["value"]["progress"]), 120);
    assert_eq!(third["value"]["summary"]["finished"], json!(true));
    assert_eq!(third["value"]["summary"], whole["value"]["summary"]);
    assert_eq!(first["value"]["summary"]["finished"], json!(false));
}

fn estimated(progress: Option<&Value>, size: u64) -> Value {
    value(&estimate_chunk(
        &json!({
            "source": { "type": "spec", "spec": value(SPEC) },
            "conditions": { "roundPayout": { "type": "from-spec" } },
            "cycles": 5000,
            "seed": "2026",
            "chunk": size,
            "progress": progress,
        })
        .to_string(),
    ))
}

#[test]
fn an_estimate_resumed_across_the_boundary_matches_one_run_and_nears_the_exact_figure() {
    let whole = estimated(None, 5000);
    let first = estimated(None, 2000);
    let second = estimated(Some(&first["value"]["progress"]), 3000);
    assert_eq!(first["value"]["summary"]["finished"], json!(false));
    assert_eq!(second["value"]["summary"], whole["value"]["summary"]);
    let summary = &whole["value"]["summary"];
    assert_eq!(summary["finished"], json!(true));
    let exact = analyzed()["value"]["roundChanceOneIn"]
        .as_f64()
        .expect("a figure");
    let one_in = summary["roundChanceOneIn"].as_f64().expect("an estimate");
    let margin = summary["roundChanceMargin"].as_f64().expect("a margin");
    assert!(
        (one_in - exact).abs() <= 2.0 * margin,
        "{one_in} ± {margin} against {exact}"
    );
    assert!(close(
        &summary["payoutPerRound"],
        &analyzed()["value"]["ballsPerRound"]
    ));
}

fn hyena_hunted(initial_spins: u32, progress: Option<&Value>, size: u64) -> Value {
    value(&hyena_hunt_chunk(
        &json!({
            "source": { "type": "spec", "spec": value(SPEC) },
            "conditions": { "roundPayout": { "type": "from-spec" } },
            "play": { "spinPerformance": 18.0, "ballValue": 4.0 },
            "initialSpins": initial_spins,
            "trials": 4000,
            "seed": "88",
            "chunk": size,
            "progress": progress,
        })
        .to_string(),
    ))
}

#[test]
fn a_hyena_hunt_resumed_across_the_boundary_matches_one_run_and_the_exact_table() {
    let whole = hyena_hunted(0, None, 4000);
    let first = hyena_hunted(0, None, 1500);
    let second = hyena_hunted(0, Some(&first["value"]["progress"]), 2500);
    assert_eq!(second["value"]["summary"], whole["value"]["summary"]);
    let summary = &whole["value"]["summary"];
    assert_eq!(summary["finished"], json!(true));
    let table = value(&hyena_hunt_table(
        &json!({
            "source": { "type": "spec", "spec": value(SPEC) },
            "conditions": { "roundPayout": { "type": "from-spec" } },
            "play": { "spinPerformance": 18.0, "ballValue": 4.0 },
            "initialSpins": [0, 300],
        })
        .to_string(),
    ));
    let rows = table["value"].as_array().expect("rows");
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[1]["initialSpins"], json!(300));
    let exact = rows[0]["yen"].as_f64().expect("a figure");
    let mean = summary["meanYen"].as_f64().expect("a mean");
    let margin = summary["marginYen"].as_f64().expect("a margin");
    assert!(
        (mean - exact).abs() <= 2.0 * margin,
        "{mean} ± {margin} against {exact}"
    );
    assert!(
        close(&rows[0]["yen"], &rows[1]["yen"]),
        "without a relief drive the initial spins change nothing"
    );
}

const NORMALIZED: &str =
    include_str!("../../../packages/contracts/fixtures/pachinko/made-up/normalized.json");

/// A stored model version keeps its normalised spec. If normalising the same
/// spec ever comes out differently, stored versions would no longer match what
/// a new one would be — that has to be a deliberate schema change, not drift.
#[test]
fn normalising_the_made_up_still_gives_the_stored_fixture() {
    let reply = value(&normalize(&json!({ "spec": value(SPEC) }).to_string()));
    assert_eq!(reply["value"], value(NORMALIZED));
}
