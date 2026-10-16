#![allow(clippy::expect_used, clippy::indexing_slicing)]

mod support;

use std::num::NonZeroU32;

use pachislot_domain::probability::{Denominator, ProbabilitySource};
use pachislot_domain::setting_level::PerSettingLevel;
use pachislot_domain::spec::Component;
use pachislot_engine::error::{ProbabilityProblem, SpecError};
use pachislot_engine::normalize::normalize;
use support::{
    id, made_up_spec, medals, one_in, per, percent, setting_level, watched_spec, with_role,
};

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

#[test]
fn a_watch_normalises_into_its_rule_and_each_settings_cues() {
    let normalized = normalize(&watched_spec()).expect("normalises");
    let rules = normalized
        .watches
        .iter()
        .map(|watch| {
            (
                watch.id.as_str(),
                watch.bonus.as_str(),
                watch.trials.get(),
                watch.whole,
            )
        })
        .collect::<Vec<_>>();
    assert_eq!(
        rules,
        vec![
            ("big-games", "big", 20, false),
            ("reg-lamp", "reg", 1, true)
        ]
    );
    let cues = normalized.tables[1]
        .cues
        .iter()
        .map(|cue| (cue.id.as_str(), cue.watch.as_str(), cue.chance.value()))
        .collect::<Vec<_>>();
    assert_eq!(
        cues,
        vec![
            ("big-suika", "big-games", 1.0 / 30.0),
            ("lamp-blue", "reg-lamp", 0.4),
            ("lamp-red", "reg-lamp", 0.6)
        ]
    );
    assert!(
        normalized.tables[0]
            .events
            .iter()
            .all(|event| event.id != id("big-suika") && event.id != id("big-games"))
    );
}

#[test]
fn a_watch_is_over_a_bonus_and_has_a_cue() {
    let mut astray = watched_spec();
    astray.components.watch.insert(id("big-games"), id("grape"));
    assert_eq!(
        normalize(&astray),
        Err(SpecError::WatchOfNonBonus {
            entity: id("big-games"),
            of: id("grape")
        })
    );
    let mut bare = watched_spec();
    bare.components.cue.remove(&id("big-suika"));
    bare.components.chance.remove(&id("big-suika"));
    bare.entities.retain(|entity| entity != &id("big-suika"));
    assert_eq!(
        normalize(&bare),
        Err(SpecError::MissingComponent {
            entity: id("big-games"),
            component: Component::Cue
        })
    );
}

#[test]
fn a_cue_belongs_to_a_watch_and_trials_to_one() {
    let mut astray = watched_spec();
    astray.components.cue.insert(id("lamp-red"), id("big"));
    assert_eq!(
        normalize(&astray),
        Err(SpecError::CueOfNonWatch {
            entity: id("lamp-red"),
            of: id("big")
        })
    );
    let mut stray = watched_spec();
    stray
        .components
        .trials
        .insert(id("big"), NonZeroU32::new(2).expect("trials"));
    assert_eq!(
        normalize(&stray),
        Err(SpecError::MissingComponent {
            entity: id("big"),
            component: Component::Watch
        })
    );
}

#[test]
fn a_watchs_cues_never_exceed_certainty_and_are_certain_under_every_setting_or_none() {
    let mut beyond = watched_spec();
    beyond
        .components
        .chance
        .insert(id("lamp-red"), per(percent(4_100), percent(6_000)));
    assert!(matches!(
        normalize(&beyond),
        Err(SpecError::CuesExceedOne { entity, setting_level: s, .. }) if entity == id("reg-lamp") && s == setting_level(1)
    ));
    let mut partly = watched_spec();
    partly
        .components
        .chance
        .insert(id("lamp-red"), per(percent(3_900), percent(6_000)));
    assert_eq!(
        normalize(&partly),
        Err(SpecError::WatchPartlyWhole {
            entity: id("reg-lamp")
        })
    );
}
