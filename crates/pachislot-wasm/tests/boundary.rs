//! The boundary, driven with the JSON the web app sends: the fixture in
//! `packages/contracts` normalises to the stored form and solves to the
//! expected figures, refusals name their field, and runs resumed across the
//! boundary come out as one run.

#![allow(clippy::expect_used, clippy::indexing_slicing)]

use pachislot_wasm::api::{
    analyze, estimate_chunk, hunt, normalize, posterior, simulate_chunk, theoretical_value,
};
use pachislot_wasm::dto::NormalizedSpecDto;
use serde_json::{Value, json};

const SPEC: &str = include_str!("../../../packages/contracts/fixtures/pachislot/made-up/spec.json");
const NORMALIZED: &str =
    include_str!("../../../packages/contracts/fixtures/pachislot/made-up/normalized.json");
const EXPECTED: &str =
    include_str!("../../../packages/contracts/fixtures/pachislot/made-up/expected.json");

fn value(text: &str) -> Value {
    serde_json::from_str(text).expect("JSON")
}

fn close(left: &Value, right: &Value) -> bool {
    (left.as_f64().expect("a number") - right.as_f64().expect("a number")).abs() < 1e-9
}

fn ok(text: &str) -> Value {
    let reply = value(text);
    assert_eq!(reply["ok"], json!(true), "{reply}");
    reply["value"].clone()
}

fn error(text: &str) -> Value {
    let reply = value(text);
    assert_eq!(reply["ok"], json!(false), "{reply}");
    reply["error"].clone()
}

fn source() -> Value {
    json!({ "type": "spec", "spec": value(SPEC) })
}

fn from_spec() -> Value {
    json!({ "payoutRate": { "type": "from-spec" } })
}

#[test]
fn normalising_the_made_up_still_gives_the_stored_fixture() {
    let normalized = ok(&normalize(&json!({ "spec": value(SPEC) }).to_string()));
    let made: NormalizedSpecDto = serde_json::from_value(normalized).expect("a normalised spec");
    let stored: NormalizedSpecDto = serde_json::from_str(NORMALIZED).expect("the fixture");
    assert_eq!(made, stored);
}

#[test]
fn the_made_up_solves_to_the_expected_figures_from_either_source() {
    let expected = value(EXPECTED);
    let stored = json!({ "type": "normalized", "normalized": value(NORMALIZED) });
    for source in [source(), stored] {
        let analysis = ok(&analyze(
            &json!({ "source": source, "conditions": from_spec() }).to_string(),
        ));
        let pairs = expected["settingLevels"]
            .as_array()
            .expect("settingLevels")
            .iter()
            .zip(analysis["settingLevels"].as_array().expect("settingLevels"));
        for (want, got) in pairs {
            assert_eq!(want["settingLevel"], got["settingLevel"]);
            for field in ["netPerGame", "payoutRate", "combined"] {
                assert!(close(&want[field], &got[field]), "{field}: {got}");
            }
            assert!(close(
                &want["bonuses"][1]["chance"],
                &got["bonuses"][1]["chance"]
            ));
        }
    }
}

#[test]
fn a_refused_value_is_named_by_its_path() {
    let mut spec = value(SPEC);
    spec["components"]["chance"]["grape"][1]["value"] =
        json!({ "type": "ratio", "numerator": 1, "denominatorHundredths": 0 });
    assert_eq!(
        error(&normalize(&json!({ "spec": spec }).to_string())),
        json!({ "type": "invalid-value", "field": "spec.components.chance.grape[1].value.denominatorHundredths" })
    );
}

#[test]
fn a_spec_of_another_version_is_refused_by_its_number_and_one_that_says_none_is_no_spec() {
    let mut later = value(SPEC);
    later["v"] = json!(2);
    assert_eq!(
        error(&normalize(&json!({ "spec": later }).to_string())),
        json!({ "type": "unsupported-spec-version", "version": 2, "known": 1 })
    );
    let mut unsaid = value(SPEC);
    unsaid.as_object_mut().map(|fields| fields.remove("v"));
    assert_eq!(
        error(&normalize(&json!({ "spec": unsaid }).to_string()))["type"],
        json!("malformed-request")
    );
}

#[test]
fn a_component_this_engine_does_not_know_is_refused_by_its_table() {
    let mut spec = value(SPEC);
    spec["components"]["zone"] = json!({ "big": [100, 200] });
    assert_eq!(
        error(&normalize(&json!({ "spec": spec }).to_string())),
        json!({ "type": "unsupported-component", "field": "spec.components.zone" })
    );
}

#[test]
fn components_that_do_not_make_an_entity_are_named_with_it() {
    let mut spec = value(SPEC);
    spec["components"]["chance"]["reg"] = spec["components"]["chance"]["big"].clone();
    assert_eq!(
        error(&normalize(&json!({ "spec": spec }).to_string())),
        json!({ "type": "conflicting-components", "entity": "reg", "first": "chance", "second": "partOf" })
    );
}

#[test]
fn malformed_json_comes_back_as_an_envelope() {
    assert_eq!(error(&analyze("{"))["type"], json!("malformed-request"));
}

#[test]
fn the_setting_is_inferred_across_the_boundary() {
    let found = ok(&posterior(
        &json!({
            "source": source(),
            "prior": { "shares": [{ "settingLevel": 1, "value": 8000 }, { "settingLevel": 6, "value": 2000 }] },
            "segments": [
                { "games": 1500, "counts": [{ "id": "big", "count": 5 }, { "id": "reg", "count": 3 }] },
                { "games": 500, "counts": [{ "id": "big", "count": 2 }, { "id": "reg-solo", "count": 1 }, { "id": "grape", "count": 90 }] }
            ]
        })
        .to_string(),
    ));
    let setting_levels = found["settingLevels"].as_array().expect("settingLevels");
    let total: f64 = setting_levels
        .iter()
        .map(|each| each["probability"].as_f64().expect("a number"))
        .sum();
    assert!((total - 1.0).abs() < 1e-12);
    assert_eq!(
        error(&posterior(
            &json!({ "source": source(), "segments": [{ "games": 10, "counts": [{ "id": "bell", "count": 1 }] }] })
                .to_string()
        )),
        json!({ "type": "unknown-count", "segment": 0, "id": "bell" })
    );
}

#[test]
fn a_theoretical_value_weighs_settings_on_the_players_terms() {
    let found = ok(&theoretical_value(
        &json!({
            "source": source(),
            "conditions": from_spec(),
            "weights": [{ "settingLevel": 6, "probability": 1.0 }],
            "play": { "medalValue": 20, "rentalPrice": 20, "cashShare": 1, "gamesPerHour": 800 },
            "played": { "type": "games", "games": 1000 }
        })
        .to_string(),
    ));
    assert!(close(&found["medals"], &json!(405.0)));
    assert!(close(&found["yen"], &json!(8100.0)));
    assert!(close(&found["yenPerHour"], &json!(6480.0)));
}

const AT_SPEC: &str =
    include_str!("../../../packages/contracts/fixtures/pachislot/made-up-at/spec.json");

fn at_source() -> Value {
    json!({ "type": "spec", "spec": value(AT_SPEC) })
}

fn measured() -> Value {
    json!({ "payoutRate": { "type": "measured", "bySettingLevel": [
        { "settingLevel": 1, "value": 9700 }, { "settingLevel": 6, "value": 11000 }
    ] } })
}

#[test]
fn an_at_machine_is_read_with_its_rules_and_published_first_hit() {
    let normalized = ok(&normalize(&json!({ "spec": value(AT_SPEC) }).to_string()));
    assert_eq!(
        normalized["atRules"],
        json!({
            "base": 40.0, "at": "at",
            "modes": [{ "id": "at", "ceiling": 1000 }, { "id": "at:reset", "ceiling": 600 }]
        })
    );
    assert_eq!(normalized["tables"][0]["events"], json!([]));
    assert_eq!(normalized["tables"][0]["at"]["success"], json!(1.0));
    assert_eq!(
        normalized["tables"][0]["at"]["payout"],
        json!({ "type": "fixed", "medals": 600.0 })
    );
    let analysis = ok(&analyze(
        &json!({ "source": at_source(), "conditions": measured() }).to_string(),
    ));
    assert!(close(
        &analysis["settingLevels"][0]["bonuses"][0]["chance"],
        &json!(0.002)
    ));
}

#[test]
fn an_at_machine_is_weighed_by_its_path_and_never_by_a_count_of_games() {
    let request = |played: Value| {
        json!({
            "source": at_source(),
            "conditions": measured(),
            "weights": [{ "settingLevel": 1, "probability": 1.0 }],
            "play": { "medalValue": 20, "rentalPrice": 20, "cashShare": 0 },
            "played": played
        })
        .to_string()
    };
    let found = ok(&theoretical_value(&request(
        json!({ "type": "path", "path": {
            "start": { "sinceTrigger": 0, "sinceAt": 0, "misses": 0, "afterReset": false },
            "legs": [{ "games": 100, "end": "going" }]
        } }),
    )));
    assert!(found["medals"].as_f64().expect("medals") < 0.0);
    assert_eq!(
        error(&theoretical_value(&request(
            json!({ "type": "games", "games": 100 })
        ))),
        json!({ "type": "played-mismatch" })
    );
    let inferred = ok(&posterior(
        &json!({
            "source": at_source(),
            "segments": [],
            "path": {
                "start": { "sinceTrigger": 0, "sinceAt": 0, "misses": 0, "afterReset": false },
                "legs": [{ "games": 999, "end": "going" }]
            }
        })
        .to_string(),
    ));
    let low = inferred["settingLevels"][0]["probability"]
        .as_f64()
        .expect("a share");
    assert!(low > 0.5);
}

const MODES_SPEC: &str =
    include_str!("../../../packages/contracts/fixtures/pachislot/made-up-modes/spec.json");

#[test]
fn a_machine_of_modes_is_read_with_its_ceilings_in_regular_games_and_its_allotments() {
    let normalized = ok(&normalize(
        &json!({ "spec": value(MODES_SPEC) }).to_string(),
    ));
    assert_eq!(
        normalized["atRules"]["modes"],
        json!([{ "id": "heaven", "ceiling": 80 }, { "id": "normal", "ceiling": 800 }])
    );
    assert_eq!(
        normalized["tables"][1]["at"]["allotments"],
        json!({ "afterAt": [0.5, 0.5], "afterReset": [1.0, 0.0] })
    );
}

/// The machine of modes whose AT ends at once (駆け抜け) half the time, after
/// which play enters 天国 20% of the time; after any other end, as its
/// modes' allotments say.
fn ended_spec() -> Value {
    let mut spec = value(MODES_SPEC);
    let entities = spec["entities"].as_array_mut().expect("entities");
    entities.push(json!("through"));
    entities.push(json!("rest"));
    let half = json!([{ "settingLevel": 1, "value": 5000 }, { "settingLevel": 6, "value": 5000 }]);
    let components = &mut spec["components"];
    components["label"]["through"] = json!("駆け抜け");
    components["label"]["rest"] = json!("それ以外");
    components["ending"] = json!({ "through": half, "rest": half });
    components["endingAllotment"] = json!({
        "heaven": { "through": [{ "settingLevel": 1, "value": 2000 }, { "settingLevel": 6, "value": 2000 }] },
        "normal": { "through": [{ "settingLevel": 1, "value": 8000 }, { "settingLevel": 6, "value": 8000 }] }
    });
    spec
}

#[test]
fn endings_are_carried_with_their_allotments_and_a_seat_may_name_one() {
    let normalized = ok(&normalize(&json!({ "spec": ended_spec() }).to_string()));
    assert_eq!(normalized["atRules"]["endings"], json!(["through", "rest"]));
    let allotments = &normalized["tables"][1]["at"]["allotments"];
    assert_eq!(
        allotments["afterEndings"],
        json!([
            { "share": 0.5, "afterAt": [0.2, 0.8] },
            { "share": 0.5, "afterAt": [0.5, 0.5] }
        ])
    );
    assert!(close(&allotments["afterAt"][0], &json!(0.35)));
    let stored: NormalizedSpecDto =
        serde_json::from_value(normalized.clone()).expect("a normalised spec");
    assert_eq!(
        serde_json::to_value(&stored).expect("written again"),
        normalized
    );
    let weights = json!([{ "settingLevel": 1, "probability": 0.5 }, { "settingLevel": 6, "probability": 0.5 }]);
    let play = json!({ "medalValue": 20, "rentalPrice": 20, "cashShare": 1 });
    let seat = |ending: Option<&str>| {
        let mut seat = json!({ "sinceTrigger": 0, "sinceAt": 0, "misses": 0, "afterReset": false });
        if let Some(ending) = ending {
            seat["ending"] = json!(ending);
        }
        seat
    };
    let source = json!({ "type": "normalized", "normalized": normalized });
    let found = ok(&hunt(
        &json!({ "source": source, "weights": weights, "play": play, "seats": [seat(None), seat(Some("through")), seat(Some("rest"))] })
            .to_string(),
    ));
    let games = |index: usize| found[index]["games"].as_f64().expect("games");
    assert!(games(1) > games(0) && games(0) > games(2));
    assert_eq!(
        error(&hunt(
            &json!({ "source": source, "weights": weights, "play": play, "seats": [seat(Some("upper"))] })
                .to_string(),
        )),
        json!({ "type": "unknown-ending", "ending": "upper" })
    );
    let told = |ending: &str| {
        json!({
            "source": source,
            "segments": [],
            "path": {
                "start": { "sinceTrigger": 0, "sinceAt": 0, "misses": 0, "afterReset": false },
                "legs": [
                    { "games": 40, "end": "won-at", "at": { "ending": ending } },
                    { "games": 60, "end": "going" }
                ]
            }
        })
        .to_string()
    };
    assert!(ok(&posterior(&told("through")))["settingLevels"].is_array());
    assert_eq!(
        error(&posterior(&told("upper"))),
        json!({ "type": "unknown-ending", "ending": "upper" })
    );
    let mut lopsided = ended_spec();
    lopsided["components"]["ending"]["rest"] =
        json!([{ "settingLevel": 1, "value": 4000 }, { "settingLevel": 6, "value": 5000 }]);
    assert_eq!(
        error(&normalize(&json!({ "spec": lopsided }).to_string())),
        json!({ "type": "endings-not-whole", "settingLevel": 1, "sum": 9000 })
    );
    let mut unallotted = ended_spec();
    unallotted["components"]
        .as_object_mut()
        .expect("components")
        .remove("endingAllotment");
    assert_eq!(
        error(&normalize(&json!({ "spec": unallotted }).to_string())),
        json!({ "type": "endings-without-allotment", "entity": "through" })
    );
    let mut unmatched = source["normalized"].clone();
    unmatched["atRules"]["endings"] = json!(["through"]);
    assert_eq!(
        error(&analyze(
            &json!({ "source": { "type": "normalized", "normalized": unmatched }, "conditions": measured() })
                .to_string(),
        )),
        json!({ "type": "invalid-value", "field": "normalized.tables[0].at.allotments.afterEndings" })
    );
}

fn simulate(chunk: u64, progress: Option<&Value>) -> Value {
    let mut request = json!({
        "source": source(),
        "conditions": from_spec(),
        "weights": [{ "settingLevel": 1, "probability": 0.5 }, { "settingLevel": 6, "probability": 0.5 }],
        "play": { "medalValue": 20, "rentalPrice": 20, "cashShare": 1 },
        "plan": { "sessions": 40, "games": 300 },
        "seed": "18446744073709551615",
        "chunk": chunk
    });
    if let Some(progress) = progress {
        request["progress"] = progress.clone();
    }
    ok(&simulate_chunk(&request.to_string()))
}

#[test]
fn a_simulation_resumed_across_the_boundary_matches_one_run() {
    let whole = simulate(40, None);
    let first = simulate(15, None);
    let second = simulate(15, Some(&first["progress"]));
    let third = simulate(15, Some(&second["progress"]));
    assert_eq!(third["summary"], whole["summary"]);
    assert_eq!(whole["summary"]["finished"], json!(true));
}

fn estimate(chunk: u64, progress: Option<&Value>) -> Value {
    let mut request = json!({
        "source": source(),
        "conditions": from_spec(),
        "gamesPerSettingLevel": 500,
        "seed": "7",
        "chunk": chunk
    });
    if let Some(progress) = progress {
        request["progress"] = progress.clone();
    }
    ok(&estimate_chunk(&request.to_string()))
}

#[test]
fn an_estimate_resumed_across_the_boundary_matches_one_run() {
    let whole = estimate(1_000, None);
    let first = estimate(333, None);
    let second = estimate(333, Some(&first["progress"]));
    let third = estimate(334, Some(&second["progress"]));
    assert_eq!(third["summary"], whole["summary"]);
    assert_eq!(whole["summary"]["finished"], json!(true));
    let mut stray = first["progress"].clone();
    stray["tallies"][0]["settingLevel"] = json!(2);
    let reply = estimate_chunk(
        &json!({
            "source": source(), "conditions": from_spec(), "gamesPerSettingLevel": 500,
            "seed": "7", "chunk": 10, "progress": stray
        })
        .to_string(),
    );
    assert_eq!(
        error(&reply),
        json!({ "type": "invalid-value", "field": "progress.tallies" })
    );
}

const CZ_SPEC: &str =
    include_str!("../../../packages/contracts/fixtures/pachislot/made-up-cz/spec.json");

#[test]
fn a_cz_machine_is_read_with_its_trigger_its_ceilings_and_its_at_worked_out() {
    let normalized = ok(&normalize(&json!({ "spec": value(CZ_SPEC) }).to_string()));
    assert_eq!(
        normalized["atRules"],
        json!({
            "base": 40.0, "at": "at", "trigger": "cz",
            "modes": [
                { "id": "cz", "ceiling": 600, "atCeiling": 1000, "misses": 3 },
                { "id": "cz:reset", "ceiling": 300, "atCeiling": 1000, "misses": 3 }
            ]
        })
    );
    assert!(close(
        &normalized["tables"][1]["at"]["success"],
        &json!(0.4)
    ));
    let analysis = ok(&analyze(
        &json!({ "source": { "type": "spec", "spec": value(CZ_SPEC) }, "conditions": measured() })
            .to_string(),
    ));
    let bonuses = &analysis["settingLevels"][0]["bonuses"];
    assert_eq!(bonuses[0]["id"], json!("cz"));
    assert!(close(&bonuses[0]["chance"], &json!(1.0 / 150.0)));
    assert_eq!(bonuses[1]["id"], json!("at"));
    let inferred = ok(&posterior(
        &json!({
            "source": { "type": "normalized", "normalized": normalized },
            "segments": [],
            "path": {
                "start": { "sinceTrigger": 120, "sinceAt": 300, "misses": 1, "afterReset": false },
                "legs": [{ "games": 40, "end": "missed" }, { "games": 90, "end": "won-at" }]
            }
        })
        .to_string(),
    ));
    assert_eq!(inferred["settingLevels"].as_array().map(Vec::len), Some(2));
    assert_eq!(
        error(&posterior(
            &json!({
                "source": source(),
                "segments": [],
                "path": { "start": { "sinceTrigger": 0, "sinceAt": 0, "misses": 0, "afterReset": false }, "legs": [] }
            })
            .to_string(),
        )),
        json!({ "type": "path-without-at" })
    );
}

const CAP_SPEC: &str =
    include_str!("../../../packages/contracts/fixtures/pachislot/made-up-cap/spec.json");

#[test]
fn a_capped_machine_is_read_with_its_sets_its_window_and_what_an_at_comes_to() {
    let normalized = ok(&normalize(&json!({ "spec": value(CAP_SPEC) }).to_string()));
    assert_eq!(normalized["atRules"]["cap"], json!(2400.0));
    assert_eq!(normalized["atRules"]["window"], json!(32));
    assert_eq!(normalized["atRules"]["resetOnCap"], json!(true));
    assert_eq!(
        normalized["tables"][1]["at"]["payout"],
        json!({ "type": "sets", "first": 300.0, "set": 100.0, "continuationRate": 0.85 })
    );
    let analysis = ok(&analyze(
        &json!({ "source": { "type": "spec", "spec": value(CAP_SPEC) }, "conditions": measured() })
            .to_string(),
    ));
    let at = &analysis["settingLevels"][0]["at"];
    assert!(at["completion"].as_f64().expect("a completion") > 0.0);
    assert!(at["gain"].as_f64().expect("a gain") < 700.0);
    assert!(close(
        &analysis["settingLevels"][0]["bonuses"][0]["chance"],
        &json!(0.002)
    ));
    let inferred = ok(&posterior(
        &json!({
            "source": { "type": "normalized", "normalized": normalized },
            "segments": [],
            "path": {
                "start": { "sinceTrigger": 10, "sinceAt": 10, "misses": 0, "afterReset": false, "held": 1200 },
                "legs": [
                    { "games": 5, "end": "won-at", "at": { "completed": true } },
                    { "games": 200, "end": "won-at", "at": { "completed": false, "sets": 4 } }
                ]
            }
        })
        .to_string(),
    ));
    assert_eq!(inferred["settingLevels"].as_array().map(Vec::len), Some(2));
    assert_eq!(
        error(&normalize(
            &json!({ "spec": { "v": 1, "entities": ["at"], "components": { "at": ["at"], "payout": { "at": 600 },
                "firstHit": { "at": [{ "settingLevel": 1, "value": { "type": "ratio", "numerator": 1, "denominatorHundredths": 50000 } }] },
                "window": { "at": 32 } },
                "resources": { "settingLevels": [1], "bet": 3, "base": 40 } } })
            .to_string(),
        )),
        json!({ "type": "needs-cap", "entity": "at", "component": "window" })
    );
}

#[test]
fn a_cz_machine_stored_in_shape_two_has_its_one_at_ceiling_read_into_every_mode() {
    let normalized = ok(&normalize(&json!({ "spec": value(CZ_SPEC) }).to_string()));
    let mut stored = normalized.clone();
    stored["schemaVersion"] = json!(2);
    stored["atRules"]["atCeiling"] = json!(1000);
    for mode in stored["atRules"]["modes"].as_array_mut().expect("modes") {
        mode.as_object_mut().expect("a mode").remove("atCeiling");
    }
    let solved = |normalized: &Value| {
        ok(&analyze(
            &json!({ "source": { "type": "normalized", "normalized": normalized }, "conditions": measured() })
                .to_string(),
        ))["settingLevels"]
            .clone()
    };
    assert_eq!(solved(&stored), solved(&normalized));
    let mut mixed = stored.clone();
    mixed["atRules"]["modes"][0]["atCeiling"] = json!(1000);
    assert_eq!(
        error(&analyze(
            &json!({ "source": { "type": "normalized", "normalized": mixed }, "conditions": measured() })
                .to_string(),
        )),
        json!({ "type": "invalid-value", "field": "normalized.atRules.modes[0].atCeiling" })
    );
}

#[test]
fn a_cz_machine_stored_with_one_through_ceiling_has_it_read_into_every_mode() {
    let normalized = ok(&normalize(&json!({ "spec": value(CZ_SPEC) }).to_string()));
    let mut stored = normalized.clone();
    stored["atRules"]["misses"] = json!(3);
    for mode in stored["atRules"]["modes"].as_array_mut().expect("modes") {
        mode.as_object_mut().expect("a mode").remove("misses");
    }
    let solved = |normalized: &Value| {
        ok(&analyze(
            &json!({ "source": { "type": "normalized", "normalized": normalized }, "conditions": measured() })
                .to_string(),
        ))["settingLevels"]
            .clone()
    };
    assert_eq!(solved(&stored), solved(&normalized));
    let mut mixed = stored.clone();
    mixed["atRules"]["modes"][0]["misses"] = json!(3);
    assert_eq!(
        error(&analyze(
            &json!({ "source": { "type": "normalized", "normalized": mixed }, "conditions": measured() })
                .to_string(),
        )),
        json!({ "type": "invalid-value", "field": "normalized.atRules.modes[0].misses" })
    );
}

#[test]
fn an_at_machine_s_small_win_is_counted_with_no_payout_of_its_own() {
    let mut spec = value(CZ_SPEC);
    spec["entities"]
        .as_array_mut()
        .expect("entities")
        .push(json!("bell"));
    spec["components"]["chance"]["bell"] = json!([
        { "settingLevel": 1, "value": { "type": "ratio", "numerator": 1, "denominatorHundredths": 730 } },
        { "settingLevel": 6, "value": { "type": "ratio", "numerator": 1, "denominatorHundredths": 690 } }
    ]);
    let normalized = ok(&normalize(&json!({ "spec": spec }).to_string()));
    assert_eq!(
        normalized["tables"][0]["events"][0]["kind"],
        json!({ "type": "role" })
    );
    let solved = |source: Value| {
        ok(&analyze(
            &json!({ "source": source, "conditions": measured() }).to_string(),
        ))["settingLevels"]
            .clone()
    };
    assert_eq!(
        solved(json!({ "type": "normalized", "normalized": normalized })),
        solved(json!({ "type": "spec", "spec": value(CZ_SPEC) }))
    );
    spec["components"]["payout"]["bell"] = json!(8.0);
    assert_eq!(
        error(&normalize(&json!({ "spec": spec }).to_string())),
        json!({ "type": "payout-beside-at", "entity": "bell" })
    );
}

#[test]
fn a_seat_at_an_at_machine_is_hunted_from_each_given_and_a_machine_of_bonuses_has_none() {
    let weights = json!([{ "settingLevel": 1, "probability": 0.5 }, { "settingLevel": 6, "probability": 0.5 }]);
    let play = json!({ "medalValue": 20, "rentalPrice": 25, "cashShare": 1 });
    let seat = |since_at: u32| json!({ "sinceTrigger": 0, "sinceAt": since_at, "misses": 0, "afterReset": false });
    let found = ok(&hunt(
        &json!({ "source": { "type": "spec", "spec": value(CZ_SPEC) }, "weights": weights, "play": play, "seats": [seat(0), seat(900)] })
            .to_string(),
    ));
    let rows = found.as_array().expect("a row a seat");
    assert_eq!(rows.len(), 2);
    let read = |row: &Value, key: &str| row[key].as_f64().expect("a figure");
    assert!(read(&rows[1], "games") < read(&rows[0], "games"));
    assert!(read(&rows[1], "byCeiling") > read(&rows[0], "byCeiling"));
    assert!(close(
        &json!(read(&rows[0], "yen")),
        &json!(read(&rows[0], "medals") * 20.0 - read(&rows[0], "games") * 3.0 * 5.0)
    ));
    assert_eq!(
        error(&hunt(
            &json!({ "source": source(), "weights": weights, "play": play, "seats": [seat(0)] })
                .to_string()
        )),
        json!({ "type": "path-without-at" })
    );
}

/// The made-up machine with a BIG's 20 games watched for a スイカ.
fn watched_spec() -> Value {
    let mut spec = value(SPEC);
    let entities = spec["entities"].as_array_mut().expect("entities");
    entities.push(json!("big-games"));
    entities.push(json!("big-suika"));
    let components = &mut spec["components"];
    components["watch"] = json!({ "big-games": "big" });
    components["trials"] = json!({ "big-games": 20 });
    components["cue"] = json!({ "big-suika": "big-games" });
    components["chance"]["big-suika"] = json!([
        { "settingLevel": 1, "value": { "type": "ratio", "numerator": 1, "denominatorHundredths": 4000 } },
        { "settingLevel": 6, "value": { "type": "ratio", "numerator": 1, "denominatorHundredths": 3000 } }
    ]);
    spec
}

#[test]
fn a_watch_crosses_the_boundary_stored_and_weighed() {
    let normalized = ok(&normalize(&json!({ "spec": watched_spec() }).to_string()));
    assert_eq!(
        normalized["watches"],
        json!([{ "id": "big-games", "bonus": "big", "trials": 20, "whole": false }])
    );
    assert!(close(
        &normalized["tables"][1]["cues"][0]["chance"],
        &json!(1.0 / 30.0)
    ));
    let stored = json!({ "type": "normalized", "normalized": normalized });
    let weighed = |counts: Value| {
        ok(&posterior(
            &json!({ "source": stored, "segments": [{ "games": 1000, "counts": counts }] })
                .to_string(),
        ))["settingLevels"][0]["probability"]
            .as_f64()
            .expect("a probability")
    };
    let unwatched = weighed(json!([{ "id": "big", "count": 5 }]));
    let none_seen =
        weighed(json!([{ "id": "big", "count": 5 }, { "id": "big-suika", "count": 0 }]));
    assert!(none_seen > unwatched);
    assert_eq!(
        error(&posterior(
            &json!({ "source": stored, "segments": [{ "games": 1000, "counts": [{ "id": "big", "count": 1 }, { "id": "big-suika", "count": 21 }] }] })
                .to_string(),
        )),
        json!({ "type": "cues-exceed-trials", "segment": 0, "id": "big-games" })
    );
}

#[test]
fn a_cz_that_is_a_bonus_carries_its_medals_through_the_stored_spec_and_the_hunt() {
    let mut spec = value(CZ_SPEC);
    spec["components"]["payout"]["cz"] = json!(100.0);
    spec["components"]["netPerGame"]["cz"] = json!(5.0);
    let normalized = ok(&normalize(&json!({ "spec": spec }).to_string()));
    assert_eq!(
        normalized["atRules"]["triggerPayout"],
        json!({ "medals": 100.0, "netPerGame": 5.0 })
    );
    assert_eq!(normalized["atRules"]["triggerIsBonus"], json!(true));
    let weights = json!([{ "settingLevel": 1, "probability": 1.0 }]);
    let play = json!({ "medalValue": 20, "rentalPrice": 20, "cashShare": 0 });
    let seats = json!([{ "sinceTrigger": 0, "sinceAt": 0, "misses": 0, "afterReset": false }]);
    let hunted = |source: Value| {
        ok(&hunt(
            &json!({ "source": source, "weights": weights, "play": play, "seats": seats })
                .to_string(),
        ))[0]
            .clone()
    };
    let paid = hunted(json!({ "type": "normalized", "normalized": normalized }));
    let plain = hunted(json!({ "type": "spec", "spec": value(CZ_SPEC) }));
    assert!(paid["triggerMedals"].as_f64().expect("medals") > 0.0);
    assert_eq!(plain["triggerMedals"], json!(0.0));
    assert!(close(
        &json!(
            paid["medals"].as_f64().expect("medals") - plain["medals"].as_f64().expect("medals")
        ),
        &paid["triggerMedals"]
    ));
}

#[test]
fn a_cz_ceiling_counted_from_the_at_is_carried_on_each_mode() {
    let mut spec = value(CZ_SPEC);
    spec["components"]["sinceAtCeiling"] = json!({ "cz": 800 });
    let normalized = ok(&normalize(&json!({ "spec": spec }).to_string()));
    assert_eq!(
        normalized["atRules"]["modes"][0]["sinceAtCeiling"],
        json!(800)
    );
    spec["components"]["sinceAtCeiling"] = json!({ "cz": 1001 });
    assert_eq!(
        error(&normalize(&json!({ "spec": spec }).to_string())),
        json!({ "type": "since-at-ceiling-beyond-at-ceiling", "entity": "cz" })
    );
}

#[test]
fn a_cz_ceiling_counted_from_the_at_after_a_setting_change_is_carried_on_the_reset_mode() {
    let mut spec = value(CZ_SPEC);
    spec["components"]["sinceAtCeiling"] = json!({ "cz": 800 });
    spec["components"]["resetSinceAtCeiling"] = json!({ "cz": 400 });
    let normalized = ok(&normalize(&json!({ "spec": spec }).to_string()));
    let modes = &normalized["atRules"]["modes"];
    assert_eq!(
        (&modes[0]["sinceAtCeiling"], &modes[1]["sinceAtCeiling"]),
        (&json!(800), &json!(400))
    );
    spec["components"]
        .as_object_mut()
        .expect("components")
        .remove("sinceAtCeiling");
    assert_eq!(
        error(&normalize(&json!({ "spec": spec }).to_string())),
        json!({ "type": "reset-since-at-ceiling-without-since-at-ceiling", "entity": "cz" })
    );
}

#[test]
fn an_at_won_outright_beside_its_cz_is_carried_on_each_setting() {
    let mut spec = value(CZ_SPEC);
    spec["components"]["direct"] = json!({ "at": [
        { "settingLevel": 1, "value": { "type": "ratio", "numerator": 1, "denominatorHundredths": 200_000 } },
        { "settingLevel": 6, "value": { "type": "ratio", "numerator": 1, "denominatorHundredths": 150_000 } }
    ] });
    let normalized = ok(&normalize(&json!({ "spec": spec }).to_string()));
    assert!(close(
        &normalized["tables"][0]["at"]["direct"],
        &json!(0.0005)
    ));
    let plain = ok(&normalize(&json!({ "spec": value(CZ_SPEC) }).to_string()));
    assert_eq!(plain["tables"][0]["at"].get("direct"), None);
}

#[test]
fn a_bonus_brought_outright_is_carried_on_each_setting_and_counted_in_the_cycle() {
    let mut spec = value(CZ_SPEC);
    spec["components"]["bonusShare"] = json!({ "cz": [
        { "settingLevel": 1, "value": 5000 },
        { "settingLevel": 6, "value": 5000 }
    ] });
    spec["components"]["payout"]["cz"] = json!(200);
    spec["components"]["directBonus"] = json!({ "at": [
        { "settingLevel": 1, "value": { "type": "ratio", "numerator": 1, "denominatorHundredths": 100_000 } },
        { "settingLevel": 6, "value": { "type": "ratio", "numerator": 1, "denominatorHundredths": 80_000 } }
    ] });
    let normalized = ok(&normalize(&json!({ "spec": spec }).to_string()));
    assert!(close(
        &normalized["tables"][0]["at"]["directBonus"],
        &json!(0.001)
    ));
    assert!(close(
        &normalized["tables"][0]["at"]["direct"],
        &json!(0.0005)
    ));
    let analysis = ok(&analyze(
        &json!({ "source": { "type": "spec", "spec": spec }, "conditions": measured() })
            .to_string(),
    ));
    assert!(
        analysis["settingLevels"][0]["at"]["directBonuses"]
            .as_f64()
            .is_some_and(|bonuses| bonuses > 0.0)
    );
    let plain = ok(&normalize(&json!({ "spec": value(CZ_SPEC) }).to_string()));
    assert_eq!(plain["tables"][0]["at"].get("directBonus"), None);
    let mut lone = value(CZ_SPEC);
    lone["components"]["directBonus"] = spec["components"]["directBonus"].clone();
    assert_eq!(
        error(&normalize(&json!({ "spec": lone }).to_string())),
        json!({ "type": "direct-bonus-without-bonus-share", "entity": "at" })
    );
}

#[test]
fn a_side_bonus_is_carried_with_its_ceiling_and_paid_on_the_cycle_and_from_a_seat() {
    let mut spec = value(CZ_SPEC);
    spec["entities"] = json!(["at", "cz", "fran"]);
    spec["components"]["sideBonus"] = json!(["fran"]);
    spec["components"]["firstHit"]["fran"] = json!([
        { "settingLevel": 1, "value": { "type": "ratio", "numerator": 1, "denominatorHundredths": 25_000 } },
        { "settingLevel": 6, "value": { "type": "ratio", "numerator": 1, "denominatorHundredths": 20_000 } }
    ]);
    spec["components"]["ceiling"]["fran"] = json!(300);
    spec["components"]["payout"]["fran"] = json!(100);
    let normalized = ok(&normalize(&json!({ "spec": spec }).to_string()));
    assert_eq!(
        normalized["atRules"]["sideBonus"],
        json!({ "id": "fran", "ceiling": 300, "payout": { "medals": 100.0 } })
    );
    assert!(
        normalized["tables"][0]["at"]["sideChance"]
            .as_f64()
            .is_some_and(|chance| chance > 0.0 && chance < 1.0 / 250.0)
    );
    let analysis = ok(&analyze(
        &json!({ "source": { "type": "spec", "spec": spec }, "conditions": measured() })
            .to_string(),
    ));
    assert!(
        analysis["settingLevels"][0]["at"]["sideBonuses"]
            .as_f64()
            .is_some_and(|bonuses| bonuses > 0.0)
    );
    let plain = ok(&normalize(&json!({ "spec": value(CZ_SPEC) }).to_string()));
    assert_eq!(plain["atRules"].get("sideBonus"), None);
    assert_eq!(plain["tables"][0]["at"].get("sideChance"), None);
    let weights = json!([{ "settingLevel": 1, "probability": 0.5 }, { "settingLevel": 6, "probability": 0.5 }]);
    let play = json!({ "medalValue": 20, "rentalPrice": 25, "cashShare": 1 });
    let seat = |since: Option<u32>| {
        let mut seat = json!({ "sinceTrigger": 0, "sinceAt": 0, "misses": 0, "afterReset": false });
        if let Some(since) = since {
            seat["sinceSideBonus"] = json!(since);
        }
        seat
    };
    let found = ok(&hunt(
        &json!({ "source": { "type": "spec", "spec": spec }, "weights": weights, "play": play, "seats": [seat(None), seat(Some(299))] })
            .to_string(),
    ));
    let read = |row: &Value, key: &str| row[key].as_f64().expect("a figure");
    assert!(read(&found[1], "sideMedals") > read(&found[0], "sideMedals"));
    assert!(read(&found[1], "medals") > read(&found[0], "medals"));
    let bare = ok(&hunt(
        &json!({ "source": { "type": "spec", "spec": value(CZ_SPEC) }, "weights": weights, "play": play, "seats": [seat(Some(299))] })
            .to_string(),
    ));
    assert_eq!(bare[0].get("sideMedals"), None);
    let mut lone = value(SPEC);
    lone["entities"] = json!([
        "big",
        "reg",
        "reg-solo",
        "reg-cherry",
        "grape",
        "cherry",
        "replay",
        "fran"
    ]);
    lone["components"]["sideBonus"] = json!(["fran"]);
    lone["components"]["chance"]["fran"] = spec["components"]["firstHit"]["fran"].clone();
    lone["components"]["payout"]["fran"] = json!(100);
    assert_eq!(
        error(&normalize(&json!({ "spec": lone }).to_string())),
        json!({ "type": "side-bonus-without-at", "entity": "fran" })
    );
}

#[test]
fn a_cz_given_below_its_ceilings_is_taken_as_it_is_across_the_boundary() {
    let mut spec = value(CZ_SPEC);
    let given = json!([
        { "settingLevel": 1, "value": { "type": "ratio", "numerator": 1, "denominatorHundredths": 33_380 } },
        { "settingLevel": 6, "value": { "type": "ratio", "numerator": 1, "denominatorHundredths": 28_000 } }
    ]);
    spec["components"]["firstHit"] = json!({});
    spec["components"]["chance"] = json!({ "cz": given });
    let normalized = ok(&normalize(&json!({ "spec": spec }).to_string()));
    assert!(close(
        &normalized["tables"][0]["at"]["chance"],
        &json!(1.0 / 333.8)
    ));
    let analysis = ok(&analyze(
        &json!({ "source": { "type": "spec", "spec": spec }, "conditions": measured() })
            .to_string(),
    ));
    assert!(
        analysis["settingLevels"][0]["bonuses"][0]["chance"]
            .as_f64()
            .is_some_and(|combined| combined > 1.0 / 333.8)
    );
    spec["components"]["firstHit"] = json!({ "cz": given });
    assert_eq!(
        error(&normalize(&json!({ "spec": spec }).to_string())),
        json!({ "type": "conflicting-components", "entity": "cz", "first": "chance", "second": "firstHit" })
    );
}

const HEAVY: &str =
    include_str!("../../../packages/contracts/fixtures/pachislot/made-up-heavy/spec.json");

#[test]
fn a_spec_past_the_steps_it_is_given_is_too_heavy_and_one_given_none_is_solved() {
    let spec = value(HEAVY);
    let limited = json!({ "spec": spec, "steps": 100_000 }).to_string();
    assert_eq!(error(&normalize(&limited)), json!({ "type": "too-heavy" }));
    let unlimited = json!({ "spec": spec }).to_string();
    let normalized = ok(&normalize(&unlimited));
    let analysed = json!({ "source": { "type": "normalized", "normalized": normalized }, "conditions": from_spec(), "steps": 100_000 }).to_string();
    assert_eq!(error(&analyze(&analysed)), json!({ "type": "too-heavy" }));
    let light = json!({ "spec": value(SPEC), "steps": 100_000 }).to_string();
    ok(&normalize(&light));
}

#[test]
fn an_at_ceiling_that_brings_the_trigger_is_carried_and_counted() {
    let mut spec = value(CZ_SPEC);
    let outright = ok(&normalize(&json!({ "spec": spec }).to_string()));
    assert_eq!(outright["atRules"].get("ceilingAt"), None);
    spec["components"]["ceilingTriggers"] = json!(["at"]);
    let normalized = ok(&normalize(&json!({ "spec": spec }).to_string()));
    assert_eq!(normalized["atRules"]["ceilingAt"], json!("triggered"));
    let analyzed = |source: Value| {
        ok(&analyze(
            &json!({ "source": source, "conditions": measured() }).to_string(),
        ))
    };
    let from_spec = analyzed(json!({ "type": "spec", "spec": spec }));
    let from_normalized = analyzed(json!({ "type": "normalized", "normalized": normalized }));
    assert_eq!(from_spec["settingLevels"], from_normalized["settingLevels"]);
    let figures = &from_spec["settingLevels"][0];
    assert!(close(&figures["bonuses"][0]["chance"], &json!(1.0 / 150.0)));
    assert!(
        figures["at"]["ceilingTriggers"]
            .as_f64()
            .is_some_and(|ceiled| ceiled > 0.0)
    );
    let unceiled = analyzed(json!({ "type": "normalized", "normalized": outright }));
    assert_eq!(
        unceiled["settingLevels"][0]["at"].get("ceilingTriggers"),
        None
    );
    let mut direct = value(AT_SPEC);
    direct["components"]["ceilingTriggers"] = json!(["at"]);
    assert_eq!(
        error(&normalize(&json!({ "spec": direct }).to_string())),
        json!({ "type": "ceiling-triggers-without-cz", "entity": "at" })
    );
}

#[test]
fn an_at_ceiling_across_bonuses_is_carried_and_hunted_from_the_at_itself() {
    let mut spec = value(CZ_SPEC);
    spec["components"]["ceiling"] = json!({ "cz": 600 });
    spec["components"]["bonusShare"] = json!({ "cz": [
        { "settingLevel": 1, "value": 5000 },
        { "settingLevel": 6, "value": 5000 }
    ] });
    spec["components"]["restart"] = json!(["cz"]);
    let restarting = ok(&normalize(&json!({ "spec": spec }).to_string()));
    assert_eq!(restarting["atRules"].get("ceilingAcrossBonuses"), None);
    spec["components"]["ceilingAcrossBonuses"] = json!({ "at": 1600 });
    let normalized = ok(&normalize(&json!({ "spec": spec }).to_string()));
    assert_eq!(normalized["atRules"]["ceilingAcrossBonuses"], json!(1600));
    let analyzed = |source: Value| {
        ok(&analyze(
            &json!({ "source": source, "conditions": measured() }).to_string(),
        ))
    };
    assert_eq!(
        analyzed(json!({ "type": "spec", "spec": spec }))["settingLevels"],
        analyzed(json!({ "type": "normalized", "normalized": normalized }))["settingLevels"]
    );
    let weights = json!([{ "settingLevel": 1, "probability": 1.0 }]);
    let play = json!({ "medalValue": 20, "rentalPrice": 20, "cashShare": 0 });
    let seat = |across: Option<u32>| {
        let mut seat =
            json!({ "sinceTrigger": 100, "sinceAt": 100, "misses": 0, "afterReset": false });
        if let Some(across) = across {
            seat["sinceAtAcrossBonuses"] = json!(across);
        }
        seat
    };
    let found = ok(&hunt(
        &json!({ "source": { "type": "normalized", "normalized": normalized }, "weights": weights, "play": play, "seats": [seat(None), seat(Some(1500))] })
            .to_string(),
    ));
    let read = |row: &Value, key: &str| row[key].as_f64().expect("a figure");
    assert!(read(&found[1], "games") <= 100.0 + 1e-9);
    assert!(read(&found[1], "byCeiling") > read(&found[0], "byCeiling"));
    spec["components"]
        .as_object_mut()
        .expect("components")
        .remove("restart");
    assert_eq!(
        error(&normalize(&json!({ "spec": spec }).to_string())),
        json!({ "type": "ceiling-across-bonuses-without-restart", "entity": "at" })
    );
}

fn hunted(spec: &Value, seat: &Value) -> String {
    hunt(
        &json!({
            "source": { "type": "spec", "spec": spec },
            "weights": [{ "settingLevel": 1, "probability": 1.0 }],
            "play": { "medalValue": 20, "rentalPrice": 20, "cashShare": 0 },
            "seats": [seat]
        })
        .to_string(),
    )
}

fn seat_at(since_trigger: u32, since_at: u32, more: &Value) -> Value {
    let mut seat = json!({ "sinceTrigger": since_trigger, "sinceAt": since_at, "misses": 0, "afterReset": false });
    for (key, field) in more.as_object().expect("fields") {
        seat[key] = field.clone();
    }
    seat
}

#[test]
fn a_seat_past_a_forced_cz_stands_just_short_of_it_the_cz_coming_on_the_next_game() {
    let mut spec = value(CZ_SPEC);
    spec["components"]["sinceAtCeiling"] = json!({ "cz": 800 });
    let none = json!({});
    ok(&hunted(&spec, &seat_at(10, 850, &none)));
    assert_eq!(
        ok(&hunted(&spec, &seat_at(500, 850, &none))),
        ok(&hunted(&spec, &seat_at(500, 799, &none)))
    );
    spec["components"]["ceilingWins"] = json!(["cz"]);
    for seat in [seat_at(10, 800, &none), seat_at(10, 850, &none)] {
        assert_eq!(
            ok(&hunted(&spec, &seat)),
            ok(&hunted(&spec, &seat_at(10, 799, &none)))
        );
    }
    let path = json!({
        "source": { "type": "spec", "spec": spec },
        "segments": [],
        "path": { "start": seat_at(10, 820, &none), "legs": [] }
    });
    ok(&posterior(&path.to_string()));
    assert_eq!(
        error(&hunted(&spec, &seat_at(600, 500, &none))),
        json!({ "type": "seat-trigger-above-since-at", "sinceTrigger": 600, "sinceAt": 500 })
    );
}

#[test]
fn a_seat_s_field_the_machine_has_no_use_for_is_let_go_of_an_impossible_one_refused_and_one_past_a_side_bonus_s_ceiling_taken_short_of_it()
 {
    let plain = value(CZ_SPEC);
    let bare = ok(&hunted(&plain, &seat_at(100, 100, &json!({}))));
    for more in [
        json!({ "sinceAtAcrossBonuses": 50 }),
        json!({ "sinceSideBonus": 5000 }),
        json!({ "ending": "upper" }),
    ] {
        assert_eq!(ok(&hunted(&plain, &seat_at(100, 100, &more))), bare);
    }
    let mut across = value(CZ_SPEC);
    across["components"]["bonusShare"] = json!({ "cz": [
        { "settingLevel": 1, "value": 5000 },
        { "settingLevel": 6, "value": 5000 }
    ] });
    across["components"]["restart"] = json!(["cz"]);
    across["components"]["ceilingAcrossBonuses"] = json!({ "at": 1600 });
    assert_eq!(
        error(&hunted(
            &across,
            &seat_at(100, 100, &json!({ "sinceAtAcrossBonuses": 50 }))
        )),
        json!({ "type": "seat-across-bonuses-below-since-at", "sinceAt": 100, "sinceAtAcrossBonuses": 50 })
    );
    ok(&hunted(
        &across,
        &seat_at(100, 100, &json!({ "sinceAtAcrossBonuses": 100 })),
    ));
    let mut side = value(CZ_SPEC);
    side["entities"] = json!(["at", "cz", "fran"]);
    side["components"]["sideBonus"] = json!(["fran"]);
    side["components"]["chance"] = json!({ "fran": [
        { "settingLevel": 1, "value": { "type": "ratio", "numerator": 1, "denominatorHundredths": 40_000 } },
        { "settingLevel": 6, "value": { "type": "ratio", "numerator": 1, "denominatorHundredths": 30_000 } }
    ] });
    side["components"]["ceiling"]["fran"] = json!(300);
    side["components"]["payout"]["fran"] = json!(100);
    ok(&hunted(
        &side,
        &seat_at(100, 100, &json!({ "sinceSideBonus": 299 })),
    ));
    for since in [300, 400] {
        assert_eq!(
            ok(&hunted(
                &side,
                &seat_at(100, 100, &json!({ "sinceSideBonus": since }))
            )),
            ok(&hunted(
                &side,
                &seat_at(100, 100, &json!({ "sinceSideBonus": 299 }))
            ))
        );
    }
    let mut unceiled = side.clone();
    unceiled["components"]["ceiling"]
        .as_object_mut()
        .expect("ceilings")
        .remove("fran");
    assert_eq!(
        ok(&hunted(
            &unceiled,
            &seat_at(100, 100, &json!({ "sinceSideBonus": 5000 }))
        )),
        ok(&hunted(&unceiled, &seat_at(100, 100, &json!({}))))
    );
}

#[test]
fn an_allotment_after_an_at_beside_one_after_every_ending_may_be_left_out_or_must_be_their_mix() {
    let mut spec = ended_spec();
    let half = json!([{ "settingLevel": 1, "value": 5000 }, { "settingLevel": 6, "value": 5000 }]);
    spec["components"]["endingAllotment"]["heaven"]["rest"] = half.clone();
    spec["components"]["endingAllotment"]["normal"]["rest"] = half;
    assert_eq!(
        error(&normalize(&json!({ "spec": spec }).to_string())),
        json!({ "type": "allotment-against-endings", "entity": "heaven", "settingLevel": 1, "mix": 3500 })
    );
    spec["components"]
        .as_object_mut()
        .expect("components")
        .remove("allotment");
    let normalized = ok(&normalize(&json!({ "spec": spec }).to_string()));
    assert!(close(
        &normalized["tables"][0]["at"]["allotments"]["afterAt"][0],
        &json!(0.35)
    ));
}

#[test]
fn a_bonus_the_at_ceiling_brings_carries_its_own_medals_through_the_stored_spec() {
    let mut spec = value(CZ_SPEC);
    spec["components"]["payout"]["cz"] = json!(85);
    spec["components"]["bonus"] = json!(["cz"]);
    spec["components"]["ceilingTriggers"] = json!(["at"]);
    spec["components"]["ceilingPayout"] = json!({ "at": 100 });
    let normalized = ok(&normalize(&json!({ "spec": spec }).to_string()));
    assert_eq!(normalized["atRules"]["ceilingPayout"], json!(100.0));
    let stored: NormalizedSpecDto =
        serde_json::from_value(normalized.clone()).expect("a normalised spec");
    assert_eq!(
        serde_json::to_value(&stored).expect("written again"),
        normalized
    );
    let mut plain = spec.clone();
    plain["components"]
        .as_object_mut()
        .expect("components")
        .remove("ceilingPayout");
    let hunted = |source: &Value| {
        ok(&hunt(
            &json!({
                "source": source,
                "weights": [{ "settingLevel": 1, "probability": 1.0 }],
                "play": { "medalValue": 20, "rentalPrice": 20, "cashShare": 0 },
                "seats": [{ "sinceTrigger": 100, "sinceAt": 999, "misses": 0, "afterReset": false }]
            })
            .to_string(),
        ))[0]["triggerMedals"]
            .clone()
    };
    assert!(close(
        &hunted(&json!({ "type": "normalized", "normalized": normalized })),
        &json!(100.0)
    ));
    assert!(close(
        &hunted(&json!({ "type": "spec", "spec": plain })),
        &json!(85.0)
    ));
    spec["components"]
        .as_object_mut()
        .expect("components")
        .remove("ceilingTriggers");
    assert_eq!(
        error(&normalize(&json!({ "spec": spec }).to_string())),
        json!({ "type": "ceiling-payout-without-ceiling-triggers", "entity": "at" })
    );
}

#[test]
fn a_seat_may_say_the_mode_play_is_in_and_stands_short_of_its_ceiling_past_it() {
    let spec = value(MODES_SPEC);
    let said =
        |mode: &str, since: u32| hunted(&spec, &seat_at(since, since, &json!({ "mode": mode })));
    let unsaid = |since: u32| hunted(&spec, &seat_at(since, since, &json!({})));
    assert_eq!(ok(&said("normal", 150)), ok(&unsaid(150)));
    assert_ne!(ok(&said("normal", 50)), ok(&unsaid(50)));
    assert_ne!(ok(&said("heaven", 50)), ok(&unsaid(50)));
    assert_eq!(ok(&said("heaven", 150)), ok(&said("heaven", 99)));
    assert_eq!(
        error(&said("hell", 50)),
        json!({ "type": "unknown-mode", "mode": "hell" })
    );
}

fn metered(full: u32, gains: &[(u32, u32)]) -> Value {
    let mut spec = value(CZ_SPEC);
    spec["components"]
        .as_object_mut()
        .expect("components")
        .remove("misses");
    spec["components"]["meter"] = json!({ "cz": {
        "full": full,
        "gains": gains.iter().map(|(points, share)| json!({
            "points": points,
            "share": [{ "settingLevel": 1, "value": share }, { "settingLevel": 6, "value": share }]
        })).collect::<Vec<_>>()
    } });
    spec
}

fn at_chance(spec: &Value) -> f64 {
    let analysis = ok(&analyze(
        &json!({ "source": { "type": "spec", "spec": spec }, "conditions": measured() })
            .to_string(),
    ));
    analysis["settingLevels"][0]["bonuses"]
        .as_array()
        .and_then(|bonuses| bonuses.last())
        .and_then(|bonus| bonus["chance"].as_f64())
        .expect("the AT's chance")
}

#[test]
fn a_meter_its_misses_fill_makes_the_next_trigger_win_once_full() {
    let wins = |spec: &Value| {
        ok(&normalize(&json!({ "spec": spec }).to_string()))["tables"][0]["at"]["meterWins"].clone()
    };
    assert_eq!(wins(&metered(1, &[(1, 10_000)])), json!([0.0, 1.0]));
    let halves = wins(&metered(2, &[(1, 5_000)]));
    for (index, want) in [0.0, 0.0, 0.25].iter().enumerate() {
        assert!(close(&halves[index], &json!(want)), "{halves}");
    }
    let mut plain = value(CZ_SPEC);
    plain["components"]
        .as_object_mut()
        .expect("components")
        .remove("misses");
    assert!(at_chance(&metered(2, &[(1, 5_000)])) > at_chance(&plain));
    assert!(at_chance(&metered(1, &[(1, 10_000)])) > at_chance(&metered(2, &[(1, 5_000)])));
    ok(&hunted(
        &metered(2, &[(1, 5_000)]),
        &seat_at(50, 300, &json!({ "misses": 2 })),
    ));
    assert_eq!(
        error(&normalize(
            &json!({ "spec": metered(2, &[(1, 6_000), (2, 6_000)]) }).to_string()
        )),
        json!({ "type": "meter-gains-over-whole", "entity": "cz", "settingLevel": 1, "sum": 12000 })
    );
}
