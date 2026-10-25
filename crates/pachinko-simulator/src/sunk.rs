//! ハマり台の投資額, sampled: what a cabinet took in cash on the day its data
//! counter shows. A day is played out over the counter's regular spins at a
//! spin performance, the balls in hand played first and cash going in a lot
//! at a time for the rest, every combo's balls played back in; the days
//! whose jackpots are the counter's are what the cabinet is taken to have
//! done. Whatever order its jackpots came in, and whatever they paid, is in
//! the days that match, and nowhere else.
//!
//! A machine with no 遊タイム forgets, spin by spin, how long it has gone
//! without a jackpot, and that is used where the counter says when the last
//! jackpot came: a day is played out with it there (`Way::Pinned`), and the
//! spins after it without one, which every such day has. Each is as likely
//! as any other to have been the counter's day, so the days that match are
//! the counter's as they would be found by searching, many times as often.
//! A counter of no jackpot on such a machine is one day only (`Way::Dry`).

use std::collections::BTreeMap;
use std::num::NonZeroU64;

use pachinko_domain::normalized::NormalizedSpec;

use crate::combo::{PayoutYield, ReliefGauge, WaitEnd, combo_following, gauge_after, wait_from};
use crate::rng::{Rng, Seed};

/// Cash goes in by this many yen at a time.
const LOT_YEN: u64 = 500;

/// What a cabinet's data counter shows, and how it is played out.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SunkSetup {
    /// Regular spins the counter shows for the day.
    pub spins: u64,
    /// Jackpots the counter shows for the day, each of a combo counted.
    pub jackpots: u64,
    /// Regular spins since the last jackpot, where the counter was read for them.
    pub since_last: Option<u64>,
    /// Spins for ¥1,000.
    pub spin_performance: f64,
    /// Balls ¥1,000 rents.
    pub rented_per_thousand: f64,
    pub payout: PayoutYield,
}

/// How a counter is played out.
///
/// - `Dry`: no jackpot on a machine with no 遊タイム — one day, its spins
///   all in cash, nothing to sample.
/// - `Pinned`: the last jackpot where the counter says, on a machine with
///   no 遊タイム; the days are sampled for the jackpots alone.
/// - `Searched`: days played out freely and kept where they match the
///   counter — its jackpots, and its spins since the last to a glance.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Way {
    Dry,
    Pinned { since_last: u64 },
    Searched,
}

/// How a counter is played out on a machine.
pub fn way_of(spec: &NormalizedSpec, setup: &SunkSetup) -> Way {
    let forgets = spec.relief_drive.is_none();
    match (forgets, setup.jackpots, setup.since_last) {
        (true, 0, since) if since.is_none_or(|since| since == setup.spins) => Way::Dry,
        (true, 1.., Some(since_last)) if since_last < setup.spins => Way::Pinned { since_last },
        _ => Way::Searched,
    }
}

#[allow(clippy::cast_precision_loss)]
fn real(value: u64) -> f64 {
    value as f64
}

/// A day part-way through its spins.
#[derive(Clone, Copy)]
struct Day {
    spins_left: u64,
    balls: f64,
    lots: u64,
    jackpots: u64,
    since_last: u64,
    gauge: ReliefGauge,
    rng: Rng,
    over: bool,
}

/// What one day played out came to.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Played {
    lots: u64,
    jackpots: u64,
    since_last: u64,
}

/// The balls in hand and the lots bought after spins costing `needed` balls:
/// what is in hand is played first, and cash goes in a lot at a time for the rest.
fn paid(balls: f64, lots: u64, needed: f64, lot_balls: f64) -> (f64, u64) {
    if balls >= needed {
        (balls - needed, lots)
    } else {
        let more = ((needed - balls) / lot_balls).ceil();
        #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
        let bought = more.max(0.0) as u64;
        (balls + more * lot_balls - needed, lots + bought)
    }
}

fn lot_balls(setup: &SunkSetup) -> f64 {
    setup.rented_per_thousand * real(LOT_YEN) / 1000.0
}

/// A day after so many more regular spins, paid for.
fn spun(setup: &SunkSetup, day: &Day, spins: u64) -> Day {
    let (balls, lots) = paid(
        day.balls,
        day.lots,
        real(spins) * setup.rented_per_thousand / setup.spin_performance,
        lot_balls(setup),
    );
    Day {
        spins_left: day.spins_left.saturating_sub(spins),
        balls,
        lots,
        since_last: day.since_last + spins,
        ..*day
    }
}

/// The day one wait further on: the regular spins until a jackpot — or until
/// its spins run out — and the combo that follows.
fn next(spec: &NormalizedSpec, setup: &SunkSetup, day: &Day) -> Option<Day> {
    if day.over {
        return None;
    }
    let (wait, rng) = wait_from(spec, day.gauge, day.rng);
    let played = wait.spins.min(day.spins_left);
    let after = Day {
        rng,
        ..spun(setup, day, played)
    };
    if played < wait.spins {
        return Some(Day {
            over: true,
            ..after
        });
    }
    let (combo, rng) = combo_following(spec, wait.end, rng);
    Some(Day {
        balls: after.balls + combo.gained(setup.payout),
        jackpots: after.jackpots + combo.hits,
        since_last: if combo.hits > 0 { 0 } else { after.since_last },
        gauge: gauge_after(wait.end, &combo),
        rng,
        over: after.spins_left == 0,
        ..after
    })
}

/// A day played freely over so many spins.
fn played_freely(spec: &NormalizedSpec, setup: &SunkSetup, spins: u64, rng: Rng) -> Day {
    let start = Day {
        spins_left: spins,
        balls: 0.0,
        lots: 0,
        jackpots: 0,
        since_last: 0,
        gauge: ReliefGauge::default(),
        rng,
        over: spins == 0,
    };
    std::iter::successors(Some(start), |day| next(spec, setup, day))
        .last()
        .unwrap_or(start)
}

/// A day with its last jackpot where the counter says: played freely up to
/// the spin before it, that spin a jackpot and its combo, and the spins
/// after it without one.
fn played_pinned(spec: &NormalizedSpec, setup: &SunkSetup, since_last: u64, rng: Rng) -> Day {
    let before = played_freely(spec, setup, setup.spins - since_last - 1, rng);
    let hit = spun(setup, &before, 1);
    let (combo, rng) = combo_following(spec, WaitEnd::Jackpot, before.rng);
    let won = Day {
        balls: hit.balls + combo.gained(setup.payout),
        jackpots: hit.jackpots + combo.hits,
        since_last: 0,
        rng,
        ..hit
    };
    spun(setup, &won, since_last)
}

fn play(spec: &NormalizedSpec, setup: &SunkSetup, way: Way, rng: Rng) -> (Played, Rng) {
    let end = match way {
        Way::Pinned { since_last } => played_pinned(spec, setup, since_last, rng),
        Way::Dry | Way::Searched => played_freely(spec, setup, setup.spins, rng),
    };
    (
        Played {
            lots: end.lots,
            jackpots: end.jackpots,
            since_last: end.since_last,
        },
        end.rng,
    )
}

/// How far from the counter's spins since the last jackpot a searched day's
/// may be and still be the same: a person reads the counter at a glance,
/// and the cabinet goes on spinning while they look.
fn since_tolerance(since_last: u64) -> u64 {
    (since_last / 20).max(10)
}

/// Whether a day played out is the one the counter shows.
fn matches(played: &Played, setup: &SunkSetup, way: Way) -> bool {
    played.jackpots == setup.jackpots
        && (way != Way::Searched
            || setup.since_last.is_none_or(|since_last| {
                played.since_last.abs_diff(since_last) <= since_tolerance(since_last)
            }))
}

/// Days played out so far: how many, how many matched the counter, and the
/// lots each of those took, counted by how many.
///
/// The fields are open so a run in progress can be carried across a boundary
/// and resumed; they stay consistent only when built up through `with`.
#[derive(Clone, Debug, PartialEq, Default)]
pub struct SunkTally {
    pub trials: u64,
    pub matched: u64,
    pub lots: BTreeMap<u64, u64>,
}

impl SunkTally {
    #[must_use]
    fn with(self, played: &Played, setup: &SunkSetup, way: Way) -> Self {
        if !matches(played, setup, way) {
            return Self {
                trials: self.trials + 1,
                ..self
            };
        }
        let mut lots = self.lots;
        *lots.entry(played.lots).or_insert(0) += 1;
        Self {
            trials: self.trials + 1,
            matched: self.matched + 1,
            lots,
        }
    }
}

/// The cash a day with no jackpot took: its spins, all of them on rented balls.
fn dry_lots(setup: &SunkSetup) -> u64 {
    paid(
        0.0,
        0,
        real(setup.spins) * setup.rented_per_thousand / setup.spin_performance,
        lot_balls(setup),
    )
    .1
}

/// The lots the days took, counted by how many: the one dry day, or the days that matched.
fn lots_of(tally: &SunkTally, setup: &SunkSetup, way: Way) -> (BTreeMap<u64, u64>, u64) {
    match way {
        Way::Dry => (BTreeMap::from([(dry_lots(setup), 1)]), 1),
        Way::Pinned { .. } | Way::Searched => (tally.lots.clone(), tally.matched),
    }
}

/// The cash the days took, in yen, at the shares of them asked for (each in
/// `0..=1`): the lots of the day that many of them are at or under. None
/// until a day has matched.
pub fn outlay_at(
    tally: &SunkTally,
    setup: &SunkSetup,
    way: Way,
    shares: &[f64],
) -> Option<Vec<u64>> {
    let (lots, days) = lots_of(tally, setup, way);
    (days > 0).then(|| {
        shares
            .iter()
            .map(|&share| {
                #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
                let wanted = ((share.clamp(0.0, 1.0) * real(days)).ceil() as u64).max(1);
                lots.iter()
                    .scan(0, |seen, (&lots, &count)| {
                        *seen += count;
                        Some((*seen, lots))
                    })
                    .find(|&(seen, _)| seen >= wanted)
                    .map_or(0, |(_, lots)| lots * LOT_YEN)
            })
            .collect()
    })
}

/// The mean cash the days took, in yen, as `outlay_at` finds them.
pub fn mean_outlay(tally: &SunkTally, setup: &SunkSetup, way: Way) -> Option<f64> {
    let (lots, days) = lots_of(tally, setup, way);
    (days > 0).then(|| {
        lots.iter()
            .map(|(&lots, &count)| real(lots * LOT_YEN) * real(count))
            .sum::<f64>()
            / real(days)
    })
}

/// How seldom a cabinet goes as many regular spins as the counter says since
/// its last jackpot without one, where that is known exactly — a machine
/// with no 遊タイム, played as `Dry` or `Pinned`: once in so many times.
pub fn dry_one_in(spec: &NormalizedSpec, setup: &SunkSetup, way: Way) -> Option<f64> {
    let spins = match way {
        Way::Dry => setup.spins,
        Way::Pinned { since_last } => since_last,
        Way::Searched => return None,
    };
    Some((-real(spins) * spec.hit_chance.complement().value().ln()).exp())
}

/// A run part-way through: everything needed to resume it, so a long run can
/// be done in chunks and come out exactly as one run would.
#[derive(Clone, Debug, PartialEq)]
pub struct Sunk {
    pub rng: Rng,
    pub tally: SunkTally,
}

impl Sunk {
    pub fn start(seed: Seed) -> Self {
        Self {
            rng: Rng::from_seed(seed),
            tally: SunkTally::default(),
        }
    }

    /// Done once so many days are played out, or so many have matched; a dry
    /// day from the start, there being nothing to sample.
    pub fn is_finished(&self, way: Way, trials: NonZeroU64, enough: NonZeroU64) -> bool {
        way == Way::Dry || self.tally.trials >= trials.get() || self.tally.matched >= enough.get()
    }
}

/// Play up to `chunk` more days the way given, never past `trials` in all,
/// and none once `enough` have matched.
pub fn advance_sunk(
    spec: &NormalizedSpec,
    setup: &SunkSetup,
    way: Way,
    (trials, enough): (NonZeroU64, NonZeroU64),
    sunk: &Sunk,
    chunk: NonZeroU64,
) -> Sunk {
    (0..chunk.get()).fold(sunk.clone(), |current, _| {
        if current.is_finished(way, trials, enough) {
            return current;
        }
        let (played, rng) = play(spec, setup, way, current.rng);
        Sunk {
            rng,
            tally: current.tally.with(&played, setup, way),
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup(jackpots: u64, since_last: Option<u64>) -> SunkSetup {
        SunkSetup {
            spins: 3000,
            jackpots,
            since_last,
            spin_performance: 17.0,
            rented_per_thousand: 250.0,
            payout: PayoutYield::AS_SPECIFIED,
        }
    }

    #[test]
    fn spins_on_rented_balls_buy_whole_lots() {
        assert_eq!(paid(0.0, 0, 250.0, 125.0), (0.0, 2));
        assert_eq!(paid(0.0, 0, 251.0, 125.0), (124.0, 3));
        assert_eq!(paid(300.0, 1, 250.0, 125.0), (50.0, 1));
    }

    #[test]
    fn a_counter_with_no_jackpot_took_its_spins_in_cash() {
        let dry = SunkSetup {
            spins: 4100,
            ..setup(0, Some(4100))
        };
        assert_eq!(
            outlay_at(&SunkTally::default(), &dry, Way::Dry, &[0.5]),
            Some(vec![241_500])
        );
    }

    #[test]
    fn a_counter_glanced_at_is_matched_within_its_tolerance_when_searched() {
        let setup = setup(4, Some(400));
        let day = |jackpots, since_last| Played {
            lots: 0,
            jackpots,
            since_last,
        };
        assert!(matches(&day(4, 420), &setup, Way::Searched));
        assert!(!matches(&day(4, 421), &setup, Way::Searched));
        assert!(!matches(&day(5, 400), &setup, Way::Searched));
        assert!(matches(&day(4, 0), &setup, Way::Pinned { since_last: 400 }));
    }

    #[test]
    fn shares_of_the_matching_days_read_their_lots_in_order() {
        let setup = setup(4, None);
        let tally = SunkTally {
            trials: 10,
            matched: 4,
            lots: BTreeMap::from([(10, 1), (20, 2), (40, 1)]),
        };
        assert_eq!(
            outlay_at(&tally, &setup, Way::Searched, &[0.0, 0.5, 1.0]),
            Some(vec![5_000, 10_000, 20_000])
        );
        assert_eq!(mean_outlay(&tally, &setup, Way::Searched), Some(11_250.0));
    }
}
