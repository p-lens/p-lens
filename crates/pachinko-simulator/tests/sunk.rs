#![allow(clippy::expect_used)]

use std::num::NonZeroU64;

use pachinko_domain::normalized::{NormalizedSpec, Outcome, Reward, Target};
use pachinko_domain::probability::Probability;
use pachinko_domain::version::SchemaVersion;
use pachinko_simulator::combo::PayoutYield;
use pachinko_simulator::rng::Seed;
use pachinko_simulator::sunk::{
    Sunk, SunkSetup, Way, advance_sunk, dry_one_in, mean_outlay, outlay_at, way_of,
};

/// A machine solvable by hand: one jackpot in 1,000 spins, ten rounds of
/// 1,400 balls, and straight back to the regular game.
fn plain() -> NormalizedSpec {
    NormalizedSpec {
        schema_version: SchemaVersion::CURRENT,
        hit_chance: Probability::new(1.0 / 1000.0).expect("a chance"),
        entry: vec![Outcome {
            probability: Probability::new(1.0).expect("certain"),
            reward: Reward {
                rounds: 10,
                hits: 1,
                balls: 1400,
            },
            next: Target::End,
            fills: None,
        }],
        states: Vec::new(),
        origins: Vec::new(),
        net_balls_per_round: 140,
        relief_drive: None,
    }
}

/// A day of 1,000 spins at 25 for ¥1,000: ten balls a spin.
fn setup(since_last: Option<u64>) -> SunkSetup {
    SunkSetup {
        spins: 1000,
        jackpots: 1,
        since_last,
        spin_performance: 25.0,
        rented_per_thousand: 250.0,
        payout: PayoutYield::AS_SPECIFIED,
    }
}

fn run(setup: &SunkSetup, way: Way) -> Sunk {
    let trials = NonZeroU64::new(400_000).expect("trials");
    advance_sunk(
        &plain(),
        setup,
        way,
        (trials, trials),
        &Sunk::start(Seed(7)),
        trials,
    )
}

/// Its one jackpot 200 spins from the end came at the 800th: 8,000 balls
/// in cash up to it, 64 lots; 2,000 after it, of which its 1,400 pay all
/// but 600, five lots more. ¥34,500, to the yen where the last jackpot is
/// pinned there, and give or take the counter's glance where it is searched for.
#[test]
fn a_jackpot_long_before_the_end_leaves_the_spins_after_it_mostly_in_cash() {
    let setup = setup(Some(200));
    let way = way_of(&plain(), &setup);
    let pinned = run(&setup, way);
    assert_eq!(way, Way::Pinned { since_last: 200 });
    assert!(pinned.tally.matched > 150_000, "{}", pinned.tally.matched);
    assert_eq!(
        outlay_at(&pinned.tally, &setup, way, &[0.0, 1.0]),
        Some(vec![34_500, 34_500])
    );
    let searched = run(&setup, Way::Searched);
    let middle = outlay_at(&searched.tally, &setup, Way::Searched, &[0.5]).expect("an outlay");
    assert!(searched.tally.matched > 1000, "{}", searched.tally.matched);
    assert!(
        middle
            .first()
            .is_some_and(|&yen| yen.abs_diff(34_500) <= 1_000),
        "{middle:?}"
    );
}

/// Its one jackpot anywhere alike: 5,000 balls before it on average, and
/// after it what its 1,400 do not pay, 3,702 on average — 69.6 lots, and
/// half a lot more each side for buying whole ones.
#[test]
fn a_jackpot_told_without_where_is_taken_anywhere_alike() {
    let setup = setup(None);
    assert_eq!(way_of(&plain(), &setup), Way::Searched);
    let sunk = run(&setup, Way::Searched);
    let mean = mean_outlay(&sunk.tally, &setup, Way::Searched).expect("an outlay");
    assert!((mean - 35_250.0).abs() < 800.0, "{mean}");
}

/// A thousand spins without a jackpot at one in a thousand: once in (1000/999)^1000, e.
#[test]
fn how_seldom_a_dry_spell_comes_is_known_exactly() {
    let dry = SunkSetup {
        jackpots: 0,
        ..setup(None)
    };
    assert_eq!(way_of(&plain(), &dry), Way::Dry);
    let one_in = dry_one_in(&plain(), &dry, Way::Dry).expect("known");
    assert!((one_in - 2.7196).abs() < 1e-3, "{one_in}");
}
