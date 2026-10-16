//! A made-up A-type machine whose figures are worked out by hand: two
//! settings, a BIG, a REG split into 単独 and チェリー重複, ブドウ, チェリー
//! and a replay. Shares are written as percentages so every probability is
//! exact to read.

#![allow(dead_code, clippy::expect_used, clippy::missing_panics_doc)]

use std::num::NonZeroU32;

use pachislot_domain::normalized::{Allotments, AtRules, AtTable, ModeRule, PayoutLaw};
use pachislot_domain::observation::PathStart;
use pachislot_domain::probability::{BasisPoints, Denominator, Probability, ProbabilitySource};
use pachislot_domain::setting_level::{PerSettingLevel, SettingLevel};
use pachislot_domain::spec::{Base, Components, EntityId, Medals, Resources, Spec};

pub fn setting_level(value: u8) -> SettingLevel {
    SettingLevel::new(value).expect("a setting level")
}

pub fn id(name: &str) -> EntityId {
    EntityId::new(name).expect("an id")
}

pub fn medals(value: f64) -> Medals {
    Medals::new(value).expect("medals")
}

pub fn percent(basis_points: u32) -> ProbabilitySource {
    ProbabilitySource::Percent(BasisPoints::new(basis_points).expect("basis points"))
}

pub fn one_in(hundredths: u32) -> ProbabilitySource {
    ProbabilitySource::Ratio {
        numerator: 1,
        denominator: Denominator::from_hundredths(NonZeroU32::new(hundredths).expect("non-zero")),
    }
}

pub fn per(low: ProbabilitySource, high: ProbabilitySource) -> PerSettingLevel<ProbabilitySource> {
    PerSettingLevel(vec![(setting_level(1), low), (setting_level(6), high)])
}

/// Settings 1 and 6.
///
/// | entity | components | 1 | 6 | pays |
/// |---|---|---|---|---|
/// | big | bonus | 1/250 | 1/200 | 240 |
/// | reg | bonus | (its parts) | | 96 |
/// | reg-solo | part of reg | 0.20% | 0.30% | |
/// | reg-cherry | part of reg | 0.05% | 0.10% | |
/// | grape | | 16% | 17% | 8 |
/// | cherry | | 2.5% | 2.5% | 2 |
/// | replay | replay | 13.7% | 13.7% | |
pub fn made_up_spec() -> Spec {
    let names = [
        "big",
        "reg",
        "reg-solo",
        "reg-cherry",
        "grape",
        "cherry",
        "replay",
    ];
    let labels = [
        "BIG",
        "REG",
        "単独REG",
        "チェリー重複REG",
        "ブドウ",
        "チェリー",
        "リプレイ",
    ];
    Spec {
        entities: names.into_iter().map(id).collect(),
        components: Components {
            label: names
                .into_iter()
                .map(id)
                .zip(labels.map(str::to_owned))
                .collect(),
            chance: [
                ("big", per(one_in(25_000), one_in(20_000))),
                ("reg-solo", per(percent(20), percent(30))),
                ("reg-cherry", per(percent(5), percent(10))),
                ("grape", per(percent(1_600), percent(1_700))),
                ("cherry", per(percent(250), percent(250))),
                ("replay", per(percent(1_370), percent(1_370))),
            ]
            .into_iter()
            .map(|(name, chance)| (id(name), chance))
            .collect(),
            payout: [
                ("big", 240.0),
                ("reg", 96.0),
                ("grape", 8.0),
                ("cherry", 2.0),
            ]
            .into_iter()
            .map(|(name, payout)| (id(name), medals(payout)))
            .collect(),
            bonus: [id("big"), id("reg")].into(),
            replay: [id("replay")].into(),
            part_of: [(id("reg-solo"), id("reg")), (id("reg-cherry"), id("reg"))].into(),
            ..Components::default()
        },
        resources: Resources {
            setting_levels: vec![setting_level(1), setting_level(6)],
            bet: NonZeroU32::new(3).expect("a bet"),
            base: None,
            lcd_rate: None,
            cap: None,
        },
    }
}

/// The made-up machine with one more small win, `name`, paying a medal.
pub fn with_role(name: &str, chance: PerSettingLevel<ProbabilitySource>) -> Spec {
    let mut spec = made_up_spec();
    spec.entities.push(id(name));
    spec.components.chance.insert(id(name), chance);
    spec.components.payout.insert(id(name), medals(1.0));
    spec
}

/// The made-up machine watched over its bonuses: a BIG's 20 games for a
/// スイカ, 1/40 and 1/30 a game, and a REG's lamp once, blue or red, 60% and
/// 40% under setting 1, the other way round under 6.
pub fn watched_spec() -> Spec {
    let mut spec = made_up_spec();
    let components = &mut spec.components;
    spec.entities.extend(
        [
            "big-games",
            "big-suika",
            "reg-lamp",
            "lamp-blue",
            "lamp-red",
        ]
        .into_iter()
        .map(id),
    );
    components.watch.insert(id("big-games"), id("big"));
    components.watch.insert(id("reg-lamp"), id("reg"));
    components
        .trials
        .insert(id("big-games"), NonZeroU32::new(20).expect("trials"));
    components.cue.insert(id("big-suika"), id("big-games"));
    components.cue.insert(id("lamp-blue"), id("reg-lamp"));
    components.cue.insert(id("lamp-red"), id("reg-lamp"));
    components
        .chance
        .insert(id("big-suika"), per(one_in(4_000), one_in(3_000)));
    components
        .chance
        .insert(id("lamp-blue"), per(percent(6_000), percent(4_000)));
    components
        .chance
        .insert(id("lamp-red"), per(percent(4_000), percent(6_000)));
    spec
}

pub fn close(left: f64, right: f64) -> bool {
    (left - right).abs() < 1e-9
}

/// A made-up AT machine, settings 1 and 6: its AT published at 1/500 and
/// 1/400, gaining 600 medals, won on the 1000th game at the latest — the
/// 600th after a setting change — and a ベース of 40 games.
pub fn at_spec() -> Spec {
    Spec {
        entities: vec![id("at")],
        components: Components {
            label: [(id("at"), "AT".to_owned())].into(),
            payout: [(id("at"), medals(600.0))].into(),
            at: [id("at")].into(),
            first_hit: [(id("at"), per(one_in(50_000), one_in(40_000)))].into(),
            ceiling: [(id("at"), NonZeroU32::new(1_000).expect("a ceiling"))].into(),
            reset_ceiling: [(id("at"), NonZeroU32::new(600).expect("a ceiling"))].into(),
            ..Components::default()
        },
        resources: Resources {
            setting_levels: vec![setting_level(1), setting_level(6)],
            bet: NonZeroU32::new(3).expect("a bet"),
            base: Some(Base::new(40.0).expect("a base")),
            lcd_rate: None,
            cap: None,
        },
    }
}

pub fn shares(low: u32, high: u32) -> PerSettingLevel<BasisPoints> {
    PerSettingLevel(vec![
        (setting_level(1), BasisPoints::new(low).expect("a share")),
        (setting_level(6), BasisPoints::new(high).expect("a share")),
    ])
}

/// The AT machine with two modes in place of its ceilings: 天国, won by its
/// 100th game, entered after an AT 30% of the time under setting 1 and 50%
/// under setting 6, and always after a setting change; and 通常, won by its
/// 1000th.
pub fn mode_spec() -> Spec {
    let mut spec = at_spec();
    spec.components.ceiling.clear();
    spec.components.reset_ceiling.clear();
    spec.entities.extend([id("heaven"), id("normal")]);
    spec.components.mode = [id("heaven"), id("normal")].into();
    spec.components
        .ceiling
        .insert(id("heaven"), NonZeroU32::new(100).expect("a ceiling"));
    spec.components
        .ceiling
        .insert(id("normal"), NonZeroU32::new(1_000).expect("a ceiling"));
    spec.components
        .allotment
        .insert(id("heaven"), shares(3_000, 5_000));
    spec.components
        .allotment
        .insert(id("normal"), shares(7_000, 5_000));
    spec.components
        .reset_allotment
        .insert(id("heaven"), shares(10_000, 10_000));
    spec.components
        .reset_allotment
        .insert(id("normal"), shares(0, 0));
    spec
}

/// A made-up machine whose AT a CZ brings, settings 1 and 6: the CZ
/// published at 1/150 and 1/120, ceilings included, winning the AT 30% and
/// 40% of the time, certainly on its 600th game — the 300th after a setting
/// change; the AT gaining 600 medals; a ベース of 40 games.
pub fn cz_spec() -> Spec {
    let mut spec = at_spec();
    spec.components.first_hit.clear();
    spec.components.ceiling.clear();
    spec.components.reset_ceiling.clear();
    spec.entities.push(id("cz"));
    spec.components.label.insert(id("cz"), "CZ".to_owned());
    spec.components.cz = [id("cz")].into();
    spec.components
        .first_hit
        .insert(id("cz"), per(one_in(15_000), one_in(12_000)));
    spec.components
        .success
        .insert(id("cz"), shares(3_000, 4_000));
    spec.components
        .ceiling
        .insert(id("cz"), NonZeroU32::new(600).expect("a ceiling"));
    spec.components
        .reset_ceiling
        .insert(id("cz"), NonZeroU32::new(300).expect("a ceiling"));
    spec
}

/// The CZ machine with its スルー天井 drawn after each AT: two, four or six
/// misses, a third of the time each — a mode for each, at the CZ's ceiling
/// of 600 games.
pub fn drawn_misses_spec() -> Spec {
    let mut spec = cz_spec();
    spec.components.ceiling.remove(&id("cz"));
    spec.components.reset_ceiling.clear();
    for (name, misses, share) in [("m2", 2, 3_400), ("m4", 4, 3_300), ("m6", 6, 3_300)] {
        spec.entities.push(id(name));
        spec.components.mode.insert(id(name));
        spec.components
            .ceiling
            .insert(id(name), NonZeroU32::new(600).expect("a ceiling"));
        spec.components
            .misses
            .insert(id(name), NonZeroU32::new(misses).expect("misses"));
        spec.components
            .allotment
            .insert(id(name), shares(share, share));
    }
    spec
}

/// What the AT of the rules built here gains.
pub const PAYOUT: f64 = 600.0;
/// What a regular game loses on a ベース of 40 games.
pub const LOSS: f64 = 50.0 / 40.0;

/// A mode with its trigger's ceiling, none at nought, and no AT間天井.
pub fn mode(name: &str, ceiling: u32) -> ModeRule {
    ModeRule {
        id: id(name),
        ceiling: NonZeroU32::new(ceiling),
        at_ceiling: None,
        misses: None,
        since_at_ceiling: None,
    }
}

/// Modes each given the same スルー天井, or none.
pub fn through(modes: Vec<ModeRule>, misses: Option<NonZeroU32>) -> Vec<ModeRule> {
    modes
        .into_iter()
        .map(|mode| ModeRule { misses, ..mode })
        .collect()
}

/// A mode with an AT間天井 of `at_ceiling` games beside its trigger's ceiling.
pub fn ceiled(name: &str, ceiling: u32, at_ceiling: u32) -> ModeRule {
    ModeRule {
        at_ceiling: NonZeroU32::new(at_ceiling),
        ..mode(name, ceiling)
    }
}

/// The rules of a machine whose trigger is `trigger`, or the AT itself, on
/// a ベース of 40 games.
pub fn rules(trigger: Option<&str>, modes: Vec<ModeRule>) -> AtRules {
    AtRules {
        base: Base::new(40.0).expect("a base"),
        at: id("at"),
        trigger: trigger.map(id),
        modes,
        net_per_game: None,
        cap: None,
        window: None,
        reset_on_cap: false,
        trigger_is_bonus: false,
        trigger_payout: None,
    }
}

/// A setting's table: the trigger's chance below its ceilings, the chance a
/// trigger wins the AT, the allotments, and the AT gaining `PAYOUT`.
pub fn table(chance: f64, success: f64, after_at: Vec<f64>, after_reset: Vec<f64>) -> AtTable {
    AtTable {
        chance: Probability::new(chance).expect("a chance"),
        success: Probability::new(success).expect("a rate"),
        allotments: Allotments {
            after_at,
            after_reset,
        },
        payout: PayoutLaw::Fixed(medals(PAYOUT)),
    }
}

/// Where play was first seen: so many games since the last trigger and AT,
/// so many triggers missed, no setting change, nothing held.
pub fn start(since_trigger: u32, since_at: u32, misses: u32) -> PathStart {
    PathStart {
        since_trigger,
        since_at,
        misses,
        after_reset: false,
        held: None,
    }
}
