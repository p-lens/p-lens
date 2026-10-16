#![allow(clippy::expect_used, clippy::indexing_slicing, clippy::float_cmp)]

mod support;

use pachislot_domain::conditions::{PayoutBasis, PayoutRate};
use pachislot_domain::normalized::PayoutLaw;
use pachislot_domain::normalized::TriggerPayout;
use pachislot_domain::probability::BasisPoints;
use pachislot_domain::setting_level::PerSettingLevel;
use pachislot_domain::spec::{Component, OtherNet, Spec};
use pachislot_engine::analysis::analyze;
use pachislot_engine::error::{AnalysisError, SpecError};
use pachislot_engine::normalize::normalize;
use pachislot_engine::rate::{RateCycle, TriggersPaid, implied_gain, implied_rate, net_over_all};
use support::{at_spec, close, cz_spec, id, medals, setting_level};

/// 300 regular games losing 1.25 medals each on a bet of 3, then an AT at 4 medals a game.
const CYCLE: RateCycle = RateCycle {
    games: 300.0,
    loss: 1.25,
    bet: 3.0,
    net: 4.0,
    triggers: None,
};

fn rates(low: u32, high: u32) -> PerSettingLevel<PayoutRate> {
    let rate = |points| PayoutRate::from_basis_points(points).expect("a rate");
    PerSettingLevel(vec![
        (setting_level(1), rate(low)),
        (setting_level(6), rate(high)),
    ])
}

/// The made-up AT machine with its 純増 of 4 medals a game.
fn with_net() -> Spec {
    let mut spec = at_spec();
    spec.components.net_per_game.insert(id("at"), medals(4.0));
    spec
}

/// That machine with its AT's medals to follow from a 機械割 of 97.5% and 110%.
fn from_rate() -> Spec {
    let mut spec = with_net();
    spec.components.payout.clear();
    spec.components.rate.insert(id("at"), rates(9_750, 11_000));
    spec
}

#[test]
fn a_rate_is_medals_out_over_medals_in_across_a_cycle() {
    let staked = 3.0 * (300.0 + 480.0 / 4.0);
    assert!(close(
        implied_rate(CYCLE, 480.0),
        (staked - 1.25 * 300.0 + 480.0) / staked
    ));
    assert!(close(implied_rate(CYCLE, 480.0), 1_365.0 / 1_260.0));
}

#[test]
fn the_gain_a_rate_implies_is_the_one_that_brings_it() {
    assert!(close(
        implied_gain(CYCLE, 1_365.0 / 1_260.0).expect("a gain"),
        480.0
    ));
    for gain in [1.0, 150.0, 480.0, 3_000.0] {
        let back = implied_gain(CYCLE, implied_rate(CYCLE, gain)).expect("a gain");
        assert!((back - gain).abs() < 1e-6);
    }
}

#[test]
fn no_gain_brings_a_rate_below_the_base_or_one_an_at_pays_for_itself_at() {
    assert_eq!(implied_gain(CYCLE, 0.58), None);
    assert!(implied_gain(CYCLE, 0.59).is_some());
    assert!(implied_gain(CYCLE, 2.3).is_some());
    assert_eq!(implied_gain(CYCLE, 2.4), None);
}

#[test]
fn an_at_machine_with_its_net_per_game_has_its_rate_from_its_spec() {
    let spec = normalize(&with_net()).expect("a machine");
    let analysis = analyze(&spec, &PayoutBasis::FromSpec).expect("a rate");
    let low = RateCycle {
        games: 500.0,
        loss: 50.0 / 40.0,
        bet: 3.0,
        net: 4.0,
        triggers: None,
    };
    assert!(close(
        analysis.setting_levels[0].payout_rate,
        implied_rate(low, 600.0)
    ));
    assert!(close(
        analysis.setting_levels[1].payout_rate,
        implied_rate(
            RateCycle {
                games: 400.0,
                ..low
            },
            600.0
        )
    ));
    assert_eq!(
        analyze(
            &normalize(&at_spec()).expect("a machine"),
            &PayoutBasis::FromSpec
        ),
        Err(AnalysisError::RateNotFromSpec)
    );
}

#[test]
fn an_at_gains_what_its_published_rate_implies_and_the_rate_comes_back() {
    let spec = normalize(&from_rate()).expect("a machine");
    let gains: Vec<f64> = spec
        .tables
        .iter()
        .map(|table| match table.at.as_ref().map(|at| &at.payout) {
            Some(PayoutLaw::Fixed(gain)) => gain.get(),
            _ => f64::NAN,
        })
        .collect();
    let low = RateCycle {
        games: 500.0,
        loss: 50.0 / 40.0,
        bet: 3.0,
        net: 4.0,
        triggers: None,
    };
    assert!(close(gains[0], implied_gain(low, 0.975).expect("a gain")));
    assert!(close(
        gains[1],
        implied_gain(
            RateCycle {
                games: 400.0,
                ..low
            },
            1.1
        )
        .expect("a gain")
    ));
    let analysis = analyze(&spec, &PayoutBasis::FromSpec).expect("a rate");
    assert!(close(analysis.setting_levels[0].payout_rate, 0.975));
    assert!(close(analysis.setting_levels[1].payout_rate, 1.1));
}

#[test]
fn a_rate_needs_the_net_per_game_and_stands_in_place_of_a_payout() {
    let mut bare = from_rate();
    bare.components.net_per_game.clear();
    assert_eq!(
        normalize(&bare),
        Err(SpecError::MissingComponent {
            entity: id("at"),
            component: Component::NetPerGame
        })
    );
    let mut twice = from_rate();
    twice.components.payout.insert(id("at"), medals(600.0));
    assert_eq!(
        normalize(&twice),
        Err(SpecError::ConflictingComponents {
            entity: id("at"),
            first: Component::Payout,
            second: Component::Rate
        })
    );
    let mut still = from_rate();
    still.components.net_per_game.insert(id("at"), medals(0.0));
    assert_eq!(
        normalize(&still),
        Err(SpecError::EmptyNetPerGame { entity: id("at") })
    );
}

#[test]
fn a_rate_is_given_for_every_setting_level_and_is_one_an_at_could_bring() {
    let mut short = from_rate();
    short.components.rate.insert(
        id("at"),
        PerSettingLevel(vec![(
            setting_level(1),
            PayoutRate::from_basis_points(9_750).expect("a rate"),
        )]),
    );
    assert_eq!(
        normalize(&short),
        Err(SpecError::MissingSettingLevel {
            at: id("at"),
            setting_level: setting_level(6)
        })
    );
    let mut low = from_rate();
    low.components.rate.insert(id("at"), rates(5_000, 11_000));
    assert_eq!(
        normalize(&low),
        Err(SpecError::UnattainableRate {
            entity: id("at"),
            setting_level: setting_level(1)
        })
    );
}

/// A share of an AT's medals, in hundredths of a percent, won at `net` a game.
fn other_net(net: f64, points: u32) -> OtherNet {
    OtherNet {
        net: medals(net),
        share: BasisPoints::new(points).expect("a share"),
    }
}

#[test]
fn a_net_over_all_takes_as_many_games_for_the_same_medals() {
    assert!(close(net_over_all(4.0, &[]).expect("a net"), 4.0));
    let over_all = net_over_all(2.0, &[(8.0, 0.5)]).expect("a net");
    assert!(close(over_all, 1.0 / (0.5 / 2.0 + 0.5 / 8.0)));
    assert!(close(600.0 / over_all, 300.0 / 2.0 + 300.0 / 8.0));
    assert!(close(net_over_all(2.0, &[(8.0, 1.0)]).expect("a net"), 8.0));
    assert_eq!(net_over_all(2.0, &[(8.0, 0.6), (5.0, 0.5)]), None);
}

#[test]
fn an_at_with_medals_won_at_another_net_is_one_at_its_net_over_all() {
    let mut shared = from_rate();
    shared.components.net_per_game.insert(id("at"), medals(2.0));
    shared
        .components
        .other_net
        .insert(id("at"), vec![other_net(8.0, 5_000)]);
    let mut single = from_rate();
    single.components.net_per_game.insert(id("at"), medals(3.2));
    let shared = normalize(&shared).expect("a machine");
    let single = normalize(&single).expect("a machine");
    assert_eq!(shared.at_rules, single.at_rules);
    assert_eq!(shared.tables, single.tables);
}

#[test]
fn other_nets_need_the_at_s_own_and_shares_within_the_whole() {
    let mut alone = from_rate();
    alone.components.net_per_game.clear();
    alone
        .components
        .other_net
        .insert(id("at"), vec![other_net(8.0, 5_000)]);
    assert_eq!(
        normalize(&alone),
        Err(SpecError::MissingComponent {
            entity: id("at"),
            component: Component::NetPerGame
        })
    );
    let mut beyond = from_rate();
    beyond
        .components
        .other_net
        .insert(id("at"), vec![other_net(8.0, 6_000), other_net(5.0, 5_000)]);
    assert_eq!(
        normalize(&beyond),
        Err(SpecError::OtherNetBeyondWhole {
            entity: id("at"),
            sum: 11_000
        })
    );
    let mut nothing = from_rate();
    nothing
        .components
        .other_net
        .insert(id("at"), vec![other_net(0.0, 5_000)]);
    assert_eq!(
        normalize(&nothing),
        Err(SpecError::EmptyNetPerGame { entity: id("at") })
    );
}

/// The cycle with two and a half bonuses that are its triggers, each
/// gaining 100 medals at 5 a game.
fn with_bonuses(net: Option<f64>) -> RateCycle {
    RateCycle {
        triggers: Some(TriggersPaid {
            count: 2.5,
            payout: TriggerPayout {
                medals: medals(100.0),
                net_per_game: net.map(medals),
            },
        }),
        ..CYCLE
    }
}

#[test]
fn a_bonus_trigger_s_medals_and_games_go_into_the_rate_and_out_of_the_at_s_gain() {
    let paid = with_bonuses(Some(5.0));
    let staked = 3.0 * (300.0 + 2.5 * 20.0 + 600.0 / 4.0);
    assert!(close(
        implied_rate(paid, 600.0),
        (staked - 1.25 * 300.0 + 600.0 + 250.0) / staked
    ));
    assert!(close(
        implied_gain(paid, implied_rate(paid, 600.0)).expect("a gain"),
        600.0
    ));
    let uncounted = with_bonuses(None);
    assert!(close(
        implied_gain(uncounted, implied_rate(uncounted, 600.0)).expect("a gain"),
        600.0
    ));
    assert!(implied_gain(paid, 1.0).expect("a gain") < implied_gain(CYCLE, 1.0).expect("a gain"));
}

/// The made-up CZ machine whose CZ is a bonus gaining 100 medals at 5 a
/// game, its AT's medals to follow from a 機械割 of 97.5% and 110% at 4 a game.
fn bonus_triggered() -> Spec {
    let mut spec = cz_spec();
    spec.components.payout.remove(&id("at"));
    spec.components.net_per_game.insert(id("at"), medals(4.0));
    spec.components.rate.insert(id("at"), rates(9_750, 11_000));
    spec.components.payout.insert(id("cz"), medals(100.0));
    spec.components.net_per_game.insert(id("cz"), medals(5.0));
    spec
}

#[test]
fn a_bonus_trigger_s_machine_comes_back_to_its_rate_with_its_at_gaining_less() {
    let normalized = normalize(&bonus_triggered()).expect("normalises");
    let rules = normalized.at_rules.as_ref().expect("an AT machine");
    assert_eq!(
        rules.trigger_payout,
        Some(TriggerPayout {
            medals: medals(100.0),
            net_per_game: Some(medals(5.0))
        })
    );
    let analysis = analyze(&normalized, &PayoutBasis::FromSpec).expect("solves");
    assert!(close(analysis.setting_levels[0].payout_rate, 0.975));
    assert!(close(analysis.setting_levels[1].payout_rate, 1.1));
    let mut unpaid = bonus_triggered();
    unpaid.components.payout.remove(&id("cz"));
    unpaid.components.net_per_game.remove(&id("cz"));
    let plain = analyze(
        &normalize(&unpaid).expect("normalises"),
        &PayoutBasis::FromSpec,
    )
    .expect("solves");
    let gain = |analysis: &pachislot_engine::analysis::Analysis| {
        analysis.setting_levels[1].at.expect("an AT").gain
    };
    assert!(gain(&analysis) < gain(&plain));
}

#[test]
fn a_cz_s_net_needs_medals_to_be_won_over() {
    let mut bare = bonus_triggered();
    bare.components.payout.remove(&id("cz"));
    assert_eq!(
        normalize(&bare),
        Err(SpecError::MissingComponent {
            entity: id("cz"),
            component: Component::Payout
        })
    );
}
