//! A side bonus: a bonus beside an AT machine's trigger, drawn at its own
//! chance on every regular game and certainly on its own ceiling — regular
//! games counted from the last of it, which no AT starts again. Nothing of
//! the AT machine's play turns on it, nor it on that play, so what it comes
//! to is worked out apart and added in: over a cycle, its bonuses are the
//! cycle's games over the games between two of them, which is exact for the
//! long run a 機械割 is; over the games played from a seat, each game brings
//! one as likely as the games since the last say, played on game by game.

use std::num::NonZeroU32;

use pachislot_domain::normalized::{AtRules, AtTable, SideBonusRule};

use crate::at::{Between, games_between};

/// Narrowings of the bracket a chance below the ceiling is found in: far
/// more than a float tells apart.
const NARROWINGS: u32 = 200;

/// The chance a regular game brings a side bonus below its ceiling that
/// makes its published 合算, ceiling included, come true: one over the
/// games between two, which fall as the chance grows. The 合算 itself
/// without a ceiling; none where no chance can make it — as rare as the
/// ceiling allows or rarer, or past certainty.
pub(crate) fn chance_below(published: f64, ceiling: Option<NonZeroU32>) -> Option<f64> {
    let Some(ceiling) = ceiling else {
        return (published > 0.0 && published <= 1.0).then_some(published);
    };
    if !published.is_finite() || published > 1.0 || published * f64::from(ceiling.get()) <= 1.0 {
        return None;
    }
    let combined = |chance: f64| 1.0 / games_between(chance, Some(ceiling));
    let (low, high) = (0..NARROWINGS).fold((0.0_f64, published), |(low, high), _| {
        let middle = f64::midpoint(low, high);
        if combined(middle) < published {
            (middle, high)
        } else {
            (low, middle)
        }
    });
    Some(f64::midpoint(low, high))
}

/// The side bonuses a regular game brings in the long run: one over the
/// games between two.
pub(crate) fn per_game(rule: &SideBonusRule, table: &AtTable) -> f64 {
    1.0 / games_between(table.side_chance.value(), rule.ceiling)
}

/// The chance each regular game from a seat brings the side bonus, game
/// after game: where the games since the last are known and it has a
/// ceiling, as they and the games since make it — the last one's next
/// falling where the games between two say, and every one after the one
/// before — and otherwise as in the long run, which without a ceiling is
/// its chance on every game whatever came before.
pub(crate) struct Chances {
    per_game: f64,
    walk: Option<Walk>,
}

/// The side bonus's renewals walked from a seat: where each fell, at its
/// chance below the ceiling and certainly on it, as a running sum carries
/// them; the last before the seat at game nought, weighed so that it is
/// the one the seat's games since start from.
struct Walk {
    between: Between,
    fallen: Vec<f64>,
    running: f64,
    since: usize,
}

impl Chances {
    /// From a seat so many games since the last side bonus, where known —
    /// never more than its ceiling leaves, so that play past it meets the
    /// ceiling on the next game.
    pub(crate) fn from_seat(rule: &SideBonusRule, table: &AtTable, since: Option<u32>) -> Self {
        let chance = table.side_chance.value();
        let walk = since.zip(rule.ceiling).map(|(since, ceiling)| {
            let since = since.min(ceiling.get() - 1);
            let lasted = (1.0 - chance).powi(i32::try_from(since).unwrap_or(i32::MAX));
            let (since, last) = if lasted > 0.0 {
                (since as usize, 1.0 / lasted)
            } else {
                (0, 1.0)
            };
            let mut fallen = Vec::with_capacity(since + 1);
            fallen.push(last);
            let between = Between::of(chance, rule.ceiling);
            let running =
                (1..=since)
                    .take_while(|_| crate::budget::spend(1))
                    .fold(0.0, |running, at| {
                        let (running, _) = between.step(&fallen, running, at);
                        fallen.push(0.0);
                        running
                    });
            Walk {
                between,
                fallen,
                running,
                since,
            }
        });
        Self {
            per_game: per_game(rule, table),
            walk,
        }
    }

    /// The chance the `game`th game from the seat brings it, the first
    /// counted one, as far as the walk has gone: none ahead of it.
    pub(crate) fn on(&self, game: usize) -> f64 {
        self.walk.as_ref().map_or(self.per_game, |walk| {
            walk.fallen.get(walk.since + game).copied().unwrap_or(0.0)
        })
    }

    /// The walk taken to the `games`th game from the seat, a game at a
    /// time, each spending the work budget.
    pub(crate) fn reach(&mut self, games: usize) {
        if let Some(walk) = self.walk.as_mut() {
            while walk.fallen.len() <= walk.since + games && crate::budget::spend(1) {
                let at = walk.fallen.len();
                let (running, here) = walk.between.step(&walk.fallen, walk.running, at);
                walk.running = running;
                walk.fallen.push(here);
            }
        }
    }

    /// The chance the next game after so many from the seat brings it, the
    /// walk taken that far.
    pub(crate) fn next_after(&mut self, played: usize) -> f64 {
        self.reach(played + 1);
        self.on(played + 1)
    }
}

/// What a machine's side bonus pays over the first `games` regular games
/// from a seat so many games since the last of it; nothing where it has
/// none.
pub(crate) fn medals_over(
    rules: &AtRules,
    table: &AtTable,
    since: Option<u32>,
    games: usize,
) -> f64 {
    rules.side_bonus.as_ref().map_or(0.0, |rule| {
        let mut chances = Chances::from_seat(rule, table, since);
        chances.reach(games);
        (1..=games).map(|game| chances.on(game)).sum::<f64>() * rule.payout.medals.get()
    })
}
