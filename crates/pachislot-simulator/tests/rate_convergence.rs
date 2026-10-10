//! An AT machine's cycles sampled game by game, held to the 機械割 its spec
//! states: regular games drawn until the AT comes — by the game's chance,
//! or on the ceiling — then the AT the engine says that 機械割 implies,
//! over the games its 純増 gives it. Medals out over medals in comes back
//! to the 機械割 within five standard errors.

#![allow(clippy::expect_used, clippy::indexing_slicing)]

#[path = "../../pachislot-engine/tests/support.rs"]
mod support;

use pachislot_domain::conditions::PayoutRate;
use pachislot_domain::normalized::{NormalizedSpec, PayoutLaw};
use pachislot_domain::setting_level::PerSettingLevel;
use pachislot_engine::normalize::normalize;
use pachislot_simulator::rng::{Rng, Seed};
use support::{at_spec, id, medals, setting_level};

const NET: f64 = 4.0;
const BET: f64 = 3.0;
const LOSS: f64 = 50.0 / 40.0;
const CYCLES: u32 = 200_000;

/// The made-up AT machine, its AT's medals to follow from a 機械割 of 97.5%
/// and 110% at 4 medals a game.
fn machine() -> NormalizedSpec {
    let rate = |points| PayoutRate::from_basis_points(points).expect("a rate");
    let mut spec = at_spec();
    spec.components.payout.clear();
    spec.components.net_per_game.insert(id("at"), medals(NET));
    spec.components.rate.insert(
        id("at"),
        PerSettingLevel(vec![
            (setting_level(1), rate(9_750)),
            (setting_level(6), rate(11_000)),
        ]),
    );
    normalize(&spec).expect("a machine")
}

/// The regular games until the AT: each brings it at `chance`, the
/// `ceiling`th certainly.
fn games_to_at(rng: Rng, chance: f64, ceiling: u32) -> (u32, Rng) {
    (1..ceiling)
        .try_fold(rng, |rng, game| {
            let (unit, rng) = rng.next_unit();
            if unit < chance {
                Err((game, rng))
            } else {
                Ok(rng)
            }
        })
        .map_or_else(|won| won, |rng| (ceiling, rng))
}

/// The medals staked and paid out over so many cycles under one setting.
fn sampled_rates(spec: &NormalizedSpec, index: usize) -> (f64, f64) {
    let table = spec.tables[index].at.as_ref().expect("an AT machine");
    let rules = spec.at_rules.as_ref().expect("an AT machine");
    let ceiling = rules.modes[0].ceiling.expect("a ceiling").get();
    let PayoutLaw::Fixed(gain) = table.payout else {
        return (f64::NAN, f64::NAN);
    };
    let at_staked = BET * gain.get() / NET;
    let cycle_rate = |games: u32| {
        let regular = BET * f64::from(games);
        (
            regular - LOSS * f64::from(games) + at_staked + gain.get(),
            regular + at_staked,
        )
    };
    let (out, staked, squares, _) = (0..CYCLES).fold(
        (0.0, 0.0, 0.0, Rng::from_seed(Seed(20_261_009))),
        |(out, staked, squares, rng), _| {
            let (games, rng) = games_to_at(rng, table.chance.value(), ceiling);
            let (paid, bet) = cycle_rate(games);
            (
                out + paid,
                staked + bet,
                squares + f64::from(games).powi(2),
                rng,
            )
        },
    );
    let cycles = f64::from(CYCLES);
    let mean_games = (staked / cycles - at_staked) / BET;
    let deviation = (squares / cycles - mean_games.powi(2)).sqrt();
    let per_game = (LOSS + (out / staked - 1.0) * BET) / (staked / cycles);
    (out / staked, 5.0 * per_game * deviation / cycles.sqrt())
}

#[test]
fn sampled_cycles_come_back_to_the_rate_the_at_was_worked_out_from() {
    let spec = machine();
    for (index, stated) in [(0, 0.975), (1, 1.1)] {
        let (sampled, margin) = sampled_rates(&spec, index);
        assert!(
            (sampled - stated).abs() < margin,
            "setting index {index}: sampled {sampled}, stated {stated}, margin {margin}"
        );
        assert!(margin < 0.005);
    }
}
