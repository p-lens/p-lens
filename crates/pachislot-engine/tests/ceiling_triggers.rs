#![allow(clippy::expect_used, clippy::indexing_slicing, clippy::float_cmp)]

mod support;

use std::num::NonZeroU32;

use pachislot_domain::conditions::PayoutBasis;
use pachislot_domain::normalized::{AtRules, AtTable, CeilingAt, TriggerPayout};
use pachislot_domain::probability::Probability;
use pachislot_domain::spec::{Component, Spec};
use pachislot_engine::analysis::analyze;
use pachislot_engine::at::{Cycle, Odds, cycle};
use pachislot_engine::error::SpecError;
use pachislot_engine::hunt::hunt;
use pachislot_engine::normalize::normalize;
use support::{at_spec, ceiled, cz_spec, id, medals, odds, rules, shares, start, table};

fn near(left: f64, right: f64) -> bool {
    (left - right).abs() <= 1e-9 * left.abs().max(right.abs()).max(1.0)
}

const P: f64 = 0.01;
const Q: f64 = 0.3;
const AT_CEILING: u32 = 500;
const BONUS: f64 = 100.0;

/// A CZ at `P` a game without a ceiling of its own, winning the AT at `Q`,
/// and an AT間天井 of `AT_CEILING` games that wins it — outright, or by a
/// CZ it brings.
fn machine(ceiling_at: CeilingAt) -> AtRules {
    AtRules {
        ceiling_at,
        ..rules(Some("cz"), vec![ceiled("cz", 0, AT_CEILING)])
    }
}

/// The same with the CZ a bonus paying `BONUS` medals each time it comes.
fn paying(ceiling_at: CeilingAt) -> AtRules {
    AtRules {
        trigger_is_bonus: true,
        trigger_payout: Some(TriggerPayout {
            medals: medals(BONUS),
            net_per_game: None,
        }),
        ..machine(ceiling_at)
    }
}

/// Every mode winning at `Q` as its own rate: walked as a chain, to the same figures.
fn own() -> Vec<Probability> {
    vec![Probability::new(Q).expect("a rate")]
}

fn chained<'a>(odds: Odds<'a>, own: &'a [Probability]) -> Odds<'a> {
    Odds {
        successes: own,
        ..odds
    }
}

/// The cycle in closed form: a game going on without the AT at `1 − P·Q`,
/// the CZs by chance those of the `N − 1` games before the AT間天井, and
/// what is left of play on it.
fn closed() -> (f64, f64, f64) {
    let going = 1.0 - P * Q;
    let left = going.powi(i32::try_from(AT_CEILING - 1).expect("a count"));
    let brought = (1.0 - left) / Q;
    let games = (1.0 - going.powi(i32::try_from(AT_CEILING).expect("a count"))) / (P * Q);
    (brought, left, games)
}

fn assert_cycle(found: Cycle, triggers: f64, games: f64, ceiled: f64) {
    assert!(
        near(found.triggers, triggers),
        "{} against {triggers}",
        found.triggers
    );
    assert!(near(found.games, games), "{} against {games}", found.games);
    assert!(
        near(found.ceiled, ceiled),
        "{} against {ceiled}",
        found.ceiled
    );
}

#[test]
fn an_at_ceiling_that_brings_the_trigger_counts_it_among_the_cycle_s() {
    let (brought, left, games) = closed();
    let own = own();
    for each in [odds(P, Q, 0.0), chained(odds(P, Q, 0.0), &own)] {
        assert_cycle(
            cycle(&machine(CeilingAt::Outright), each, &[1.0]),
            brought,
            games,
            0.0,
        );
        let triggered = cycle(&machine(CeilingAt::Triggered), each, &[1.0]);
        assert_cycle(triggered, brought + left, games, left);
        assert!(near(triggered.trigger_chance(), (brought + left) / games));
        assert!(near(triggered.at_chance(), 1.0 / games));
    }
}

/// The CZ machine with an AT間天井 of `AT_CEILING` games in place of the
/// CZ's ceilings.
fn ceiled_spec(triggered: bool) -> Spec {
    let mut spec = cz_spec();
    spec.components.ceiling.clear();
    spec.components.reset_ceiling.clear();
    spec.components
        .ceiling
        .insert(id("at"), NonZeroU32::new(AT_CEILING).expect("a ceiling"));
    if triggered {
        spec.components.ceiling_triggers.insert(id("at"));
    }
    spec
}

fn solved(spec: &Spec) -> (AtRules, Vec<AtTable>) {
    let normalized = normalize(spec).expect("normalises");
    let rules = normalized.at_rules.expect("an AT machine");
    let tables = normalized
        .tables
        .into_iter()
        .map(|table| table.at.expect("an AT table"))
        .collect();
    (rules, tables)
}

#[test]
fn the_published_combined_odds_are_read_back_with_the_ceiling_s_triggers_in_them() {
    let (outright, outright_tables) = solved(&ceiled_spec(false));
    let (triggered, triggered_tables) = solved(&ceiled_spec(true));
    assert_eq!(outright.ceiling_at, CeilingAt::Outright);
    assert_eq!(triggered.ceiling_at, CeilingAt::Triggered);
    for ((published, before), after) in [1.0 / 150.0, 1.0 / 120.0]
        .into_iter()
        .zip(&outright_tables)
        .zip(&triggered_tables)
    {
        let found = cycle(&triggered, Odds::of(after), &after.allotments.after_at);
        assert!(near(found.trigger_chance(), published));
        let going = 1.0 - after.chance.value() * after.success.value();
        let left = going.powi(i32::try_from(AT_CEILING - 1).expect("a count"));
        let games = (1.0 - going * left) / (after.chance.value() * after.success.value());
        assert!(near(
            ((1.0 - left) / after.success.value() + left) / games,
            published
        ));
        assert!(after.chance.value() < before.chance.value());
        let unchanged = cycle(&outright, Odds::of(before), &before.allotments.after_at);
        assert!(near(unchanged.trigger_chance(), published));
        assert!(near(unchanged.ceiled, 0.0));
    }
}

#[test]
fn a_bonus_the_at_ceiling_brings_pays_its_medals_in_full() {
    let (brought, left, games) = closed();
    for (chain, paid) in [(false, 1.0), (true, 1.0), (false, 0.5), (true, 0.5)] {
        let seat = AtTable {
            paid: Probability::new(paid).expect("a share"),
            successes: if chain { own() } else { Vec::new() },
            ..table(P, Q, vec![1.0], vec![1.0])
        };
        let outright = hunt(start(0, 0, 0), &paying(CeilingAt::Outright), &seat).expect("comes");
        let triggered = hunt(start(0, 0, 0), &paying(CeilingAt::Triggered), &seat).expect("comes");
        assert!(near(outright.games, games));
        assert!(near(triggered.games, games));
        assert!(near(outright.trigger_medals, brought * paid * BONUS));
        assert!(near(
            triggered.trigger_medals,
            (brought * paid + left) * BONUS
        ));
        assert!(near(triggered.medals - outright.medals, left * BONUS));
        assert!(near(triggered.by_ceiling, outright.by_ceiling));
    }
}

#[test]
fn a_seat_on_the_game_before_the_at_ceiling_takes_its_bonus_with_the_at() {
    for chain in [false, true] {
        let seat = AtTable {
            successes: if chain { own() } else { Vec::new() },
            ..table(P, Q, vec![1.0], vec![1.0])
        };
        let near_ceiling = start(200, AT_CEILING - 1, 0);
        let outright = hunt(near_ceiling, &paying(CeilingAt::Outright), &seat).expect("comes");
        let triggered = hunt(near_ceiling, &paying(CeilingAt::Triggered), &seat).expect("comes");
        assert!(near(triggered.games, 1.0));
        assert!(near(triggered.by_ceiling, 1.0));
        assert!(near(outright.trigger_medals, 0.0));
        assert!(near(triggered.trigger_medals, BONUS));
        assert!(near(triggered.medals - outright.medals, BONUS));
    }
}

#[test]
fn an_at_ceiling_brings_the_trigger_only_where_a_cz_brings_the_at_and_there_is_one() {
    let mut direct = at_spec();
    direct.components.ceiling_triggers.insert(id("at"));
    assert_eq!(
        normalize(&direct).map(|_| ()),
        Err(SpecError::CeilingTriggersWithoutCz { entity: id("at") })
    );
    let mut unceiled = cz_spec();
    unceiled.components.ceiling_triggers.insert(id("at"));
    assert_eq!(
        normalize(&unceiled).map(|_| ()),
        Err(SpecError::MissingComponent {
            entity: id("at"),
            component: Component::Ceiling,
        })
    );
    let mut on_the_cz = ceiled_spec(false);
    on_the_cz.components.ceiling_triggers.insert(id("cz"));
    assert_eq!(
        normalize(&on_the_cz).map(|_| ()),
        Err(SpecError::MissingComponent {
            entity: id("cz"),
            component: Component::At,
        })
    );
}

/// The ceiled CZ machine with its CZ's success bringing a bonus of
/// `BONUS` medals that wins the AT half the time, the AT gaining 600
/// medals at 4 a game.
fn staged(triggered: bool) -> Spec {
    let mut spec = ceiled_spec(triggered);
    spec.components.net_per_game.insert(id("at"), medals(4.0));
    spec.components.payout.insert(id("cz"), medals(BONUS));
    spec.components
        .bonus_share
        .insert(id("cz"), shares(5_000, 5_000));
    spec
}

#[test]
fn the_rate_from_the_spec_pays_a_bonus_the_at_ceiling_brings_in_full() {
    let normalized = normalize(&staged(true)).expect("normalises");
    let analysis = analyze(&normalized, &PayoutBasis::FromSpec).expect("a rate");
    let rules = normalized.at_rules.as_ref().expect("an AT machine");
    for (figures, table) in analysis.setting_levels.iter().zip(&normalized.tables) {
        let at = figures.at.expect("an AT's figures");
        let games = 1.0 / figures.bonuses[1].chance;
        let triggers = figures.bonuses[0].chance * games;
        let paid = table.at.as_ref().expect("an AT table").paid.value();
        assert!(at.ceiling_triggers > 0.0);
        let bonuses = (triggers - at.ceiling_triggers) * paid + at.ceiling_triggers;
        let staked = 3.0 * (games + at.gain / 4.0);
        let rate =
            (staked - rules.base.loss_per_game() * games + at.gain + bonuses * BONUS) / staked;
        assert!(
            near(figures.payout_rate, rate),
            "{} against {rate}",
            figures.payout_rate
        );
    }
    let outright = normalize(&staged(false)).expect("normalises");
    let unceiled = analyze(&outright, &PayoutBasis::FromSpec).expect("a rate");
    assert!(
        unceiled
            .setting_levels
            .iter()
            .all(|figures| figures.at.is_some_and(|at| at.ceiling_triggers == 0.0))
    );
}
