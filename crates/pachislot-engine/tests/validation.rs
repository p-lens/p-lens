#![allow(clippy::expect_used)]

mod support;

use std::num::NonZeroU32;

use pachislot_domain::probability::{Denominator, ProbabilitySource};
use pachislot_domain::setting_level::PerSettingLevel;
use pachislot_domain::spec::Component;
use pachislot_engine::error::{ProbabilityProblem, SpecError};
use pachislot_engine::normalize::normalize;
use support::{id, medals, one_in, per, percent, made_up_spec, setting_level, with_role};

#[test]
fn the_made_up_normalises_into_one_table_per_setting() {
    let spec = normalize(&made_up_spec()).expect("normalises");
    assert_eq!(spec.bet, 3);
    assert_eq!(
        spec.setting_levels().collect::<Vec<_>>(),
        vec![setting_level(1), setting_level(6)]
    );
    let low = spec.table(setting_level(1)).expect("setting level 1");
    assert_eq!(
        low.events
            .iter()
            .map(|event| event.id.as_str())
            .collect::<Vec<_>>(),
        vec!["big", "reg-solo", "reg-cherry", "grape", "cherry", "replay"]
    );
    assert!(
        low.events
            .iter()
            .any(|event| event.id == id("reg-cherry") && event.group == Some(id("reg")))
    );
}

#[test]
fn a_machine_needs_settings_and_lists_each_once() {
    let mut none = made_up_spec();
    none.resources.setting_levels = vec![];
    assert_eq!(normalize(&none), Err(SpecError::NoSettingLevels));
    let mut twice = made_up_spec();
    twice.resources.setting_levels = vec![setting_level(1), setting_level(6), setting_level(1)];
    assert_eq!(
        normalize(&twice),
        Err(SpecError::DuplicateSettingLevel {
            at: None,
            setting_level: setting_level(1)
        })
    );
}

#[test]
fn every_chance_covers_exactly_the_machines_settings() {
    assert_eq!(
        normalize(&with_role(
            "bell",
            PerSettingLevel(vec![(setting_level(1), percent(10))])
        )),
        Err(SpecError::MissingSettingLevel {
            at: id("bell"),
            setting_level: setting_level(6)
        })
    );
    assert_eq!(
        normalize(&with_role(
            "bell",
            PerSettingLevel(vec![
                (setting_level(1), percent(10)),
                (setting_level(6), percent(10)),
                (setting_level(3), percent(10))
            ]),
        )),
        Err(SpecError::UnknownSettingLevel {
            at: id("bell"),
            setting_level: setting_level(3)
        })
    );
    assert_eq!(
        normalize(&with_role(
            "bell",
            PerSettingLevel(vec![
                (setting_level(1), percent(10)),
                (setting_level(1), percent(10)),
                (setting_level(6), percent(10))
            ]),
        )),
        Err(SpecError::DuplicateSettingLevel {
            at: Some(id("bell")),
            setting_level: setting_level(1)
        })
    );
}

#[test]
fn an_entity_is_listed_once_and_every_component_names_one_the_world_has() {
    let mut twice = made_up_spec();
    twice.entities.push(id("grape"));
    assert_eq!(
        normalize(&twice),
        Err(SpecError::DuplicateEntity {
            entity: id("grape")
        })
    );
    let mut stray = made_up_spec();
    stray.components.payout.insert(id("bell"), medals(1.0));
    assert_eq!(
        normalize(&stray),
        Err(SpecError::StrayComponent {
            entity: id("bell"),
            component: Component::Payout
        })
    );
}

#[test]
fn an_entity_needs_a_chance_and_a_small_win_its_payout() {
    let mut chanceless = made_up_spec();
    chanceless.components.chance.remove(&id("grape"));
    assert_eq!(
        normalize(&chanceless),
        Err(SpecError::MissingComponent {
            entity: id("grape"),
            component: Component::Chance
        })
    );
    let mut unpaid = made_up_spec();
    unpaid.components.payout.remove(&id("grape"));
    assert_eq!(
        normalize(&unpaid),
        Err(SpecError::MissingComponent {
            entity: id("grape"),
            component: Component::Payout
        })
    );
    let mut empty = made_up_spec();
    empty.components.part_of.clear();
    assert_eq!(
        normalize(&empty),
        Err(SpecError::MissingComponent {
            entity: id("reg"),
            component: Component::Chance
        })
    );
}

#[test]
fn components_that_cannot_go_together_are_pointed_at() {
    let mut replayed = made_up_spec();
    replayed.components.replay.insert(id("big"));
    assert_eq!(
        normalize(&replayed),
        Err(SpecError::ConflictingComponents {
            entity: id("big"),
            first: Component::Bonus,
            second: Component::Replay
        })
    );
    let mut both = made_up_spec();
    both.components
        .chance
        .insert(id("reg"), per(percent(25), percent(40)));
    assert_eq!(
        normalize(&both),
        Err(SpecError::ConflictingComponents {
            entity: id("reg"),
            first: Component::Chance,
            second: Component::PartOf
        })
    );
    let mut paid_part = made_up_spec();
    paid_part
        .components
        .payout
        .insert(id("reg-solo"), medals(96.0));
    assert_eq!(
        normalize(&paid_part),
        Err(SpecError::ConflictingComponents {
            entity: id("reg-solo"),
            first: Component::PartOf,
            second: Component::Payout
        })
    );
}

#[test]
fn a_part_belongs_to_a_bonus() {
    let mut astray = made_up_spec();
    astray
        .components
        .part_of
        .insert(id("reg-cherry"), id("grape"));
    assert_eq!(
        normalize(&astray),
        Err(SpecError::PartOfNonBonus {
            entity: id("reg-cherry"),
            of: id("grape")
        })
    );
}

#[test]
fn a_ratio_above_one_is_pointed_at() {
    let above = ProbabilitySource::Ratio {
        numerator: 3,
        denominator: Denominator::from_hundredths(NonZeroU32::new(200).expect("non-zero")),
    };
    assert_eq!(
        normalize(&with_role("bell", per(above, one_in(100)))),
        Err(SpecError::InvalidProbability {
            at: id("bell"),
            setting_level: setting_level(1),
            problem: ProbabilityProblem::OutOfRange
        })
    );
}

#[test]
fn a_game_cannot_come_up_with_more_than_certainty() {
    assert!(matches!(
        normalize(&with_role("bell", per(percent(7_000), percent(10)))),
        Err(SpecError::ProbabilitiesExceedOne { setting_level: s, .. }) if s == setting_level(1)
    ));
}
