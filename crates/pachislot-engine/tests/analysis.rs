#![allow(clippy::expect_used, clippy::indexing_slicing)]

mod support;

use pachislot_domain::conditions::{PayoutBasis, PayoutRate};
use pachislot_domain::setting_level::PerSettingLevel;
use pachislot_engine::analysis::analyze;
use pachislot_engine::error::AnalysisError;
use pachislot_engine::normalize::normalize;
use support::{close, id, made_up_spec, setting_level};

#[test]
fn a_payout_rate_is_what_every_outcome_pays_over_the_bet() {
    let spec = normalize(&made_up_spec()).expect("normalises");
    let analysis = analyze(&spec, &PayoutBasis::FromSpec).expect("solves");
    let low = &analysis.setting_levels[0];
    // 0.004×237 + 0.0025×93 + 0.16×5 + 0.025×(−1) + 0.137×0 − 0.6715×3
    let net = 0.948 + 0.2325 + 0.8 - 0.025 - 2.0145;
    assert!(close(low.net_per_game, net));
    assert!(close(low.payout_rate, 1.0 + net / 3.0));
    assert!(close(low.combined, 0.004 + 0.0025));
    let high = &analysis.setting_levels[1];
    // 0.005×237 + 0.004×93 + 0.17×5 + 0.025×(−1) − 0.659×3
    let high_net = 1.185 + 0.372 + 0.85 - 0.025 - 1.977;
    assert!(close(high.net_per_game, high_net));
}

#[test]
fn a_split_bonus_is_reported_as_the_sum_of_its_parts() {
    let spec = normalize(&made_up_spec()).expect("normalises");
    let analysis = analyze(&spec, &PayoutBasis::FromSpec).expect("solves");
    let reg = analysis.setting_levels[1]
        .bonuses
        .iter()
        .find(|bonus| bonus.id == id("reg"))
        .expect("the REG");
    assert!(close(reg.chance, 0.004));
}

#[test]
fn the_derivation_adds_up_to_the_net_and_to_certainty() {
    let spec = normalize(&made_up_spec()).expect("normalises");
    let analysis = analyze(&spec, &PayoutBasis::FromSpec).expect("solves");
    analysis.setting_levels.iter().for_each(|figures| {
        let medals: f64 = figures
            .derivation
            .iter()
            .map(|each| each.medals_per_game)
            .sum();
        let chance: f64 = figures.derivation.iter().map(|each| each.chance).sum();
        assert!(close(medals, figures.net_per_game));
        assert!(close(chance, 1.0));
    });
}

#[test]
fn a_measured_rate_replaces_the_spec_and_needs_no_payouts() {
    let unpaid = {
        let mut spec = made_up_spec();
        spec.components
            .payout
            .retain(|entity, _| !spec.components.bonus.contains(entity));
        normalize(&spec).expect("normalises")
    };
    assert_eq!(
        analyze(&unpaid, &PayoutBasis::FromSpec),
        Err(AnalysisError::MissingPayout { at: id("big") })
    );
    let rates = PerSettingLevel(vec![
        (
            setting_level(1),
            PayoutRate::from_basis_points(9_700).expect("a rate"),
        ),
        (
            setting_level(6),
            PayoutRate::from_basis_points(10_940).expect("a rate"),
        ),
    ]);
    let analysis = analyze(&unpaid, &PayoutBasis::Measured(rates)).expect("solves");
    assert!(close(analysis.setting_levels[1].payout_rate, 1.094));
    assert!(close(analysis.setting_levels[1].net_per_game, 3.0 * 0.094));
    assert_eq!(analysis.setting_levels[1].derivation, Vec::new());
}

#[test]
fn a_measured_rate_must_cover_exactly_the_machines_settings() {
    let spec = normalize(&made_up_spec()).expect("normalises");
    let one = PerSettingLevel(vec![(
        setting_level(1),
        PayoutRate::from_basis_points(9_700).expect("a rate"),
    )]);
    assert_eq!(
        analyze(&spec, &PayoutBasis::Measured(one)),
        Err(AnalysisError::MissingRate {
            setting_level: setting_level(6)
        })
    );
    let stray = PerSettingLevel(vec![
        (
            setting_level(1),
            PayoutRate::from_basis_points(9_700).expect("a rate"),
        ),
        (
            setting_level(6),
            PayoutRate::from_basis_points(10_900).expect("a rate"),
        ),
        (
            setting_level(3),
            PayoutRate::from_basis_points(10_000).expect("a rate"),
        ),
    ]);
    assert_eq!(
        analyze(&spec, &PayoutBasis::Measured(stray)),
        Err(AnalysisError::UnknownRate {
            setting_level: setting_level(3)
        })
    );
}

#[test]
fn a_whole_bonus_and_its_parts_give_the_same_rate() {
    let whole = {
        let mut spec = made_up_spec();
        spec.entities
            .retain(|entity| !spec.components.part_of.contains_key(entity));
        spec.components.part_of.clear();
        spec.components
            .chance
            .retain(|entity, _| entity.as_str() != "reg-solo" && entity.as_str() != "reg-cherry");
        spec.components
            .label
            .retain(|entity, _| entity.as_str() != "reg-solo" && entity.as_str() != "reg-cherry");
        spec.components.chance.insert(
            id("reg"),
            support::per(support::percent(25), support::percent(40)),
        );
        normalize(&spec).expect("normalises")
    };
    let split = normalize(&made_up_spec()).expect("normalises");
    let rate = |spec| {
        analyze(spec, &PayoutBasis::FromSpec)
            .expect("solves")
            .setting_levels[1]
            .payout_rate
    };
    assert!(close(rate(&whole), rate(&split)));
}
