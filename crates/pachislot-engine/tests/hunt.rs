#![allow(clippy::expect_used)]

mod support;

use std::num::NonZeroU32;

use pachislot_domain::conditions::PlayConditions;
use pachislot_domain::normalized::AtTable;
use pachislot_domain::normalized::{AtRules, ModeRule, TriggerPayout};
use pachislot_domain::observation::PathStart;
use pachislot_domain::probability::Probability;
use pachislot_engine::at::cycle;
use pachislot_engine::hunt::hunt;
use pachislot_engine::normalize::normalize;
use pachislot_engine::theoretical::hunt_theoretical_value;
use support::{
    LOSS, PAYOUT, ceiled, cz_spec, medals, mode, rules, setting_level, start, table, through,
};

fn near(left: f64, right: f64) -> bool {
    (left - right).abs() <= 1e-9 * right.abs().max(1.0)
}

#[test]
fn an_at_won_directly_without_a_ceiling_comes_one_over_its_chance_games_on() {
    let p = 1.0 / 300.0;
    let found = hunt(
        start(0, 0, 0),
        &rules(None, vec![mode("at", 0)]),
        &table(p, 1.0, vec![1.0], vec![1.0]),
    )
    .expect("comes");
    assert!(near(found.games, 300.0));
    assert!(near(found.at_medals, PAYOUT));
    assert!(near(found.medals, PAYOUT - LOSS * 300.0));
    assert!(near(found.by_ceiling, 0.0));
}

#[test]
fn an_at_won_directly_under_a_ceiling_comes_by_it_as_often_as_play_lasts_to_it() {
    let p = 1.0 / 300.0;
    let ceiling = rules(None, vec![mode("at", 400)]);
    let odds = table(p, 1.0, vec![1.0], vec![1.0]);
    let found = hunt(start(0, 0, 0), &ceiling, &odds).expect("comes");
    assert!(near(found.games, -(400.0 * (-p).ln_1p()).exp_m1() / p));
    assert!(near(found.by_ceiling, (399.0 * (-p).ln_1p()).exp()));
    let last = hunt(start(399, 399, 0), &ceiling, &odds).expect("comes");
    assert!(near(last.games, 1.0));
    assert!(near(last.by_ceiling, 1.0));
    assert!(near(last.medals, PAYOUT - LOSS));
}

#[test]
fn from_just_after_an_at_it_is_the_cycle() {
    let (p, q) = (0.01, 0.3);
    for (modes, misses) in [
        (vec![ceiled("cz", 150, 600)], NonZeroU32::new(3)),
        (vec![mode("cz", 150)], NonZeroU32::new(3)),
        (vec![ceiled("cz", 0, 600)], None),
    ] {
        let machine = rules(Some("cz"), through(modes, misses));
        let found =
            hunt(start(0, 0, 0), &machine, &table(p, q, vec![1.0], vec![1.0])).expect("comes");
        let whole = cycle(&machine, p, q, 0.0, &[1.0]);
        assert!(
            near(found.games, whole.games),
            "{} against {}",
            found.games,
            whole.games
        );
        assert!(near(found.medals, PAYOUT - LOSS * whole.games));
    }
}

#[test]
fn a_setting_change_s_shorter_at_ceiling_holds_for_a_seat_after_one() {
    let (p, q) = (0.01, 0.3);
    let machine = rules(
        Some("cz"),
        vec![ceiled("cz", 0, 600), ceiled("cz:reset", 0, 200)],
    );
    let odds = table(p, q, vec![1.0, 0.0], vec![0.0, 1.0]);
    let reset = PathStart {
        after_reset: true,
        ..start(150, 150, 0)
    };
    let shortened = hunt(reset, &machine, &odds).expect("comes");
    let usual = hunt(start(150, 150, 0), &machine, &odds).expect("comes");
    assert!(shortened.games <= 50.0 + 1e-9);
    assert!(shortened.by_ceiling > usual.by_ceiling);
    assert!(shortened.medals > usual.medals);
}

#[test]
fn a_cz_missed_to_the_through_ceiling_wins_on_the_next() {
    let (p, q) = (0.01, 0.3);
    let machine = rules(Some("cz"), through(vec![mode("cz", 0)], NonZeroU32::new(3)));
    let found = hunt(
        start(0, 100, 3),
        &machine,
        &table(p, q, vec![1.0], vec![1.0]),
    )
    .expect("comes");
    assert!(near(found.games, 1.0 / p));
    assert!(near(found.by_ceiling, 1.0));
}

#[test]
fn an_at_that_can_never_come_is_none() {
    assert_eq!(
        hunt(
            start(0, 0, 0),
            &rules(None, vec![mode("at", 0)]),
            &table(0.0, 1.0, vec![1.0], vec![1.0])
        ),
        None
    );
}

#[test]
fn a_seat_is_worth_each_setting_s_hunt_by_how_likely_it_is_in_yen_less_the_rental_spread() {
    let spec = normalize(&cz_spec()).expect("normalises");
    let machine = spec.at_rules.clone().expect("an AT machine");
    let play = PlayConditions::new(20.0, 25.0, Probability::new(1.0).expect("a share"), None)
        .expect("terms");
    let weights = [(setting_level(1), 0.25), (setting_level(6), 0.75)];
    let seat = start(50, 300, 1);
    let found = hunt_theoretical_value(&spec, &machine, &weights, play, seat).expect("comes");
    let under = |setting: u8| {
        let table = spec
            .table(setting_level(setting))
            .and_then(|table| table.at.as_ref())
            .expect("an AT table");
        hunt(seat, &machine, table).expect("comes")
    };
    let (low, high) = (under(1), under(6));
    assert!(near(found.games, 0.25 * low.games + 0.75 * high.games));
    assert!(near(found.medals, 0.25 * low.medals + 0.75 * high.medals));
    assert!(near(
        found.by_ceiling,
        0.25 * low.by_ceiling + 0.75 * high.by_ceiling
    ));
    assert!(near(
        found.yen,
        found.medals * 20.0 - found.games * 3.0 * 5.0
    ));
}

#[test]
fn a_bonus_that_is_the_trigger_pays_each_time_it_comes_until_one_wins_the_at() {
    let (p, q) = (0.01, 0.25);
    let machine = AtRules {
        trigger_payout: Some(TriggerPayout {
            medals: medals(100.0),
            net_per_game: None,
        }),
        ..rules(Some("cz"), vec![mode("cz", 0)])
    };
    let found = hunt(start(0, 0, 0), &machine, &table(p, q, vec![1.0], vec![1.0])).expect("comes");
    assert!(near(found.games, 1.0 / (p * q)));
    assert!(near(found.trigger_medals, 100.0 / q));
    assert!(near(found.medals, PAYOUT + 100.0 / q - LOSS / (p * q)));
}

#[test]
fn an_at_won_on_its_at_ceiling_brings_no_bonus() {
    let machine = AtRules {
        trigger_payout: Some(TriggerPayout {
            medals: medals(100.0),
            net_per_game: None,
        }),
        ..rules(Some("cz"), vec![ceiled("cz", 0, 600)])
    };
    let found = hunt(
        start(0, 599, 0),
        &machine,
        &table(0.01, 0.25, vec![1.0], vec![1.0]),
    )
    .expect("comes");
    assert!(near(found.trigger_medals, 0.0));
    assert!(near(found.by_ceiling, 1.0));
}

#[test]
fn misses_past_a_mode_s_through_ceiling_rule_it_out_where_play_is_seen() {
    let (p, q) = (0.01, 0.3);
    let limited = |misses: u32| ModeRule {
        misses: NonZeroU32::new(misses),
        ..mode("cz", 0)
    };
    let both = rules(Some("cz"), vec![limited(2), limited(4)]);
    let odds = table(p, q, vec![0.5, 0.5], vec![0.5, 0.5]);
    let seen = hunt(start(0, 100, 3), &both, &odds).expect("comes");
    let deeper = hunt(
        start(0, 100, 3),
        &rules(Some("cz"), vec![limited(4)]),
        &table(p, q, vec![1.0], vec![1.0]),
    )
    .expect("comes");
    assert!(near(seen.games, deeper.games));
    assert!(near(seen.medals, deeper.medals));
}

#[test]
fn a_trigger_forced_once_on_a_game_counted_from_the_at_is_the_cycle_from_just_after_one() {
    let (p, q) = (0.004, 0.4);
    for misses in [None, NonZeroU32::new(2)] {
        let forced = ModeRule {
            since_at_ceiling: NonZeroU32::new(300),
            misses,
            ..ceiled("cz", 0, 700)
        };
        let machine = rules(Some("cz"), vec![forced]);
        let found =
            hunt(start(0, 0, 0), &machine, &table(p, q, vec![1.0], vec![1.0])).expect("comes");
        let whole = cycle(&machine, p, q, 0.0, &[1.0]);
        assert!(
            near(found.games, whole.games),
            "{} against {}",
            found.games,
            whole.games
        );
        let unforced = cycle(
            &rules(
                Some("cz"),
                vec![ModeRule {
                    misses,
                    ..ceiled("cz", 0, 700)
                }],
            ),
            p,
            q,
            0.0,
            &[1.0],
        );
        assert!(whole.games < unforced.games);
        assert!(whole.triggers > unforced.triggers);
    }
}

#[test]
fn a_seat_past_the_ceiling_counted_from_the_at_with_no_trigger_since_rules_its_mode_out() {
    let (p, q) = (0.004, 0.4);
    let forced = ModeRule {
        since_at_ceiling: NonZeroU32::new(300),
        ..ceiled("cz", 0, 700)
    };
    let both = rules(Some("cz"), vec![forced, ceiled("free", 0, 700)]);
    let seen = hunt(
        start(350, 350, 0),
        &both,
        &table(p, q, vec![0.5, 0.5], vec![0.5, 0.5]),
    )
    .expect("comes");
    let free = hunt(
        start(350, 350, 0),
        &rules(Some("cz"), vec![ceiled("free", 0, 700)]),
        &table(p, q, vec![1.0], vec![1.0]),
    )
    .expect("comes");
    assert!(near(seen.games, free.games));
}

#[test]
fn an_at_won_outright_beside_the_cz_is_the_cycle_from_just_after_one() {
    let (p, q, d) = (0.01, 0.3, 0.002);
    for modes in [vec![ceiled("cz", 150, 600)], vec![mode("cz", 150)]] {
        let machine = rules(Some("cz"), through(modes, NonZeroU32::new(3)));
        let odds = AtTable {
            direct: Probability::new(d).expect("a chance"),
            ..table(p, q, vec![1.0], vec![1.0])
        };
        let found = hunt(start(0, 0, 0), &machine, &odds).expect("comes");
        let whole = cycle(&machine, p, q, d, &[1.0]);
        assert!(
            near(found.games, whole.games),
            "{} against {}",
            found.games,
            whole.games
        );
    }
}
