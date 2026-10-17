#![allow(clippy::expect_used, clippy::indexing_slicing, clippy::float_cmp)]

mod support;

use std::num::NonZeroU32;

use pachislot_domain::conditions::{PayoutBasis, PayoutRate};
use pachislot_domain::normalized::{
    Allotments, AtRules, AtTable, BonusMiss, CeilingAt, ForcedCz, ModeRule, PayoutLaw,
};
use pachislot_domain::observation::{AtSeen, Leg, LegEnd, Path, PathStart};
use pachislot_domain::probability::{BasisPoints, Probability};
use pachislot_domain::setting_level::PerSettingLevel;
use pachislot_domain::spec::{Base, Component, Medals, PayoutRow, Sets, Spec};
use pachislot_engine::analysis::analyze;
use pachislot_engine::at::{settled, walk};
use pachislot_engine::error::SpecError;
use pachislot_engine::normalize::normalize;
use pachislot_engine::payout::{below, cap_figures, capped, headroom, mean};
use support::{at_spec, close, id, made_up_spec, medals, mode_spec, setting_level};

const LOSS: f64 = 50.0 / 40.0;

fn chance(value: f64) -> Probability {
    Probability::new(value).expect("a chance")
}

/// 100 medals for the first set and each one after, carried on 80% of the time.
fn sets() -> PayoutLaw {
    PayoutLaw::Sets {
        first: medals(100.0),
        set: medals(100.0),
        continuation_rate: chance(0.8),
    }
}

#[test]
fn an_at_in_sets_averages_its_first_and_the_sets_it_carries_on_to() {
    assert!(close(mean(&sets()), 100.0 + 100.0 * 0.8 / 0.2));
    assert!(close(mean(&PayoutLaw::Fixed(medals(600.0))), 600.0));
    let table = PayoutLaw::Table(vec![
        (medals(300.0), chance(0.7)),
        (medals(2_000.0), chance(0.3)),
    ]);
    assert!(close(mean(&table), 300.0 * 0.7 + 2_000.0 * 0.3));
}

#[test]
fn the_cap_cuts_an_at_short_and_its_chance_of_reaching_it_is_its_completion() {
    let r: f64 = 0.8;
    let at = capped(&sets(), Some(2_400.0));
    assert!(close(at.completion, r.powi(23)));
    assert!(close(
        at.gain,
        100.0 + 100.0 * r * (1.0 - r.powi(23)) / (1.0 - r)
    ));
    assert_eq!(below(&sets(), Some(2_400.0)).len(), 23);
    let table = PayoutLaw::Table(vec![
        (medals(300.0), chance(0.7)),
        (medals(2_000.0), chance(0.3)),
    ]);
    let short = capped(&table, Some(1_000.0));
    assert!(close(short.completion, 0.3));
    assert!(close(short.gain, 300.0 * 0.7 + 1_000.0 * 0.3));
    let uncapped = capped(&sets(), None);
    assert!(close(uncapped.gain, mean(&sets())));
    assert_eq!(uncapped.completion, 0.0);
}

#[test]
fn what_a_carried_on_zone_holds_shrinks_the_headroom_less_the_games_lost_since() {
    assert_eq!(headroom(None, Some(1_500.0), Some(50), 10, LOSS), None);
    assert_eq!(
        headroom(Some(2_400.0), None, Some(50), 10, LOSS),
        Some(2_400.0)
    );
    assert!(close(
        headroom(Some(2_400.0), Some(1_500.0), Some(50), 10, LOSS).expect("a headroom"),
        2_400.0 - (1_500.0 - 12.5)
    ));
    assert_eq!(
        headroom(Some(2_400.0), Some(1_500.0), Some(50), 50, LOSS),
        Some(2_400.0)
    );
    assert_eq!(
        headroom(Some(2_400.0), Some(1_500.0), None, 0, LOSS),
        Some(2_400.0)
    );
}

/// Held medals are counted whole, so the loss a game is whole here.
#[test]
fn ats_won_back_in_the_window_complete_from_what_the_first_held() {
    let fixed = PayoutLaw::Fixed(medals(1_500.0));
    let arrivals = [0.1, 0.2, 0.05];
    let loss = 2.0;
    let found = cap_figures(&fixed, Some(2_400.0), Some(3), &arrivals, loss);
    let back: f64 = arrivals.iter().sum();
    let regained: f64 = arrivals
        .iter()
        .zip(0_u32..)
        .map(|(arrival, since)| arrival * (900.0 + loss * f64::from(since)))
        .sum();
    assert!(close(found.completion, back / (1.0 + back)));
    assert!(close(found.gain, (1_500.0 + regained) / (1.0 + back)));
    let fresh = cap_figures(&fixed, Some(2_400.0), None, &[], LOSS);
    assert_eq!((fresh.completion, fresh.gain), (0.0, 1_500.0));
}

fn rules(cap: Option<f64>, window: Option<u32>, reset_on_cap: bool) -> AtRules {
    AtRules {
        base: Base::new(40.0).expect("a base"),
        at: id("at"),
        trigger: None,
        modes: vec![ModeRule {
            id: id("at"),
            ceiling: None,
            at_ceiling: None,
            misses: None,
            since_at_ceiling: None,
            expiry: None,
        }],
        net_per_game: None,
        cap: cap.and_then(Medals::new),
        window: window.and_then(NonZeroU32::new),
        reset_on_cap,
        trigger_is_bonus: false,
        trigger_payout: None,
        bonus_miss: BonusMiss::Counted,
        forced_cz: ForcedCz::Drawn,
        ceiling_at: CeilingAt::Outright,
        ceiling_across_bonuses: None,
        ceiling_payout: None,
        endings: Vec::new(),
        side_bonus: None,
    }
}

fn table(payout: PayoutLaw) -> AtTable {
    AtTable {
        chance: chance(0.01),
        success: chance(1.0),
        direct: chance(0.0),
        direct_bonus: chance(0.0),
        paid: chance(1.0),
        bonus_share: chance(1.0),
        gates: Vec::new(),
        successes: Vec::new(),
        redraws: Vec::new(),
        ceiling_redraws: Vec::new(),
        own_chances: Vec::new(),
        side_chance: chance(0.0),
        allotments: Allotments {
            after_at: vec![1.0],
            after_reset: vec![1.0],
            after_endings: Vec::new(),
        },
        payout,
    }
}

fn start(held: Option<u32>, since_at: u32) -> PathStart {
    PathStart {
        since_trigger: since_at,
        since_at,
        misses: 0,
        after_reset: false,
        held,
        since_at_across_bonuses: None,
        ending: None,
        since_side_bonus: None,
    }
}

fn won(seen: AtSeen) -> Path {
    Path {
        start: start(None, 0),
        legs: vec![Leg {
            games: 1,
            end: LegEnd::WonAt(seen),
        }],
    }
}

#[test]
fn how_an_at_went_is_as_likely_as_its_law_makes_it() {
    let p: f64 = 0.01;
    let capped_rules = rules(Some(2_400.0), None, false);
    let odds = table(sets());
    let completed = walk(
        &won(AtSeen {
            completed: Some(true),
            ..AtSeen::default()
        }),
        &capped_rules,
        &odds,
    );
    assert!(close(
        completed.log_likelihood,
        p.ln() + 0.8_f64.powi(23).ln()
    ));
    assert!(close(
        completed.medals,
        p * capped(&sets(), Some(2_400.0)).gain - LOSS
    ));
    let five = walk(
        &won(AtSeen {
            sets: Some(5),
            ..AtSeen::default()
        }),
        &capped_rules,
        &odds,
    );
    assert!(close(
        five.log_likelihood,
        p.ln() + (0.8_f64.powi(5) * 0.2).ln()
    ));
    let uncapped = walk(
        &won(AtSeen {
            sets: Some(5),
            ..AtSeen::default()
        }),
        &rules(None, None, false),
        &odds,
    );
    assert!(close(
        uncapped.log_likelihood,
        p.ln() + (0.8_f64.powi(5) * 0.2).ln()
    ));
    assert!(close(uncapped.medals, p * mean(&sets()) - LOSS));
    let unknown = walk(&won(AtSeen::default()), &capped_rules, &odds);
    assert!(close(unknown.log_likelihood, p.ln()));
}

#[test]
fn a_game_in_the_window_is_worth_what_the_headroom_left_lets_an_at_gain() {
    let p: f64 = 0.01;
    let carried = Path {
        start: start(Some(1_500), 10),
        legs: vec![Leg {
            games: 1,
            end: LegEnd::Going,
        }],
    };
    let windowed = rules(Some(2_400.0), Some(50), false);
    let found = walk(&carried, &windowed, &table(sets()));
    let headroom = 2_400.0 - (1_500.0 - 10.0 * LOSS);
    assert!(close(
        found.medals,
        p * capped(&sets(), Some(headroom)).gain - LOSS
    ));
    let past = Path {
        start: start(Some(1_500), 60),
        ..carried
    };
    let fresh = walk(&past, &windowed, &table(sets()));
    assert!(close(
        fresh.medals,
        p * capped(&sets(), Some(2_400.0)).gain - LOSS
    ));
}

#[test]
fn what_an_at_short_of_the_cap_gained_is_carried_into_the_next_within_the_window() {
    let p: f64 = 0.01;
    let fixed = table(PayoutLaw::Fixed(medals(1_500.0)));
    let windowed = rules(Some(2_400.0), Some(50), false);
    let twice = Path {
        start: start(None, 0),
        legs: vec![
            Leg {
                games: 1,
                end: LegEnd::WonAt(AtSeen {
                    completed: Some(false),
                    ..AtSeen::default()
                }),
            },
            Leg {
                games: 5,
                end: LegEnd::WonAt(AtSeen {
                    completed: Some(true),
                    ..AtSeen::default()
                }),
            },
        ],
    };
    let found = walk(&twice, &windowed, &fixed);
    let miss = (1.0 - p).ln();
    assert!(close(found.log_likelihood, 2.0 * p.ln() + 4.0 * miss));
    let second: f64 = (0..5_u32)
        .map(|since| p * (900.0 + LOSS * f64::from(since)) - LOSS)
        .sum();
    assert!(close(found.medals, p * 1_500.0 - LOSS + second));
}

#[test]
fn reaching_the_cap_starts_play_again_as_after_a_setting_change_where_the_machine_says_so() {
    let mut odds = table(PayoutLaw::Fixed(medals(3_000.0)));
    odds.allotments = Allotments {
        after_at: vec![1.0, 0.0],
        after_reset: vec![0.0, 1.0],
        after_endings: Vec::new(),
    };
    let two_modes = |reset_on_cap| AtRules {
        modes: vec![
            ModeRule {
                id: id("at"),
                ceiling: NonZeroU32::new(1_000),
                at_ceiling: None,
                misses: None,
                since_at_ceiling: None,
                expiry: None,
            },
            ModeRule {
                id: id("at:reset"),
                ceiling: NonZeroU32::new(100),
                at_ceiling: None,
                misses: None,
                since_at_ceiling: None,
                expiry: None,
            },
        ],
        ..rules(Some(2_400.0), None, reset_on_cap)
    };
    let (figures, shares) = settled(&two_modes(true), &odds);
    assert_eq!(figures.completion, 1.0);
    assert_eq!(figures.gain, 2_400.0);
    assert_eq!(shares, vec![0.0, 1.0]);
    let (_, kept) = settled(&two_modes(false), &odds);
    assert_eq!(kept, vec![1.0, 0.0]);
}

fn per<T: Clone>(low: T, high: T) -> PerSettingLevel<T> {
    PerSettingLevel(vec![(setting_level(1), low), (setting_level(6), high)])
}

fn share(points: u32) -> BasisPoints {
    BasisPoints::new(points).expect("a share")
}

/// The AT machine of modes paid in sets, 継続率 80% and 85%, under a cap of
/// 2400 that carries on 32 games after an AT, play starting again in 天国
/// once an AT reaches the cap.
fn capped_spec() -> Spec {
    let mut spec = mode_spec();
    spec.components.payout.clear();
    spec.components.sets.insert(
        id("at"),
        Sets {
            first: medals(100.0),
            set: medals(100.0),
        },
    );
    spec.components
        .continuation_rate
        .insert(id("at"), per(share(8_000), share(8_500)));
    spec.components
        .window
        .insert(id("at"), NonZeroU32::new(32).expect("a window"));
    spec.components.reset_on_cap.insert(id("at"));
    spec.resources.cap = Medals::new(2_400.0);
    spec
}

fn measured() -> PayoutBasis {
    PayoutBasis::Measured(per(
        PayoutRate::from_basis_points(9_700).expect("a rate"),
        PayoutRate::from_basis_points(11_000).expect("a rate"),
    ))
}

#[test]
fn a_capped_machine_is_read_with_its_law_and_still_meets_its_published_first_hit() {
    let spec = normalize(&capped_spec()).expect("normalises");
    let rules = spec.at_rules.clone().expect("an AT machine");
    assert_eq!(rules.cap, Medals::new(2_400.0));
    assert_eq!(rules.window, NonZeroU32::new(32));
    assert!(rules.reset_on_cap);
    let six = spec
        .table(setting_level(6))
        .and_then(|table| table.at.clone())
        .expect("a table");
    assert_eq!(
        six.payout,
        PayoutLaw::Sets {
            first: medals(100.0),
            set: medals(100.0),
            continuation_rate: chance(0.85),
        }
    );
    let figures = analyze(&spec, &measured()).expect("solves");
    let one = &figures.setting_levels[0];
    assert!((one.bonuses[0].chance - 1.0 / 500.0).abs() < 1e-12);
    let at = one.at.expect("an AT's figures");
    assert!(at.completion > 0.8_f64.powi(23));
    assert!(at.gain < mean(&sets()));
    assert!((figures.setting_levels[1].bonuses[0].chance - 1.0 / 400.0).abs() < 1e-12);
}

#[test]
fn an_at_is_paid_one_way_and_a_cap_is_what_its_window_needs() {
    let mut both = capped_spec();
    both.components.payout.insert(id("at"), medals(600.0));
    assert_eq!(
        normalize(&both),
        Err(SpecError::ConflictingComponents {
            entity: id("at"),
            first: Component::Payout,
            second: Component::Sets
        })
    );
    let mut no_continuation = capped_spec();
    no_continuation.components.continuation_rate.clear();
    assert_eq!(
        normalize(&no_continuation),
        Err(SpecError::MissingComponent {
            entity: id("at"),
            component: Component::ContinuationRate
        })
    );
    let mut no_sets = at_spec();
    no_sets
        .components
        .continuation_rate
        .insert(id("at"), per(share(8_000), share(8_000)));
    assert_eq!(
        normalize(&no_sets),
        Err(SpecError::MissingComponent {
            entity: id("at"),
            component: Component::Sets
        })
    );
    let mut endless = capped_spec();
    endless
        .components
        .continuation_rate
        .insert(id("at"), per(share(8_000), share(10_000)));
    assert_eq!(
        normalize(&endless),
        Err(SpecError::EndlessContinuation {
            entity: id("at"),
            setting_level: setting_level(6)
        })
    );
    let mut empty = capped_spec();
    empty.components.sets.insert(
        id("at"),
        Sets {
            first: medals(100.0),
            set: medals(0.0),
        },
    );
    assert_eq!(
        normalize(&empty),
        Err(SpecError::EmptySet { entity: id("at") })
    );
    let mut uncapped = capped_spec();
    uncapped.resources.cap = None;
    assert_eq!(
        normalize(&uncapped),
        Err(SpecError::NeedsCap {
            entity: id("at"),
            component: Component::Window
        })
    );
    let mut a_type = made_up_spec();
    a_type.resources.cap = Medals::new(2_400.0);
    assert_eq!(normalize(&a_type), Err(SpecError::CapWithoutAt));
    let mut tabled = at_spec();
    tabled.components.payout.clear();
    let row = |medals_: f64, points| PayoutRow {
        medals: medals(medals_),
        share: share(points),
    };
    tabled.components.payout_table.insert(
        id("at"),
        per(
            vec![row(300.0, 6_000), row(1_000.0, 3_000)],
            vec![row(300.0, 5_000), row(1_000.0, 5_000)],
        ),
    );
    assert_eq!(
        normalize(&tabled),
        Err(SpecError::PayoutTableNotWhole {
            entity: id("at"),
            setting_level: setting_level(1),
            sum: 9_000
        })
    );
    let mut stray = made_up_spec();
    stray
        .components
        .window
        .insert(id("grape"), NonZeroU32::new(10).expect("a window"));
    assert_eq!(
        normalize(&stray),
        Err(SpecError::MissingComponent {
            entity: id("grape"),
            component: Component::At
        })
    );
}
