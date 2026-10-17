#![allow(clippy::expect_used, clippy::indexing_slicing, clippy::float_cmp)]

mod support;

use pachislot_domain::conditions::PayoutBasis;
use pachislot_domain::normalized::{AtRules, AtTable, TriggerPayout};
use pachislot_domain::probability::Probability;
use pachislot_domain::spec::Spec;
use pachislot_engine::analysis::analyze;
use pachislot_engine::at::{Odds, cycle};
use pachislot_engine::error::SpecError;
use pachislot_engine::hunt::hunt;
use pachislot_engine::normalize::normalize;
use support::{ceiled, cz_spec, id, medals, one_in, per, percent, rules, shares, start, table};

fn near(left: f64, right: f64) -> bool {
    (left - right).abs() <= 1e-9 * left.abs().max(right.abs()).max(1.0)
}

/// The CZ machine without ceilings, its CZ's success bringing a BIG of 200
/// medals that wins the AT half the time, the AT gaining 4 a game: every
/// game alike, so a cycle is geometric.
fn staged() -> Spec {
    let mut spec = cz_spec();
    spec.components.ceiling.clear();
    spec.components.reset_ceiling.clear();
    spec.components
        .bonus_share
        .insert(id("cz"), shares(5_000, 5_000));
    spec.components.payout.insert(id("cz"), medals(200.0));
    spec.components.net_per_game.insert(id("at"), medals(4.0));
    spec
}

/// The same with the BIG brought outright at 1/1000 a game under setting 1
/// and 1/800 under setting 6.
fn direct_bonus() -> Spec {
    let mut spec = staged();
    spec.components
        .direct_bonus
        .insert(id("at"), per(one_in(100_000), one_in(80_000)));
    spec
}

#[test]
fn a_bonus_outright_wins_the_at_at_its_share_and_pays_on_every_game_that_draws_it() {
    let normalized = normalize(&direct_bonus()).expect("normalises");
    let analysis = analyze(&normalized, &PayoutBasis::FromSpec).expect("analyses");
    for (index, (published, success, bonus)) in [
        (1.0 / 150.0, 0.3, 1.0 / 1000.0),
        (1.0 / 120.0, 0.4, 1.0 / 800.0),
    ]
    .into_iter()
    .enumerate()
    {
        let share = 0.5;
        let table = normalized.tables[index].at.as_ref().expect("an AT");
        assert!(near(table.direct.value(), bonus * share));
        assert!(near(table.direct_bonus.value(), bonus));
        let outright = bonus * share;
        assert!(near(table.chance.value(), published / (1.0 - outright)));
        let per_game = outright + published * success * share;
        let games = 1.0 / per_game;
        let figures = &analysis.setting_levels[index];
        assert!(near(figures.bonuses[0].chance, published));
        assert!(near(figures.bonuses[1].chance, per_game));
        let at = figures.at.expect("an AT figure");
        assert!(near(at.direct_bonuses, bonus * games));
        let bonuses = published * games * success + bonus * games;
        let staked = 3.0 * (games + 600.0 / 4.0);
        let out = staked - 50.0 / 40.0 * games + 600.0 + bonuses * 200.0;
        assert!(
            near(figures.payout_rate, out / staked),
            "{} against {}",
            figures.payout_rate,
            out / staked
        );
    }
}

#[test]
fn a_bonus_outright_at_no_chance_is_no_bonus_outright() {
    let mut none = staged();
    none.components
        .direct_bonus
        .insert(id("at"), per(percent(0), percent(0)));
    let plain = normalize(&staged()).expect("normalises");
    assert_eq!(normalize(&none).expect("normalises"), plain);
    assert_eq!(
        analyze(
            &normalize(&none).expect("normalises"),
            &PayoutBasis::FromSpec
        ),
        analyze(&plain, &PayoutBasis::FromSpec)
    );
}

#[test]
fn a_bonus_outright_needs_a_cz_whose_success_brings_a_bonus() {
    let mut spec = cz_spec();
    spec.components
        .direct_bonus
        .insert(id("at"), per(one_in(100_000), one_in(80_000)));
    assert_eq!(
        normalize(&spec),
        Err(SpecError::DirectBonusWithoutBonusShare { entity: id("at") })
    );
    let mut stray = staged();
    stray
        .components
        .direct_bonus
        .insert(id("cz"), per(one_in(100_000), one_in(80_000)));
    assert!(normalize(&stray).is_err());
}

const P: f64 = 0.008;
const SUCCESS: f64 = 0.3;
const SHARE: f64 = 0.5;
const DIRECT: f64 = 0.0004;
const BONUS: f64 = 0.002;
const MEDALS: f64 = 200.0;

/// A CZ at `P` a game, its ceiling at 150, an AT間天井 at 600, its success
/// bringing a bonus of `MEDALS` that wins the AT at `SHARE`; the AT won
/// outright at `DIRECT` and the bonus brought outright at `BONUS` of what
/// is left.
fn machine() -> (AtRules, AtTable) {
    let rules = AtRules {
        trigger_payout: Some(TriggerPayout {
            medals: medals(MEDALS),
            net_per_game: None,
        }),
        ..rules(Some("cz"), vec![ceiled("cz", 150, 600)])
    };
    let bonus = (1.0 - DIRECT) * BONUS;
    let table = AtTable {
        direct: Probability::new(DIRECT + bonus * SHARE).expect("a chance"),
        direct_bonus: Probability::new(bonus).expect("a chance"),
        paid: Probability::new(SUCCESS).expect("a rate"),
        bonus_share: Probability::new(SHARE).expect("a share"),
        ..table(P, SUCCESS * SHARE, vec![1.0], vec![1.0])
    };
    (rules, table)
}

#[test]
fn from_just_after_an_at_the_hunt_pays_the_cycle_s_bonuses_walked_or_chained() {
    let (rules, plain) = machine();
    let own = vec![Probability::new(SUCCESS * SHARE).expect("a rate")];
    let chained = AtTable {
        successes: own,
        ..plain.clone()
    };
    for table in [plain, chained] {
        let found = cycle(&rules, Odds::of(&table), &[1.0]);
        assert!(found.on_ceiling > 0.0);
        let paid = (found.triggers - found.ceiled) * table.paid.value()
            + found.ceiled
            + found.direct_bonuses(table.direct_bonus.value());
        let hunted = hunt(start(0, 0, 0), &rules, &table).expect("comes");
        assert!(
            near(hunted.games, found.games),
            "{} against {}",
            hunted.games,
            found.games
        );
        assert!(
            near(hunted.trigger_medals, paid * MEDALS),
            "{} against {}",
            hunted.trigger_medals,
            paid * MEDALS
        );
    }
}
