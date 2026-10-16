#![allow(clippy::expect_used, clippy::indexing_slicing, clippy::float_cmp)]

mod support;

use std::num::NonZeroU32;

use pachislot_domain::conditions::{PayoutBasis, PayoutRate, PlayConditions};
use pachislot_domain::normalized::{
    Allotments, AtRules, AtTable, EventKind, NormalizedSpec, TriggerPayout,
};
use pachislot_domain::observation::{AtSeen, Leg, LegEnd, Path, PathStart, Segment};
use pachislot_domain::probability::{BasisPoints, Probability};
use pachislot_domain::setting_level::PerSettingLevel;
use pachislot_domain::spec::{Base, CeilingUnit, Component, LcdRate, Spec};
use pachislot_engine::analysis::{Analysis, analyze};
use pachislot_engine::at::{cycle, walk};
use pachislot_engine::error::{AnalysisError, InferenceError, SpecError};
use pachislot_engine::normalize::normalize;
use pachislot_engine::posterior::posterior;
use pachislot_engine::theoretical::path_theoretical_value;
use support::{
    LOSS, PAYOUT, at_spec, ceiled, close, cz_spec, drawn_misses_spec, id, made_up_spec, medals,
    mode, mode_spec, one_in, per, rules, setting_level, start, table, through,
};

fn normalized() -> NormalizedSpec {
    normalize(&at_spec()).expect("normalises")
}

fn measured() -> PayoutBasis {
    PayoutBasis::Measured(PerSettingLevel(vec![
        (
            setting_level(1),
            PayoutRate::from_basis_points(9_700).expect("a rate"),
        ),
        (
            setting_level(6),
            PayoutRate::from_basis_points(11_000).expect("a rate"),
        ),
    ]))
}

fn analysed(spec: &NormalizedSpec) -> Analysis {
    analyze(spec, &measured()).expect("solves")
}

fn at_table(spec: &NormalizedSpec, setting: u8) -> &AtTable {
    spec.table(setting_level(setting))
        .and_then(|table| table.at.as_ref())
        .expect("an AT machine's table")
}

/// The trigger's chance a regular game below the ceilings, under one setting.
fn chance(spec: &NormalizedSpec, setting: u8) -> f64 {
    at_table(spec, setting).chance.value()
}

fn path(start: PathStart, legs: &[(u32, LegEnd)]) -> Path {
    Path {
        start,
        legs: legs
            .iter()
            .map(|(games, end)| Leg {
                games: *games,
                end: *end,
            })
            .collect(),
    }
}

fn near(left: f64, right: f64, relative: f64) -> bool {
    (left - right).abs() <= relative * right.abs()
}

#[test]
fn the_published_first_hit_is_read_back_to_a_chance_below_the_ceiling_and_out_again() {
    let spec = normalized();
    let p = chance(&spec, 1);
    let between = -(1_000.0 * (-p).ln_1p()).exp_m1() / p;
    assert!((between - 500.0).abs() < 1e-9);
    assert!(p < 1.0 / 500.0);
    let figures = analysed(&spec);
    assert_eq!(figures.setting_levels[0].bonuses.len(), 1);
    assert!((figures.setting_levels[0].bonuses[0].chance - 1.0 / 500.0).abs() < 1e-15);
    assert!((figures.setting_levels[1].bonuses[0].chance - 1.0 / 400.0).abs() < 1e-15);
    assert!((figures.setting_levels[1].combined - 1.0 / 400.0).abs() < 1e-15);
    assert_eq!(
        spec.at_rules,
        Some(rules(None, vec![mode("at", 1_000), mode("at:reset", 600)]))
    );
    assert_eq!(at_table(&spec, 1).success.value(), 1.0);
}

#[test]
fn a_machine_without_a_ceiling_keeps_its_first_hit_as_its_chance() {
    let mut spec = at_spec();
    spec.components.ceiling.clear();
    spec.components.reset_ceiling.clear();
    let spec = normalize(&spec).expect("normalises");
    assert!(close(chance(&spec, 1), 1.0 / 500.0));
}

#[test]
fn a_cz_without_ceilings_brings_the_at_once_in_so_many_tries() {
    let (p, q) = (0.01, 0.3);
    let plain = rules(Some("cz"), vec![mode("cz", 0)]);
    let found = cycle(&plain, p, q, 0.0, &[1.0]);
    assert!(close(found.triggers, 1.0 / q));
    assert!(close(found.games, 1.0 / (p * q)));
    assert!(close(found.trigger_chance(), p));
    assert!(close(found.at_chance(), p * q));
}

#[test]
fn a_through_ceiling_wins_the_at_on_the_trigger_after_so_many_misses() {
    let (p, q) = (0.01, 0.3);
    let machine = rules(Some("cz"), through(vec![mode("cz", 0)], NonZeroU32::new(2)));
    let found = cycle(&machine, p, q, 0.0, &[1.0]);
    let triggers = 1.0 + (1.0 - q) + (1.0 - q) * (1.0 - q);
    assert!(close(found.triggers, triggers));
    assert!(close(found.games, triggers / p));
}

#[test]
fn a_second_ceiling_in_games_since_the_at_ends_the_cycle_there() {
    let p: f64 = 0.002;
    let capped = rules(None, vec![ceiled("at", 0, 300)]);
    let found = cycle(&capped, p, 1.0, 0.0, &[1.0]);
    assert!(close(found.games, -(300.0 * (-p).ln_1p()).exp_m1() / p));
    assert!(close(found.triggers, -(299.0 * (-p).ln_1p()).exp_m1()));
}

#[test]
fn the_convolved_cycle_meets_the_closed_form_when_the_second_ceiling_is_out_of_reach() {
    let (p, q) = (0.01, 0.3);
    let modes = vec![mode("cz", 150)];
    for misses in [None, NonZeroU32::new(3)] {
        let open = rules(Some("cz"), through(modes.clone(), misses));
        let far = rules(Some("cz"), through(vec![ceiled("cz", 150, 30_000)], misses));
        let closed = cycle(&open, p, q, 0.0, &[1.0]);
        let convolved = cycle(&far, p, q, 0.0, &[1.0]);
        assert!(near(convolved.games, closed.games, 1e-9));
        assert!(near(convolved.triggers, closed.triggers, 1e-9));
    }
}

#[test]
fn a_cz_s_published_figure_is_read_back_and_its_at_worked_out_from_it() {
    let spec = normalize(&cz_spec()).expect("normalises");
    assert_eq!(
        spec.at_rules,
        Some(rules(
            Some("cz"),
            vec![mode("cz", 600), mode("cz:reset", 300)]
        ))
    );
    assert!(close(at_table(&spec, 6).success.value(), 0.4));
    let figures = analysed(&spec);
    let one = &figures.setting_levels[0];
    assert_eq!(one.bonuses[0].id, id("cz"));
    assert_eq!(one.bonuses[1].id, id("at"));
    assert!((one.bonuses[0].chance - 1.0 / 150.0).abs() < 1e-15);
    assert!((one.bonuses[1].chance - 1.0 / 500.0).abs() < 1e-15);
    assert!((one.combined - 1.0 / 500.0).abs() < 1e-15);
    let six = &figures.setting_levels[1];
    assert!((six.bonuses[1].chance - 1.0 / 300.0).abs() < 1e-15);
}

#[test]
fn an_at_ceiling_beside_a_cz_is_the_second_ceiling_and_never_on_the_screen() {
    let mut spec = cz_spec();
    spec.components
        .ceiling
        .insert(id("at"), NonZeroU32::new(1_000).expect("a ceiling"));
    spec.resources.lcd_rate = LcdRate::new(1.25);
    let normalized = normalize(&spec).expect("normalises");
    let found = normalized.at_rules.clone().expect("an AT machine");
    assert_eq!(
        found.modes,
        vec![ceiled("cz", 480, 1_000), ceiled("cz:reset", 240, 1_000)]
    );
    let figures = analysed(&normalized);
    assert!((figures.setting_levels[0].bonuses[0].chance - 1.0 / 150.0).abs() < 1e-12);
    assert!(figures.setting_levels[0].bonuses[1].chance > 1.0 / 500.0);
}

#[test]
fn a_cz_s_published_figure_is_read_back_where_an_at_ceiling_keeps_it_below_its_chance() {
    let mut spec = cz_spec();
    spec.components.ceiling.clear();
    spec.components.reset_ceiling.clear();
    spec.components
        .ceiling
        .insert(id("at"), NonZeroU32::new(400).expect("a ceiling"));
    let normalized = normalize(&spec).expect("normalises");
    let figures = analysed(&normalized);
    assert!((figures.setting_levels[0].bonuses[0].chance - 1.0 / 150.0).abs() < 1e-15);
    assert!((figures.setting_levels[1].bonuses[0].chance - 1.0 / 120.0).abs() < 1e-15);
    assert!(chance(&normalized, 1) > 1.0 / 150.0);
}

#[test]
fn a_cz_path_is_as_likely_as_each_game_that_made_it() {
    let (p, q): (f64, f64) = (0.01, 0.3);
    let plain = rules(Some("cz"), vec![mode("cz", 0)]);
    let odds = table(p, q, vec![1.0], vec![1.0]);
    let miss = (-p).ln_1p();
    let played = path(
        start(0, 0, 0),
        &[(10, LegEnd::Missed), (5, LegEnd::WonAt(AtSeen::default()))],
    );
    let found = walk(&played, &plain, &odds);
    assert!(close(
        found.log_likelihood,
        13.0 * miss + (p * (1.0 - q)).ln() + (p * q).ln()
    ));
    assert!(close(found.medals, 15.0 * (PAYOUT * p * q - LOSS)));

    let limited = rules(Some("cz"), through(vec![mode("cz", 0)], NonZeroU32::new(1)));
    let found = walk(&played, &limited, &odds);
    assert!(close(
        found.log_likelihood,
        13.0 * miss + (p * (1.0 - q)).ln() + p.ln()
    ));
    assert!(close(
        found.medals,
        10.0 * (PAYOUT * p * q - LOSS) + 5.0 * (PAYOUT * p - LOSS)
    ));
}

#[test]
fn a_game_on_the_second_ceiling_is_the_at_itself() {
    let capped = rules(Some("cz"), vec![ceiled("cz", 0, 300)]);
    let odds = table(0.01, 0.3, vec![1.0], vec![1.0]);
    let won = walk(
        &path(start(40, 299, 2), &[(1, LegEnd::WonAt(AtSeen::default()))]),
        &capped,
        &odds,
    );
    assert!(close(won.log_likelihood, 0.0));
    assert!(close(won.medals, PAYOUT - LOSS));
    let went = walk(
        &path(start(40, 299, 2), &[(1, LegEnd::Going)]),
        &capped,
        &odds,
    );
    assert_eq!(went.log_likelihood, f64::NEG_INFINITY);
    let unseen = walk(
        &path(
            start(40, 299, 2),
            &[(0, LegEnd::WonAt(AtSeen::default())), (1, LegEnd::Going)],
        ),
        &capped,
        &odds,
    );
    assert!(close(unseen.log_likelihood, (1.0_f64 - 0.01).ln()));
    assert!(close(unseen.medals, PAYOUT * 0.01 * 0.3 - LOSS));
}

#[test]
fn a_setting_change_shortens_the_at_ceiling_until_the_first_at() {
    let rules = rules(
        Some("cz"),
        vec![ceiled("cz", 0, 300), ceiled("cz:reset", 0, 200)],
    );
    let odds = table(0.01, 0.3, vec![1.0, 0.0], vec![0.0, 1.0]);
    let after_reset = |since_at| PathStart {
        after_reset: true,
        ..start(40, since_at, 0)
    };
    let won = walk(
        &path(after_reset(199), &[(1, LegEnd::WonAt(AtSeen::default()))]),
        &rules,
        &odds,
    );
    assert!(close(won.log_likelihood, 0.0));
    let past = walk(
        &path(after_reset(199), &[(1, LegEnd::Going)]),
        &rules,
        &odds,
    );
    assert_eq!(past.log_likelihood, f64::NEG_INFINITY);
    let then = walk(
        &path(
            after_reset(199),
            &[
                (1, LegEnd::WonAt(AtSeen::default())),
                (300, LegEnd::WonAt(AtSeen::default())),
            ],
        ),
        &rules,
        &odds,
    );
    assert!(close(then.log_likelihood, 299.0 * (1.0_f64 - 0.01).ln()));
}

#[test]
fn a_mode_whose_at_ceiling_the_seat_is_past_is_none_play_could_be_in() {
    let rules = rules(
        Some("cz"),
        vec![ceiled("cz", 0, 300), ceiled("cz:reset", 0, 200)],
    );
    let odds = table(0.01, 0.3, vec![0.5, 0.5], vec![0.5, 0.5]);
    let walked = walk(
        &path(
            start(40, 250, 0),
            &[(49, LegEnd::Going), (1, LegEnd::WonAt(AtSeen::default()))],
        ),
        &rules,
        &odds,
    );
    assert!(close(walked.log_likelihood, 49.0 * (1.0_f64 - 0.01).ln()));
}

#[test]
fn a_setting_change_s_at_ceiling_beside_a_cz_is_a_mode_of_its_own() {
    let ceilings = |spec: &mut Spec, at_ceiling: u32, reset: u32| {
        spec.components
            .ceiling
            .insert(id("at"), NonZeroU32::new(at_ceiling).expect("a ceiling"));
        spec.components
            .reset_ceiling
            .insert(id("at"), NonZeroU32::new(reset).expect("a ceiling"));
    };
    let mut both = cz_spec();
    ceilings(&mut both, 1_000, 500);
    let found = normalize(&both).expect("normalises");
    assert_eq!(
        found.at_rules.map(|rules| rules.modes),
        Some(vec![ceiled("cz", 600, 1_000), ceiled("cz:reset", 300, 500)])
    );

    let mut at_alone = cz_spec();
    at_alone.components.reset_ceiling.clear();
    ceilings(&mut at_alone, 1_000, 500);
    let found = normalize(&at_alone).expect("normalises");
    assert_eq!(
        found.at_rules.as_ref().map(|rules| rules.modes.clone()),
        Some(vec![ceiled("cz", 600, 1_000), ceiled("cz:reset", 600, 500)])
    );
    let reset_only = at_table(&found, 1).allotments.clone();
    assert_eq!(
        (reset_only.after_at, reset_only.after_reset),
        (vec![1.0, 0.0], vec![0.0, 1.0])
    );

    let mut moded = mode_spec();
    let cz = cz_spec();
    moded.entities.push(id("cz"));
    moded.components.first_hit.clear();
    moded.components.cz = cz.components.cz.clone();
    moded
        .components
        .first_hit
        .clone_from(&cz.components.first_hit);
    moded.components.success.clone_from(&cz.components.success);
    moded
        .components
        .reset_ceiling
        .insert(id("at"), NonZeroU32::new(500).expect("a ceiling"));
    assert_eq!(
        normalize(&moded),
        Err(SpecError::ResetCeilingBesideModes { entity: id("at") })
    );
}

/// The CZ machine with its AT間天井 drawn after each AT: 450G 40% of the
/// time under setting 1 and 50% under setting 6, 999G otherwise.
fn drawn() -> Spec {
    let mut spec = cz_spec();
    spec.components.ceiling.clear();
    spec.components.reset_ceiling.clear();
    spec.components
        .ceiling
        .insert(id("at"), NonZeroU32::new(999).expect("a ceiling"));
    spec.entities.extend([id("short"), id("long")]);
    spec.components.mode = [id("short"), id("long")].into();
    let shares = |low: u32, high: u32| {
        PerSettingLevel(vec![
            (setting_level(1), BasisPoints::new(low).expect("a share")),
            (setting_level(6), BasisPoints::new(high).expect("a share")),
        ])
    };
    spec.components
        .allotment
        .insert(id("short"), shares(4_000, 5_000));
    spec.components
        .allotment
        .insert(id("long"), shares(6_000, 5_000));
    spec.components
        .at_ceiling
        .insert(id("short"), NonZeroU32::new(450).expect("a ceiling"));
    spec
}

#[test]
fn a_mode_s_own_at_ceiling_stands_in_for_the_at_s() {
    let spec = normalize(&drawn()).expect("normalises");
    let found = spec.at_rules.clone().expect("an AT machine");
    assert_eq!(
        found.modes,
        vec![ceiled("short", 0, 450), ceiled("long", 0, 999)]
    );
    let figures = analysed(&spec);
    let one = &figures.setting_levels[0];
    assert!((one.bonuses[0].chance - 1.0 / 150.0).abs() < 1e-15);
    let table = at_table(&spec, 1);
    let mixed = cycle(
        &found,
        table.chance.value(),
        table.success.value(),
        0.0,
        &[0.4, 0.6],
    );
    assert!(near(one.bonuses[1].chance, mixed.at_chance(), 1e-12));
    let short = cycle(
        &found,
        table.chance.value(),
        table.success.value(),
        0.0,
        &[1.0, 0.0],
    );
    let long = cycle(
        &found,
        table.chance.value(),
        table.success.value(),
        0.0,
        &[0.0, 1.0],
    );
    assert!(short.games < mixed.games && mixed.games < long.games);
}

#[test]
fn a_mode_s_own_at_ceiling_needs_a_cz() {
    let mut spec = mode_spec();
    spec.components
        .at_ceiling
        .insert(id("heaven"), NonZeroU32::new(450).expect("a ceiling"));
    assert_eq!(
        normalize(&spec),
        Err(SpecError::AtCeilingWithoutCz {
            entity: id("heaven")
        })
    );
}

#[test]
fn the_misses_before_play_was_seen_rule_out_a_mode_they_could_not_come_from() {
    let (p, q) = (0.004, 0.3);
    let modes = rules(Some("cz"), vec![mode("heaven", 100), mode("normal", 1_000)]);
    let odds = table(p, q, vec![0.3, 0.7], vec![1.0, 0.0]);
    let one_game = [(1, LegEnd::Going)];
    let even = PAYOUT * (0.3 * q + 0.7 * p * q) - LOSS;
    let unseen = walk(&path(start(99, 99, 0), &one_game), &modes, &odds);
    assert!(close(unseen.medals, even));
    let alike = walk(&path(start(99, 149, 1), &one_game), &modes, &odds);
    assert!(close(alike.medals, even));
    let normal = walk(&path(start(99, 229, 1), &one_game), &modes, &odds);
    assert!(close(normal.medals, PAYOUT * p * q - LOSS));
}

#[test]
fn a_long_path_without_a_cz_points_to_the_rarer_setting() {
    let spec = normalize(&cz_spec()).expect("normalises");
    let played = path(start(0, 0, 0), &[(400, LegEnd::Going)]);
    let found = posterior(&spec, None, &[], Some(&played)).expect("infers");
    let (low, high) = (chance(&spec, 1), chance(&spec, 6));
    let odds = (400.0 * ((-high).ln_1p() - (-low).ln_1p())).exp();
    assert!(close(found.setting_levels[0].1, 1.0 / (1.0 + odds)));
    assert!(found.setting_levels[0].1 > 0.5);
}

/// The made-up CZ machine with a bell counted in its regular games, 1/7.3
/// under setting 1 and 1/6.9 under 6, paying through the ベース.
fn belled() -> Spec {
    let mut spec = cz_spec();
    spec.entities.push(id("bell"));
    spec.components
        .chance
        .insert(id("bell"), per(one_in(730), one_in(690)));
    spec
}

#[test]
fn an_at_machine_s_small_wins_are_counted_and_leave_its_figures_be() {
    let bare = normalize(&cz_spec()).expect("normalises");
    let counted = normalize(&belled()).expect("normalises");
    assert_eq!(counted.at_rules, bare.at_rules);
    for (with, without) in counted.tables.iter().zip(&bare.tables) {
        assert_eq!(with.at, without.at);
        assert_eq!(with.events.len(), 1);
        assert_eq!(with.events[0].id, id("bell"));
        assert_eq!(with.events[0].kind, EventKind::Role(None));
    }
    assert!(close(counted.tables[0].events[0].chance.value(), 1.0 / 7.3));
    assert_eq!(analysed(&counted), analysed(&bare));
}

#[test]
fn an_at_machine_s_counted_small_wins_weigh_beside_its_path() {
    let spec = normalize(&belled()).expect("normalises");
    let played = path(start(0, 0, 0), &[(300, LegEnd::Going)]);
    let bells = Segment {
        games: 300,
        counts: vec![(id("bell"), 45)],
    };
    let alone = posterior(&spec, None, &[], Some(&played)).expect("infers");
    let both = posterior(&spec, None, &[bells], Some(&played)).expect("infers");
    let likely = |q: f64| 45.0 * q.ln() + 255.0 * (-q).ln_1p();
    let weighed: Vec<f64> = alone
        .setting_levels
        .iter()
        .zip([1.0 / 7.3, 1.0 / 6.9])
        .map(|((_, share), q)| share * likely(q).exp())
        .collect();
    let total: f64 = weighed.iter().sum();
    for ((_, share), weight) in both.setting_levels.iter().zip(&weighed) {
        assert!(near(*share, weight / total, 1e-9));
    }
}

#[test]
fn a_path_is_an_at_machine_s_and_its_at_never_counted() {
    let a_type = normalize(&made_up_spec()).expect("normalises");
    let played = path(start(0, 0, 0), &[(10, LegEnd::Going)]);
    assert_eq!(
        posterior(&a_type, None, &[], Some(&played)),
        Err(InferenceError::PathWithoutAt)
    );
    let counted = Segment {
        games: 1_000,
        counts: vec![(id("at"), 2)],
    };
    assert_eq!(
        posterior(&normalized(), None, &[counted], None),
        Err(InferenceError::UnknownCount {
            segment: 0,
            id: id("at")
        })
    );
}

#[test]
fn the_games_played_are_weighed_setting_by_setting_and_priced_on_the_terms() {
    let spec = normalize(&cz_spec()).expect("normalises");
    let analysis = analysed(&spec);
    let rules = spec.at_rules.clone().expect("an AT machine");
    let played = path(
        start(200, 350, 1),
        &[
            (120, LegEnd::Missed),
            (80, LegEnd::WonAt(AtSeen::default())),
            (100, LegEnd::Going),
        ],
    );
    let play = PlayConditions::new(20.0, 20.0, Probability::new(0.0).expect("a share"), None)
        .expect("terms");
    let weights = [(setting_level(1), 0.25), (setting_level(6), 0.75)];
    let found = path_theoretical_value(&spec, &rules, &analysis, &weights, play, &played);
    let under = |setting: u8| walk(&played, &rules, at_table(&spec, setting)).medals;
    let medals = 0.25 * under(1) + 0.75 * under(6);
    assert!(close(found.medals, medals));
    assert!(close(found.yen, medals * 20.0));
    assert!(close(found.net_per_game, medals / 300.0));
    assert!(close(found.payout_rate, 0.25 * 0.97 + 0.75 * 1.1));
}

#[test]
fn an_at_machine_is_its_at_its_cz_and_its_base() {
    let mut beside = at_spec();
    beside.entities.push(id("big"));
    beside.components.bonus = [id("big")].into();
    beside
        .components
        .chance
        .insert(id("big"), per(one_in(30_000), one_in(25_000)));
    beside.components.payout.insert(id("big"), medals(240.0));
    assert_eq!(
        normalize(&beside),
        Err(SpecError::AtNotAlone { entity: id("big") })
    );

    let mut paid = belled();
    paid.components.payout.insert(id("bell"), medals(8.0));
    assert_eq!(
        normalize(&paid),
        Err(SpecError::PayoutBesideAt { entity: id("bell") })
    );

    let mut baseless = at_spec();
    baseless.resources.base = None;
    assert_eq!(normalize(&baseless), Err(SpecError::MissingBase));

    let mut a_type = made_up_spec();
    a_type.resources.base = Base::new(40.0);
    assert_eq!(normalize(&a_type), Err(SpecError::BaseWithoutAt));

    let mut lone = made_up_spec();
    let cz = cz_spec();
    lone.entities.push(id("cz"));
    lone.components.cz = cz.components.cz.clone();
    lone.components.first_hit = cz.components.first_hit.clone();
    lone.components.success = cz.components.success.clone();
    assert_eq!(
        normalize(&lone),
        Err(SpecError::CzWithoutAt { entity: id("cz") })
    );
}

#[test]
fn an_at_a_cz_brings_takes_its_first_hit_from_the_cz() {
    let mut first_hit = cz_spec();
    first_hit
        .components
        .first_hit
        .insert(id("at"), per(one_in(50_000), one_in(40_000)));
    assert_eq!(
        normalize(&first_hit),
        Err(SpecError::FirstHitBesideCz { entity: id("at") })
    );

    let mut direct = at_spec();
    direct.components.first_hit.clear();
    assert_eq!(
        normalize(&direct),
        Err(SpecError::MissingComponent {
            entity: id("at"),
            component: Component::FirstHit
        })
    );

    let mut stray = at_spec();
    stray
        .components
        .misses
        .insert(id("at"), NonZeroU32::new(3).expect("misses"));
    assert_eq!(
        normalize(&stray),
        Err(SpecError::MissingComponent {
            entity: id("at"),
            component: Component::Cz
        })
    );
}

#[test]
fn a_first_hit_as_rare_as_the_ceiling_is_refused() {
    let mut spec = at_spec();
    spec.components
        .first_hit
        .insert(id("at"), per(one_in(100_000), one_in(40_000)));
    assert_eq!(
        normalize(&spec),
        Err(SpecError::FirstHitBeyondCeiling {
            at: id("at"),
            setting_level: setting_level(1)
        })
    );
}

#[test]
fn an_at_machine_has_its_rate_measured_and_its_components_only_on_its_at() {
    assert_eq!(
        analyze(&normalized(), &PayoutBasis::FromSpec),
        Err(AnalysisError::RateNotFromSpec)
    );
    let mut stray = made_up_spec();
    stray
        .components
        .ceiling
        .insert(id("grape"), NonZeroU32::new(100).expect("a ceiling"));
    assert_eq!(
        normalize(&stray),
        Err(SpecError::MissingComponent {
            entity: id("grape"),
            component: Component::At
        })
    );
}

#[test]
fn a_machine_of_modes_reads_its_published_first_hit_over_its_allotment() {
    let spec = normalize(&mode_spec()).expect("normalises");
    let rules = spec.at_rules.clone().expect("an AT machine");
    assert_eq!(
        rules.modes,
        vec![mode("heaven", 100), mode("normal", 1_000)]
    );
    assert_eq!(
        at_table(&spec, 6).allotments,
        Allotments {
            after_at: vec![0.5, 0.5],
            after_reset: vec![1.0, 0.0],
        }
    );
    let figures = analysed(&spec);
    assert!((figures.setting_levels[0].bonuses[0].chance - 1.0 / 500.0).abs() < 1e-15);
    assert!((figures.setting_levels[1].bonuses[0].chance - 1.0 / 400.0).abs() < 1e-15);
}

#[test]
fn a_ceiling_counted_on_the_screen_comes_sooner_in_regular_games() {
    let mut spec = at_spec();
    spec.resources.lcd_rate = LcdRate::new(1.64);
    let rules = normalize(&spec)
        .expect("normalises")
        .at_rules
        .expect("an AT machine");
    assert_eq!(rules.modes, vec![mode("at", 610), mode("at:reset", 366)]);
    assert_eq!(LcdRate::new(0.9), None);
}

#[test]
fn modes_are_an_at_machine_s_and_their_allotments_whole() {
    let mut astray = made_up_spec();
    astray.entities.push(id("heaven"));
    astray.components.mode.insert(id("heaven"));
    astray.components.allotment.insert(
        id("heaven"),
        mode_spec().components.allotment[&id("heaven")].clone(),
    );
    assert_eq!(
        normalize(&astray),
        Err(SpecError::ModeWithoutAt {
            entity: id("heaven")
        })
    );

    let mut ceiled = mode_spec();
    ceiled
        .components
        .ceiling
        .insert(id("at"), NonZeroU32::new(1_000).expect("a ceiling"));
    assert_eq!(
        normalize(&ceiled),
        Err(SpecError::CeilingBesideModes { entity: id("at") })
    );

    let mut short = mode_spec();
    short.components.allotment.insert(
        id("normal"),
        mode_spec().components.allotment[&id("heaven")].clone(),
    );
    assert_eq!(
        normalize(&short),
        Err(SpecError::AllotmentNotWhole {
            setting_level: setting_level(1),
            after_reset: false,
            sum: 6_000
        })
    );

    let mut partial = mode_spec();
    partial.components.reset_allotment.remove(&id("normal"));
    assert_eq!(
        normalize(&partial),
        Err(SpecError::ResetAllotmentPartial {
            entity: id("normal")
        })
    );
}

#[test]
fn a_game_walked_counts_what_a_bonus_that_is_the_trigger_pays_at_its_chance() {
    let (p, q) = (0.01, 0.25);
    let machine = AtRules {
        trigger_payout: Some(TriggerPayout {
            medals: medals(100.0),
            net_per_game: None,
        }),
        ..rules(Some("cz"), vec![mode("cz", 0)])
    };
    let walked = walk(
        &path(start(0, 0, 0), &[(1, LegEnd::Going)]),
        &machine,
        &table(p, q, vec![1.0], vec![1.0]),
    );
    assert!(close(walked.medals, p * q * PAYOUT + p * 100.0 - LOSS));
}

#[test]
fn a_game_walked_counts_what_a_bonus_a_cz_s_success_brings_pays_over_the_cz_s_that_succeed() {
    let (p, q, succeeding) = (0.01, 0.25, 0.4);
    let machine = AtRules {
        trigger_payout: Some(TriggerPayout {
            medals: medals(100.0),
            net_per_game: None,
        }),
        ..rules(Some("cz"), vec![mode("cz", 0)])
    };
    let walked = walk(
        &path(start(0, 0, 0), &[(1, LegEnd::Going)]),
        &machine,
        &AtTable {
            paid: Probability::new(succeeding).expect("a share"),
            ..table(p, q, vec![1.0], vec![1.0])
        },
    );
    assert!(close(
        walked.medals,
        p * q * PAYOUT + p * succeeding * 100.0 - LOSS
    ));
}

#[test]
fn a_through_ceiling_drawn_after_each_at_is_a_mode_for_each_and_a_cycle_their_mix() {
    let normalized = normalize(&drawn_misses_spec()).expect("normalises");
    let rules_of = normalized.at_rules.as_ref().expect("an AT machine");
    let limits: Vec<Option<u32>> = rules_of
        .modes
        .iter()
        .map(|mode| mode.misses.map(NonZeroU32::get))
        .collect();
    assert_eq!(limits, vec![Some(2), Some(4), Some(6)]);
    let (p, q) = (0.01, 0.3);
    let shares = [0.34, 0.33, 0.33];
    let mixed = cycle(rules_of, p, q, 0.0, &shares);
    let each: Vec<_> = rules_of
        .modes
        .iter()
        .map(|mode| cycle(&rules(Some("cz"), vec![mode.clone()]), p, q, 0.0, &[1.0]))
        .collect();
    let games: f64 = each
        .iter()
        .zip(shares)
        .map(|(one, share)| share * one.games)
        .sum();
    let triggers: f64 = each
        .iter()
        .zip(shares)
        .map(|(one, share)| share * one.triggers)
        .sum();
    assert!(close(mixed.games, games));
    assert!(close(mixed.triggers, triggers));
}

#[test]
fn a_mode_s_through_ceiling_needs_a_cz_to_miss() {
    let mut spec = mode_spec();
    spec.components
        .misses
        .insert(id("heaven"), NonZeroU32::new(2).expect("misses"));
    assert_eq!(
        normalize(&spec),
        Err(SpecError::MissesWithoutCz {
            entity: id("heaven")
        })
    );
}

#[test]
fn an_at_won_outright_beside_its_cz_is_the_same_cycle_in_closed_form_and_walked() {
    let (p, q, d) = (0.01, 0.3, 0.002);
    for misses in [None, NonZeroU32::new(3)] {
        for ceiling in [0, 150] {
            let open = rules(Some("cz"), through(vec![mode("cz", ceiling)], misses));
            let far = rules(
                Some("cz"),
                through(vec![ceiled("cz", ceiling, 30_000)], misses),
            );
            let closed = cycle(&open, p, q, d, &[1.0]);
            let walked = cycle(&far, p, q, d, &[1.0]);
            assert!(
                near(walked.games, closed.games, 1e-9),
                "{} against {}",
                walked.games,
                closed.games
            );
            assert!(near(walked.triggers, closed.triggers, 1e-9));
            assert!(closed.games < cycle(&open, p, q, 0.0, &[1.0]).games);
        }
    }
    let never = cycle(&rules(Some("cz"), vec![mode("cz", 0)]), 0.0, q, d, &[1.0]);
    assert!(near(never.games, 1.0 / d, 1e-12));
    assert!(near(never.triggers, 0.0, 1e-12));
}

#[test]
fn an_at_won_outright_needs_a_cz_beside_it() {
    let mut spec = at_spec();
    spec.components
        .direct
        .insert(id("at"), per(one_in(100_000), one_in(80_000)));
    assert_eq!(
        normalize(&spec),
        Err(SpecError::DirectWithoutCz { entity: id("at") })
    );
    let mut beside = cz_spec();
    beside
        .components
        .direct
        .insert(id("at"), per(one_in(100_000), one_in(80_000)));
    let normalized = normalize(&beside).expect("normalises");
    assert!(close(at_table(&normalized, 1).direct.value(), 0.001));
    let figures = analysed(&normalized);
    assert!((figures.setting_levels[0].bonuses[0].chance - 1.0 / 150.0).abs() < 1e-12);
    let plain = analysed(&normalize(&cz_spec()).expect("normalises"));
    assert!(
        figures.setting_levels[0].bonuses[1].chance > plain.setting_levels[0].bonuses[1].chance
    );
}

#[test]
fn a_ceiling_counted_in_another_unit_comes_after_that_over_its_rate_in_regular_games() {
    let in_points = |per_game: f64| {
        let mut spec = at_spec();
        spec.resources.ceiling_unit = CeilingUnit::new("pt", per_game);
        normalize(&spec)
    };
    let ceilings = |per_game: f64| -> Vec<Option<u32>> {
        in_points(per_game)
            .expect("normalises")
            .at_rules
            .expect("an AT machine")
            .modes
            .iter()
            .map(|mode| mode.ceiling.map(NonZeroU32::get))
            .collect()
    };
    assert_eq!(ceilings(0.5), vec![Some(2_000), Some(1_200)]);
    assert_eq!(ceilings(1.0 / 32.0), vec![Some(32_000), Some(19_200)]);
    let mut both = at_spec();
    both.resources.ceiling_unit = CeilingUnit::new("pt", 2.0);
    both.resources.lcd_rate = LcdRate::new(1.5);
    assert_eq!(normalize(&both), Err(SpecError::CeilingUnitBesideLcdRate));
    assert_eq!(
        in_points(2.0),
        Err(SpecError::FirstHitBeyondCeiling {
            at: id("at"),
            setting_level: setting_level(1)
        })
    );
    assert_eq!(CeilingUnit::new(" ", 2.0), None);
    assert_eq!(CeilingUnit::new("pt", 0.0), None);
}
