#![allow(clippy::expect_used, clippy::indexing_slicing)]

mod support;

use pachislot_domain::conditions::{PayoutBasis, PlayConditions};
use pachislot_domain::probability::Probability;
use pachislot_engine::analysis::analyze;
use pachislot_engine::normalize::normalize;
use pachislot_engine::theoretical::theoretical_value;
use support::{close, made_up_spec, setting_level};

fn play(medal_value: f64, cash_share: f64) -> PlayConditions {
    PlayConditions::new(
        medal_value,
        20.0,
        Probability::new(cash_share).expect("a share"),
        Some(800.0),
    )
    .expect("conditions")
}

#[test]
fn at_even_exchange_the_yen_is_the_medals_at_twenty() {
    let spec = normalize(&made_up_spec()).expect("normalises");
    let analysis = analyze(&spec, &PayoutBasis::FromSpec).expect("solves");
    let high = analysis.setting_levels[1].net_per_game;
    let found = theoretical_value(
        &analysis,
        3,
        &[(setting_level(6), 1.0)],
        play(20.0, 1.0),
        4_000,
    );
    assert!(close(found.medals, 4_000.0 * high));
    assert!(close(found.yen, 4_000.0 * high * 20.0));
    assert!(close(
        found.yen_per_hour.expect("an hourly figure"),
        800.0 * high * 20.0
    ));
}

#[test]
fn settings_are_weighed_by_how_likely_they_are() {
    let spec = normalize(&made_up_spec()).expect("normalises");
    let analysis = analyze(&spec, &PayoutBasis::FromSpec).expect("solves");
    let (low, high) = (
        analysis.setting_levels[0].clone(),
        analysis.setting_levels[1].clone(),
    );
    let found = theoretical_value(
        &analysis,
        3,
        &[(setting_level(1), 0.25), (setting_level(6), 0.75)],
        play(20.0, 1.0),
        1_000,
    );
    assert!(close(
        found.payout_rate,
        0.25 * low.payout_rate + 0.75 * high.payout_rate
    ));
    assert!(close(
        found.net_per_game,
        0.25 * low.net_per_game + 0.75 * high.net_per_game
    ));
}

#[test]
fn renting_for_cash_at_a_lower_exchange_costs_the_spread_on_what_was_rented() {
    let spec = normalize(&made_up_spec()).expect("normalises");
    let analysis = analyze(&spec, &PayoutBasis::FromSpec).expect("solves");
    let medal_value = 1_000.0 / 56.0;
    let held = theoretical_value(
        &analysis,
        3,
        &[(setting_level(6), 1.0)],
        play(medal_value, 0.0),
        1_000,
    );
    let rented = theoretical_value(
        &analysis,
        3,
        &[(setting_level(6), 1.0)],
        play(medal_value, 0.5),
        1_000,
    );
    assert!(close(held.yen, held.medals * medal_value));
    assert!(close(
        held.yen - rented.yen,
        1_000.0 * 3.0 * 0.5 * (20.0 - medal_value)
    ));
}
