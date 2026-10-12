#![allow(clippy::expect_used)]

use std::num::NonZeroU64;

use pachinko_domain::conditions::BallValue;
use pachinko_domain::normalized::{NormalizedSpec, Outcome, Reward, Target};
use pachinko_domain::probability::Probability;
use pachinko_domain::version::SchemaVersion;
use pachinko_simulator::inference::{
    Belief, Inference, InferenceSetup, Reading, Told, Way, advance_inference,
};
use pachinko_simulator::rng::Seed;

/// A machine solvable by hand: one jackpot in `one_in` spins, ten rounds of
/// 1,400 balls, and straight back to the regular game.
fn plain(one_in: f64) -> NormalizedSpec {
    NormalizedSpec {
        schema_version: SchemaVersion::CURRENT,
        hit_chance: Probability::new(1.0 / one_in).expect("a chance"),
        entry: vec![Outcome {
            probability: Probability::new(1.0).expect("certain"),
            reward: Reward {
                rounds: 10,
                hits: 1,
                balls: 1400,
            },
            next: Target::End,
        }],
        states: Vec::new(),
        origins: Vec::new(),
        net_balls_per_round: 140,
        relief_drive: None,
    }
}

/// A belief wide enough to be moved: about 18, give or take 4.
fn setup(told: Told) -> InferenceSetup {
    InferenceSetup {
        told,
        belief: Belief {
            mean: 18.0,
            deviation: 4.0,
        },
        spins_per_hour: 200.0,
        rented_per_thousand: 250.0,
        ball_value: BallValue::new(100.0 / 28.0).expect("a value"),
        payout_scale: 1.0,
        balls_per_spin: 14.0,
    }
}

fn read(spec: &NormalizedSpec, setup: &InferenceSetup, seed: u64) -> Reading {
    let trials = NonZeroU64::new(40_000).expect("trials");
    advance_inference(spec, setup, trials, &Inference::start(Seed(seed)), trials)
        .tally
        .reading()
        .expect("a reading")
}

fn told(hours: f64, outlay: f64, takings: f64) -> Told {
    Told {
        hours,
        outlay,
        takings,
        jackpots: None,
    }
}

#[test]
fn a_play_that_never_hit_gives_the_spins_its_hours_bought_over_its_cash() {
    let never = plain(1_000_000.0);
    let lean = read(&never, &setup(told(3.0, 40_000.0, 0.0)), 1);
    assert!((lean.middle - 15.0).abs() < 0.6, "{lean:?}");
    let fat = read(&never, &setup(told(3.0, 30_000.0, 0.0)), 1);
    assert!((fat.middle - 20.0).abs() < 0.6, "{fat:?}");
    assert!((lean.spins - 600.0).abs() < 1.0, "{lean:?}");
}

#[test]
fn more_cash_for_the_same_hours_is_a_worse_cabinet() {
    let machine = plain(100.0);
    let cheap = read(&machine, &setup(told(4.0, 10_000.0, 20_000.0)), 2);
    let dear = read(&machine, &setup(told(4.0, 40_000.0, 20_000.0)), 2);
    assert!(dear.middle < cheap.middle, "{dear:?} {cheap:?}");
}

#[test]
fn a_readings_quartiles_stand_either_side_of_its_middle() {
    let reading = read(&plain(100.0), &setup(told(4.0, 20_000.0, 10_000.0)), 3);
    assert!(reading.lower < reading.middle && reading.middle < reading.upper);
}

#[test]
fn a_play_carried_by_its_winnings_says_less_than_one_that_never_hit() {
    let spread = |reading: Reading| reading.upper - reading.lower;
    let lost = read(&plain(1_000_000.0), &setup(told(3.0, 40_000.0, 0.0)), 4);
    let won = read(&plain(100.0), &setup(told(4.0, 1_000.0, 30_000.0)), 4);
    assert!(spread(won) > 2.0 * spread(lost), "{won:?} {lost:?}");
}

#[test]
fn the_jackpots_told_narrow_it() {
    let machine = plain(100.0);
    let bare = read(&machine, &setup(told(5.0, 20_000.0, 15_000.0)), 5);
    let fuller = read(
        &machine,
        &setup(Told {
            jackpots: Some(8),
            ..told(5.0, 20_000.0, 15_000.0)
        }),
        5,
    );
    assert!(
        fuller.upper - fuller.lower < bare.upper - bare.lower,
        "{fuller:?} {bare:?}"
    );
}

#[test]
fn the_same_seed_reads_the_same_and_chunks_change_nothing() {
    let machine = plain(100.0);
    let setup = setup(told(4.0, 20_000.0, 10_000.0));
    let trials = NonZeroU64::new(6_000).expect("trials");
    let whole = advance_inference(&machine, &setup, trials, &Inference::start(Seed(9)), trials);
    let chunk = NonZeroU64::new(1_000).expect("chunk");
    let chunked = (0..6).fold(Inference::start(Seed(9)), |inference, _| {
        advance_inference(&machine, &setup, trials, &inference, chunk)
    });
    assert_eq!(whole, chunked);
    assert!(chunked.is_finished(trials));
}

#[test]
fn a_play_far_out_of_the_ordinary_is_one_few_trials_went_as_far_as_and_says_which_way() {
    let machine = plain(100.0);
    let trials = NonZeroU64::new(40_000).expect("trials");
    let rarest = |told: Told| {
        advance_inference(
            &machine,
            &setup(told),
            trials,
            &Inference::start(Seed(6)),
            trials,
        )
        .tally
        .beyond
        .rarest()
    };
    let (ordinary, _) = rarest(told(4.0, 20_000.0, 15_000.0));
    let (lucky, lucky_way) = rarest(told(4.0, 2_000.0, 150_000.0));
    let (impossible, impossible_way) = rarest(told(1.0, 100_000.0, 0.0));
    assert!(ordinary > 4_000, "{ordinary}");
    assert!(lucky < 40, "{lucky}");
    assert!(matches!(
        lucky_way,
        Way::TakingsAtLeast | Way::ResultAtLeast
    ));
    assert_eq!((impossible, impossible_way), (0, Way::OutlayAtLeast));
}

#[test]
fn a_loss_that_brought_nothing_back_is_an_ordinary_play() {
    let trials = NonZeroU64::new(40_000).expect("trials");
    let (rarest, _) = advance_inference(
        &plain(319.7),
        &setup(told(0.25, 3_000.0, 0.0)),
        trials,
        &Inference::start(Seed(8)),
        trials,
    )
    .tally
    .beyond
    .rarest();
    assert!(rarest > 4_000, "{rarest}");
}

#[test]
fn what_a_play_was_worth_is_each_trials_own_and_the_middle_of_those() {
    let reading = read(&plain(1_000_000.0), &setup(told(3.0, 40_000.0, 0.0)), 1);
    let at_the_middle = (14.0 * 100.0 / 28.0 - 1000.0 / reading.middle) * reading.spins;
    assert!((reading.value - at_the_middle).abs() < 500.0, "{reading:?}");
}
