#![allow(clippy::expect_used, clippy::indexing_slicing, clippy::float_cmp)]

mod support;

use std::collections::BTreeMap;

use pachislot_domain::conditions::PayoutBasis;
use pachislot_domain::normalized::{AfterEnding, AtRules, AtTable, NormalizedSpec};
use pachislot_domain::observation::PathStart;
use pachislot_domain::probability::BasisPoints;
use pachislot_domain::setting_level::PerSettingLevel;
use pachislot_domain::spec::{Component, Spec};
use pachislot_engine::analysis::analyze;
use pachislot_engine::at::{Odds, cycle};
use pachislot_engine::error::SpecError;
use pachislot_engine::hunt::hunt;
use pachislot_engine::normalize::normalize;
use support::{
    at_spec, drawn_misses_spec, id, medals, mode_spec, per, percent, setting_level, shares, start,
};

fn near(left: f64, right: f64) -> bool {
    (left - right).abs() <= 1e-12 * left.abs().max(right.abs()).max(1.0)
}

/// The machine of two modes — 天国 won by its 100th game, 通常 by its
/// 1000th — whose AT ends at once (駆け抜け) 30% of the time under setting
/// 1 and 40% under 6, and otherwise as ever. After a 駆け抜け play enters
/// 天国 80% of the time under either; after any other end, as the modes'
/// own allotments say: 30% and 50%.
///
/// Mixed, 天国 is entered 0.3 × 80% + 0.7 × 30% = 45% of the time after an
/// AT under setting 1, and 0.4 × 80% + 0.6 × 50% = 62% under 6.
fn ended_spec() -> Spec {
    let mut spec = mode_spec();
    spec.entities.extend([id("through"), id("rest")]);
    spec.components
        .label
        .insert(id("through"), "駆け抜け".to_owned());
    spec.components
        .label
        .insert(id("rest"), "それ以外".to_owned());
    spec.components
        .ending
        .insert(id("through"), shares(3_000, 4_000));
    spec.components
        .ending
        .insert(id("rest"), shares(7_000, 6_000));
    spec.components.ending_allotment.insert(
        id("heaven"),
        BTreeMap::from([(id("through"), shares(8_000, 8_000))]),
    );
    spec.components.ending_allotment.insert(
        id("normal"),
        BTreeMap::from([(id("through"), shares(2_000, 2_000))]),
    );
    spec
}

/// The same machine with one allotment after every AT: the endings' mixed.
fn mixed_spec() -> Spec {
    let mut spec = mode_spec();
    spec.components
        .allotment
        .insert(id("heaven"), shares(4_500, 6_200));
    spec.components
        .allotment
        .insert(id("normal"), shares(5_500, 3_800));
    spec
}

fn normalized(spec: &Spec) -> NormalizedSpec {
    normalize(spec).expect("normalises")
}

fn rules_of(spec: &NormalizedSpec) -> &AtRules {
    spec.at_rules.as_ref().expect("an AT machine")
}

fn table_of(spec: &NormalizedSpec, level: u8) -> &AtTable {
    spec.table(setting_level(level))
        .and_then(|table| table.at.as_ref())
        .expect("an AT table")
}

fn ending_at(ending: usize) -> PathStart {
    PathStart {
        ending: Some(ending),
        ..start(0, 0, 0)
    }
}

#[test]
fn each_ending_keeps_its_share_and_its_allotment_and_after_an_at_is_them_mixed() {
    let spec = normalized(&ended_spec());
    assert_eq!(rules_of(&spec).endings, vec![id("through"), id("rest")]);
    let first = &table_of(&spec, 1).allotments;
    assert_eq!(
        first.after_endings,
        vec![
            AfterEnding {
                share: 0.3,
                after_at: vec![0.8, 0.2],
            },
            AfterEnding {
                share: 0.7,
                after_at: vec![0.3, 0.7],
            },
        ]
    );
    assert!(near(first.after_at[0], 0.45) && near(first.after_at[1], 0.55));
    let sixth = &table_of(&spec, 6).allotments;
    assert!(near(sixth.after_at[0], 0.62) && near(sixth.after_at[1], 0.38));
    assert_eq!(sixth.after_reset, vec![1.0, 0.0]);
}

#[test]
fn a_machine_without_endings_keeps_no_allotment_by_ending() {
    let spec = normalized(&mode_spec());
    assert_eq!(rules_of(&spec).endings, Vec::new());
    assert_eq!(table_of(&spec, 1).allotments.after_endings, Vec::new());
}

#[test]
fn the_cycle_is_the_one_of_the_allotment_mixed_from_the_endings() {
    let ended = normalized(&ended_spec());
    let mixed = normalized(&mixed_spec());
    for level in [1, 6] {
        let (left, right) = (table_of(&ended, level), table_of(&mixed, level));
        assert!(near(left.chance.value(), right.chance.value()));
        let rules = rules_of(&ended);
        let worked = cycle(rules, Odds::of(left), &left.allotments.after_at);
        let alike = cycle(
            rules_of(&mixed),
            Odds::of(right),
            &right.allotments.after_at,
        );
        assert!(
            near(worked.games, alike.games),
            "{} against {}",
            worked.games,
            alike.games
        );
        let p = left.chance.value();
        let lasting = |ceiling: i32| (1.0 - (1.0 - p).powi(ceiling)) / p;
        let heaven = left.allotments.after_at[0];
        assert!(near(
            worked.games,
            heaven * lasting(100) + (1.0 - heaven) * lasting(1_000)
        ));
    }
    let netted = |mut spec: Spec| {
        spec.components.net_per_game.insert(id("at"), medals(3.0));
        normalized(&spec)
    };
    let basis = PayoutBasis::FromSpec;
    let (left, right) = (
        analyze(&netted(ended_spec()), &basis).expect("analysed"),
        analyze(&netted(mixed_spec()), &basis).expect("analysed"),
    );
    left.setting_levels
        .iter()
        .zip(&right.setting_levels)
        .for_each(|(left, right)| {
            assert!(near(left.payout_rate, right.payout_rate));
        });
}

#[test]
fn a_hunt_from_an_ending_is_one_on_the_machine_allotted_as_after_it_alone() {
    let spec = normalized(&ended_spec());
    let rules = rules_of(&spec);
    for (level, ending) in [(1, 0), (1, 1), (6, 0), (6, 1)] {
        let table = table_of(&spec, level);
        let alone = AtTable {
            allotments: pachislot_domain::normalized::Allotments {
                after_at: table.allotments.after_endings[ending].after_at.clone(),
                after_reset: table.allotments.after_reset.clone(),
                after_endings: Vec::new(),
            },
            ..table.clone()
        };
        let mut plain = rules.clone();
        plain.endings.clear();
        for seat in [start(0, 0, 0), start(40, 40, 0), start(300, 300, 0)] {
            let from_ending = hunt(
                PathStart {
                    ending: Some(ending),
                    ..seat
                },
                rules,
                table,
            )
            .expect("comes");
            let on_alone = hunt(seat, &plain, &alone).expect("comes");
            assert_eq!(from_ending, on_alone);
        }
    }
    let table = table_of(&spec, 1);
    let mixed = hunt(start(0, 0, 0), rules, table).expect("comes");
    let through = hunt(ending_at(0), rules, table).expect("comes");
    assert!(through.games < mixed.games);
}

#[test]
fn a_hunt_after_a_setting_change_takes_no_account_of_an_ending() {
    let spec = normalized(&ended_spec());
    let (rules, table) = (rules_of(&spec), table_of(&spec, 1));
    let reset = PathStart {
        after_reset: true,
        ..start(10, 10, 0)
    };
    assert_eq!(
        hunt(
            PathStart {
                ending: Some(0),
                ..reset
            },
            rules,
            table
        ),
        hunt(reset, rules, table)
    );
}

#[test]
fn a_hunt_walked_as_a_chain_starts_from_the_ending_too() {
    let mut spec = drawn_misses_spec();
    spec.components
        .success
        .insert(id("m2"), shares(5_000, 5_000));
    spec.entities.extend([id("through"), id("rest")]);
    spec.components
        .ending
        .insert(id("through"), shares(5_000, 5_000));
    spec.components
        .ending
        .insert(id("rest"), shares(5_000, 5_000));
    for (mode, share) in [("m2", 10_000), ("m4", 0), ("m6", 0)] {
        spec.components.ending_allotment.insert(
            id(mode),
            BTreeMap::from([(id("through"), shares(share, share))]),
        );
    }
    let spec = normalized(&spec);
    let (rules, table) = (rules_of(&spec), table_of(&spec, 1));
    let alone = AtTable {
        allotments: pachislot_domain::normalized::Allotments {
            after_at: vec![1.0, 0.0, 0.0],
            after_reset: table.allotments.after_reset.clone(),
            after_endings: Vec::new(),
        },
        ..table.clone()
    };
    let seat = start(50, 50, 1);
    assert_eq!(
        hunt(
            PathStart {
                ending: Some(0),
                ..seat
            },
            rules,
            table
        ),
        hunt(seat, rules, &alone)
    );
    assert_ne!(hunt(seat, rules, table), hunt(seat, rules, &alone));
}

#[test]
fn endings_need_modes_of_the_machines_own() {
    let mut spec = at_spec();
    spec.entities.push(id("through"));
    spec.components
        .ending
        .insert(id("through"), shares(10_000, 10_000));
    assert_eq!(
        normalize(&spec),
        Err(SpecError::EndingWithoutModes {
            entity: id("through")
        })
    );
}

#[test]
fn endings_share_every_at_between_them() {
    let mut spec = ended_spec();
    spec.components
        .ending
        .insert(id("rest"), shares(6_000, 6_000));
    assert_eq!(
        normalize(&spec),
        Err(SpecError::EndingsNotWhole {
            setting_level: setting_level(1),
            sum: 9_000
        })
    );
}

#[test]
fn an_allotment_after_an_ending_the_machine_lacks_is_refused() {
    let mut spec = ended_spec();
    spec.components.ending_allotment.insert(
        id("normal"),
        BTreeMap::from([(id("upper"), shares(2_000, 2_000))]),
    );
    assert_eq!(
        normalize(&spec),
        Err(SpecError::EndingAllotmentToUnknown {
            entity: id("normal"),
            ending: id("upper")
        })
    );
}

#[test]
fn the_modes_after_an_ending_are_allotted_the_whole_of_play() {
    let mut spec = ended_spec();
    spec.components.ending_allotment.remove(&id("normal"));
    assert_eq!(
        normalize(&spec),
        Err(SpecError::EndingAllotmentNotWhole {
            ending: id("through"),
            setting_level: setting_level(1),
            sum: 8_000 + 7_000
        })
    );
}

#[test]
fn endings_that_allot_nothing_otherwise_are_refused() {
    let mut spec = ended_spec();
    spec.components.ending_allotment.clear();
    assert_eq!(
        normalize(&spec),
        Err(SpecError::EndingsWithoutAllotment {
            entity: id("through")
        })
    );
}

#[test]
fn an_ending_is_its_share_and_a_label_and_an_allotment_by_ending_a_modes() {
    let mut on_at = ended_spec();
    on_at.components.ending_allotment.insert(
        id("at"),
        BTreeMap::from([(id("through"), shares(2_000, 2_000))]),
    );
    assert_eq!(
        normalize(&on_at),
        Err(SpecError::MissingComponent {
            entity: id("at"),
            component: Component::Mode
        })
    );
    let mut with_chance = ended_spec();
    with_chance
        .components
        .chance
        .insert(id("through"), per(percent(100), percent(100)));
    assert_eq!(
        normalize(&with_chance),
        Err(SpecError::ConflictingComponents {
            entity: id("through"),
            first: Component::Ending,
            second: Component::Chance
        })
    );
    let mut lacking = ended_spec();
    lacking.components.ending.insert(
        id("rest"),
        PerSettingLevel(vec![(
            setting_level(1),
            BasisPoints::new(7_000).expect("a share"),
        )]),
    );
    assert_eq!(
        normalize(&lacking),
        Err(SpecError::MissingSettingLevel {
            at: id("rest"),
            setting_level: setting_level(6)
        })
    );
}
