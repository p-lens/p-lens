#![allow(clippy::expect_used, clippy::indexing_slicing, clippy::float_cmp)]

mod support;

use std::num::NonZeroU32;

use pachislot_domain::normalized::{AtRules, AtTable, Expiry, Gate, ModeRule};
use pachislot_domain::observation::{AtSeen, Leg, LegEnd, Path, ToldLeg, ToldPath};
use pachislot_domain::probability::Probability;
use pachislot_domain::spec::{Component, Redraw};
use pachislot_engine::at::{Odds, cycle, told_log_likelihood, walk};
use pachislot_engine::error::SpecError;
use pachislot_engine::hunt::hunt;
use pachislot_engine::normalize::normalize;
use support::{
    ceiled, cz_spec, id, mode, mode_spec, one_in, per, rules, setting_level, shares, start, table,
    through,
};

fn near(left: f64, right: f64) -> bool {
    (left - right).abs() <= 1e-9 * left.abs().max(right.abs()).max(1.0)
}

fn gate(game: u32, trigger: f64, at: f64) -> Gate {
    Gate {
        game: NonZeroU32::new(game).expect("a game"),
        trigger: Probability::new(trigger).expect("a share"),
        at: Probability::new(at).expect("a share"),
    }
}

/// A table over the rules' modes at their shares, with zones and the AT
/// also won outright.
fn table_of(
    machine: &AtRules,
    (p, q, d): (f64, f64, f64),
    shares: &[f64],
    gates: &[Vec<Gate>],
) -> AtTable {
    AtTable {
        direct: Probability::new(d).expect("a chance"),
        gates: (0..machine.modes.len())
            .map(|index| gates.get(index).cloned().unwrap_or_default())
            .collect(),
        ..table(p, q, shares.to_vec(), shares.to_vec())
    }
}

/// The same table walked as a chain: every mode winning at the same rate as its own.
fn chained(plain: &AtTable) -> AtTable {
    AtTable {
        successes: plain.gates.iter().map(|_| plain.success).collect(),
        ..plain.clone()
    }
}

/// Machines the chain is held to: ceilings, AT間天井, スルー天井, zones, modes, the AT won outright.
fn machines() -> Vec<(AtRules, AtTable)> {
    let odds = (0.006, 0.35, 0.001);
    let zones = vec![gate(120, 0.4, 0.05), gate(350, 0.5, 0.0)];
    [
        (
            rules(
                Some("cz"),
                through(vec![ceiled("cz", 250, 900)], NonZeroU32::new(3)),
            ),
            vec![1.0],
            vec![],
        ),
        (
            rules(
                Some("cz"),
                through(vec![mode("cz", 300)], NonZeroU32::new(2)),
            ),
            vec![1.0],
            vec![zones.clone()],
        ),
        (
            rules(Some("cz"), vec![mode("cz", 0)]),
            vec![1.0],
            vec![zones.clone()],
        ),
        (
            rules(
                Some("cz"),
                vec![ceiled("a", 100, 400), ceiled("b", 600, 1000)],
            ),
            vec![0.3, 0.7],
            vec![vec![], zones],
        ),
    ]
    .into_iter()
    .map(|(machine, shares, gates)| {
        let held = table_of(&machine, odds, &shares, &gates);
        (machine, held)
    })
    .collect()
}

#[test]
fn a_chain_whose_modes_all_win_at_the_setting_s_rate_comes_to_the_modes_walked_apart() {
    for (number, (machine, plain)) in machines().into_iter().enumerate() {
        let walked = chained(&plain);
        let shares = &plain.allotments.after_at;
        let apart = cycle(&machine, Odds::of(&plain), shares);
        let together = cycle(&machine, Odds::of(&walked), shares);
        assert!(
            near(apart.games, together.games),
            "{} against {}",
            apart.games,
            together.games
        );
        assert!(
            near(apart.triggers, together.triggers),
            "{} against {}",
            apart.triggers,
            together.triggers
        );
        for seat in [
            start(0, 0, 0),
            start(40, 180, 1),
            start(0, 90, 2),
            start(260, 260, 0),
        ] {
            let apart = hunt(seat, &machine, &plain).expect("comes");
            let together = hunt(seat, &machine, &walked).expect("comes");
            assert!(
                near(apart.games, together.games),
                "{number} {seat:?}: {} against {}",
                apart.games,
                together.games
            );
            assert!(
                near(apart.medals, together.medals),
                "{seat:?}: {} against {}",
                apart.medals,
                together.medals
            );
            assert!(
                near(apart.by_ceiling, together.by_ceiling),
                "{seat:?}: {} against {}",
                apart.by_ceiling,
                together.by_ceiling
            );
        }
        for leg in [
            ToldLeg {
                games: 150,
                won: true,
                misses: Some(1),
            },
            ToldLeg {
                games: 150,
                won: true,
                misses: None,
            },
            ToldLeg {
                games: 320,
                won: false,
                misses: Some(2),
            },
            ToldLeg {
                games: 320,
                won: false,
                misses: None,
            },
        ] {
            let told = |held: &AtTable| {
                told_log_likelihood(
                    &ToldPath {
                        after_reset: false,
                        since_at: 20,
                        legs: vec![leg, leg],
                    },
                    &machine,
                    held,
                )
            };
            assert!(
                near(told(&plain), told(&walked)),
                "{leg:?}: {} against {}",
                told(&plain),
                told(&walked)
            );
        }
    }
}

#[test]
fn a_miss_that_moves_play_to_the_other_mode_alternates_their_ceilings() {
    let machine = rules(Some("cz"), vec![mode("a", 100), mode("b", 300)]);
    let q = 0.3;
    let alternating = AtTable {
        redraws: vec![vec![0.0, 1.0], vec![1.0, 0.0]],
        ..table_of(&machine, (0.0, q, 0.0), &[1.0, 0.0], &[])
    };
    let found = cycle(&machine, Odds::of(&alternating), &[1.0, 0.0]);
    let kept = 1.0 - q;
    let games = (100.0 + 300.0 * kept) / (1.0 - kept * kept);
    assert!(near(found.games, games), "{} against {games}", found.games);
    assert!(near(found.triggers, 1.0 / q));
    let hunted = hunt(start(0, 0, 0), &machine, &alternating).expect("comes");
    assert!(
        near(hunted.games, games),
        "{} against {games}",
        hunted.games
    );
    let after_one = hunt(start(0, 100, 1), &machine, &alternating).expect("comes");
    let from_b = (300.0 + 100.0 * kept) / (1.0 - kept * kept);
    assert!(
        near(after_one.games, from_b),
        "{} against {from_b}",
        after_one.games
    );
}

#[test]
fn a_leg_told_every_way_it_could_end_comes_to_certainty_where_misses_move_play() {
    let machine = rules(
        Some("cz"),
        vec![ceiled("a", 150, 700), ceiled("b", 400, 700)],
    );
    let held = AtTable {
        redraws: vec![vec![0.4, 0.6], vec![0.8, 0.2]],
        ..table_of(
            &machine,
            (0.004, 0.35, 0.0005),
            &[0.5, 0.5],
            &[vec![gate(200, 0.3, 0.02)]],
        )
    };
    let likely = |games, won, misses| {
        told_log_likelihood(
            &ToldPath {
                after_reset: false,
                since_at: 0,
                legs: vec![ToldLeg { games, won, misses }],
            },
            &machine,
            &held,
        )
        .exp()
    };
    let won: f64 = (1..=700).map(|games| likely(games, true, None)).sum();
    assert!((won - 1.0).abs() < 1e-9, "{won}");
    let by_misses: f64 = (0..=30).map(|misses| likely(330, true, Some(misses))).sum();
    assert!((by_misses - likely(330, true, None)).abs() < 1e-12);
    let hunted = hunt(start(0, 0, 0), &machine, &held).expect("comes");
    let whole = cycle(&machine, Odds::of(&held), &[0.5, 0.5]);
    assert!(
        near(hunted.games, whole.games),
        "{} against {}",
        hunted.games,
        whole.games
    );
}

/// The made-up machine of modes with a CZ bringing its AT.
fn moded_cz() -> pachislot_domain::spec::Spec {
    let mut spec = mode_spec();
    spec.entities.push(id("cz"));
    spec.components.cz = [id("cz")].into();
    spec.components.label.insert(id("cz"), "CZ".to_owned());
    spec.components.first_hit.remove(&id("at"));
    spec.components
        .first_hit
        .insert(id("cz"), per(one_in(15_000), one_in(12_000)));
    spec.components
        .success
        .insert(id("cz"), shares(3_000, 4_000));
    spec
}

#[test]
fn a_mode_s_redraw_and_its_own_success_are_normalised_setting_by_setting() {
    let mut spec = moded_cz();
    spec.components.redraw.insert(
        id("normal"),
        vec![
            Redraw {
                to: id("heaven"),
                share: shares(2_500, 5_000),
            },
            Redraw {
                to: id("normal"),
                share: shares(7_500, 5_000),
            },
        ],
    );
    spec.components
        .success
        .insert(id("heaven"), shares(6_000, 8_000));
    let normalized = normalize(&spec).expect("normalises");
    let at = |level: usize| normalized.tables[level].at.as_ref().expect("an AT table");
    assert_eq!(at(0).redraws, vec![vec![1.0, 0.0], vec![0.25, 0.75]]);
    assert_eq!(at(1).redraws, vec![vec![1.0, 0.0], vec![0.5, 0.5]]);
    assert!(near(at(0).successes[0].value(), 0.6));
    assert!(near(at(0).successes[1].value(), 0.3));
    assert!(near(at(1).successes[1].value(), 0.4));
}

#[test]
fn a_redraw_goes_to_the_machine_s_modes_in_whole_and_needs_a_cz() {
    let mut astray = moded_cz();
    astray.components.redraw.insert(
        id("normal"),
        vec![Redraw {
            to: id("cz"),
            share: shares(10_000, 10_000),
        }],
    );
    assert_eq!(
        normalize(&astray),
        Err(SpecError::RedrawToUnknown {
            entity: id("normal"),
            to: id("cz")
        })
    );
    let mut short = moded_cz();
    short.components.redraw.insert(
        id("normal"),
        vec![Redraw {
            to: id("heaven"),
            share: shares(2_000, 10_000),
        }],
    );
    assert_eq!(
        normalize(&short),
        Err(SpecError::RedrawNotWhole {
            entity: id("normal"),
            setting_level: setting_level(1),
            sum: 2_000
        })
    );
    let mut alone = mode_spec();
    alone.components.redraw.insert(
        id("normal"),
        vec![Redraw {
            to: id("heaven"),
            share: shares(10_000, 10_000),
        }],
    );
    assert_eq!(
        normalize(&alone),
        Err(SpecError::NeedsCz {
            entity: id("normal"),
            component: Component::Redraw
        })
    );
    let plain = normalize(&cz_spec()).expect("normalises");
    let at = plain.tables[0].at.as_ref().expect("an AT table");
    assert!(at.redraws.is_empty() && at.successes.is_empty());
}

#[test]
fn a_path_walked_where_modes_all_win_at_the_setting_s_rate_comes_to_the_same_and_one_where_misses_move_play_reweighs_them()
 {
    let seen = AtSeen {
        medals: None,
        sets: None,
        completed: None,
        ending: None,
    };
    let legs = [
        (80, LegEnd::Missed),
        (50, LegEnd::WonAt(seen)),
        (100, LegEnd::Going),
    ];
    let path = Path {
        start: start(30, 60, 1),
        legs: legs
            .iter()
            .map(|(games, end)| Leg {
                games: *games,
                end: *end,
            })
            .collect(),
    };
    for (machine, plain) in machines() {
        let (apart, together) = (
            walk(&path, &machine, &plain),
            walk(&path, &machine, &chained(&plain)),
        );
        assert!(
            near(apart.medals, together.medals),
            "{} against {}",
            apart.medals,
            together.medals
        );
        assert!(
            near(apart.log_likelihood, together.log_likelihood),
            "{} against {}",
            apart.log_likelihood,
            together.log_likelihood
        );
    }
    let machine = rules(
        Some("cz"),
        vec![ceiled("a", 150, 700), ceiled("b", 400, 700)],
    );
    let kept = table_of(&machine, (0.004, 0.35, 0.0), &[0.5, 0.5], &[]);
    let moving = AtTable {
        redraws: vec![vec![0.0, 1.0], vec![1.0, 0.0]],
        ..kept.clone()
    };
    let long = Path {
        start: start(0, 0, 0),
        legs: [(200, LegEnd::Missed), (160, LegEnd::Going)]
            .iter()
            .map(|(games, end)| Leg {
                games: *games,
                end: *end,
            })
            .collect(),
    };
    let (still, moved) = (walk(&long, &machine, &kept), walk(&long, &machine, &moving));
    assert!(still.log_likelihood.is_finite(), "{}", still.log_likelihood);
    assert_eq!(moved.log_likelihood, f64::NEG_INFINITY);
}

#[test]
fn a_ceiling_cz_that_misses_moves_play_by_its_own_row() {
    let machine = rules(Some("cz"), vec![mode("long", 600), mode("short", 300)]);
    let q = 0.5;
    let shortened = AtTable {
        redraws: vec![vec![1.0, 0.0], vec![1.0, 0.0]],
        ceiling_redraws: vec![vec![0.0, 1.0], vec![0.0, 1.0]],
        ..table_of(&machine, (0.0, q, 0.0), &[1.0, 0.0], &[])
    };
    let found = cycle(&machine, Odds::of(&shortened), &[1.0, 0.0]);
    let games = 600.0 + (1.0 - q) * 300.0 / q;
    assert!(near(found.games, games), "{} against {games}", found.games);
    let hunted = hunt(start(0, 0, 0), &machine, &shortened).expect("comes");
    assert!(
        near(hunted.games, games),
        "{} against {games}",
        hunted.games
    );
    let by_chance = AtTable {
        ceiling_redraws: Vec::new(),
        own_chances: Vec::new(),
        ..shortened.clone()
    };
    let kept = cycle(&machine, Odds::of(&by_chance), &[1.0, 0.0]);
    assert!(near(kept.games, 600.0 / q), "{}", kept.games);
}

#[test]
fn a_mode_left_after_so_many_games_without_a_trigger_carries_play_on_counting_from_its_trigger() {
    let (high, short) = (0.05, 40_u32);
    let ceiling = 300.0;
    let machine = rules(
        Some("cz"),
        vec![
            ModeRule {
                expiry: Some(Expiry {
                    games: NonZeroU32::new(short).expect("games"),
                    to: 1,
                }),
                ..mode("streak", 0)
            },
            mode("plain", 300),
        ],
    );
    let held = AtTable {
        own_chances: vec![
            Some(Probability::new(high).expect("a chance")),
            Some(Probability::new(0.0).expect("a chance")),
        ],
        ..table_of(&machine, (0.0, 1.0, 0.0), &[1.0, 0.0], &[])
    };
    let found = cycle(&machine, Odds::of(&held), &[1.0, 0.0]);
    let kept = (1.0 - high).powi(i32::try_from(short).expect("games"));
    let games = (1.0 - kept) / high + (ceiling - f64::from(short)) * kept;
    assert!(near(found.games, games), "{} against {games}", found.games);
    let hunted = hunt(start(0, 0, 0), &machine, &held).expect("comes");
    assert!(
        near(hunted.games, games),
        "{} against {games}",
        hunted.games
    );
    let seated = hunt(start(100, 100, 0), &machine, &held).expect("comes");
    assert!(near(seated.games, ceiling - 100.0), "{}", seated.games);
}

#[test]
fn a_mode_that_expires_into_one_like_itself_changes_nothing() {
    let machine = |expiry| {
        rules(
            Some("cz"),
            through(
                vec![
                    ModeRule {
                        expiry,
                        ..ceiled("a", 400, 900)
                    },
                    ceiled("b", 400, 900),
                ],
                NonZeroU32::new(3),
            ),
        )
    };
    let held = AtTable {
        redraws: vec![vec![0.6, 0.4], vec![0.3, 0.7]],
        ..table_of(&machine(None), (0.006, 0.35, 0.001), &[0.5, 0.5], &[])
    };
    let expiring = machine(Some(Expiry {
        games: NonZeroU32::new(120).expect("games"),
        to: 1,
    }));
    let kept = machine(None);
    let (one, other) = (
        cycle(&expiring, Odds::of(&held), &[0.5, 0.5]),
        cycle(&kept, Odds::of(&held), &[0.5, 0.5]),
    );
    assert!(
        near(one.games, other.games),
        "{} against {}",
        one.games,
        other.games
    );
    for seat in [start(0, 0, 0), start(150, 300, 1), start(60, 60, 0)] {
        let (one, other) = (
            hunt(seat, &expiring, &held).expect("comes"),
            hunt(seat, &kept, &held).expect("comes"),
        );
        assert!(
            near(one.games, other.games),
            "{seat:?}: {} against {}",
            one.games,
            other.games
        );
    }
    let path = Path {
        start: start(30, 90, 1),
        legs: [(200, LegEnd::Missed), (150, LegEnd::Going)]
            .iter()
            .map(|(games, end)| Leg {
                games: *games,
                end: *end,
            })
            .collect(),
    };
    let (one, other) = (walk(&path, &expiring, &held), walk(&path, &kept, &held));
    assert!(
        near(one.log_likelihood, other.log_likelihood),
        "{} against {}",
        one.log_likelihood,
        other.log_likelihood
    );
    assert!(
        near(one.medals, other.medals),
        "{} against {}",
        one.medals,
        other.medals
    );
}
