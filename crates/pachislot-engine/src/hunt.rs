//! 天井狙い: what sitting down at an AT machine where it stands is worth,
//! played on until the next AT is won and over, under one setting.

use pachislot_domain::normalized::{AtRules, AtTable, ModeRule};
use pachislot_domain::observation::PathStart;

use crate::at::{
    Held, Odds, Standing, chained, chances, direct_on, fresh, gain_now, started, trigger_medals,
};
use crate::chain::Chain;

/// What playing on from where play stands until the next AT is over comes
/// to under one setting.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Hunted {
    /// Regular games played on average, the one the AT is won on included.
    pub games: f64,
    /// Medals over them and the AT: what the AT gains and what the bonuses
    /// that are its triggers pay, less what the regular games lose.
    pub medals: f64,
    /// What the AT gains on average.
    pub at_medals: f64,
    /// What the bonuses that are the trigger pay on the way, the one that
    /// wins the AT included; none where the trigger pays nothing.
    pub trigger_medals: f64,
    /// The chance the AT is won by a ceiling rather than at the odds: the
    /// AT間天井 or the スルー天井 of a machine a CZ brings the AT on, the
    /// trigger's of one won directly, whose trigger is the AT.
    pub by_ceiling: f64,
}

impl Hunted {
    /// Nothing played yet.
    pub(crate) const NONE: Self = Self {
        games: 0.0,
        medals: 0.0,
        at_medals: 0.0,
        trigger_medals: 0.0,
        by_ceiling: 0.0,
    };

    /// Another added in at a weight.
    pub(crate) fn plus(self, other: Self, weight: f64) -> Self {
        Self {
            games: self.games + weight * other.games,
            medals: self.medals + weight * other.medals,
            at_medals: self.at_medals + weight * other.at_medals,
            trigger_medals: self.trigger_medals + weight * other.trigger_medals,
            by_ceiling: self.by_ceiling + weight * other.by_ceiling,
        }
    }
}

/// What is left to play under which play counts as over.
const SETTLED: f64 = 1e-12;

/// The regular games past which an AT that has not come is taken never to.
const LONGEST: u32 = 1_000_000;

/// Play in one mode as it goes on: how likely it is still going at each
/// count of games since the last trigger and of triggers missed. A count
/// that changes nothing in the mode — the games since a trigger without a
/// ceiling for it, the misses without a スルー天井 — is kept at one place,
/// so that the play is no larger than it must be.
struct Going {
    /// Games since the last trigger told apart: up to the mode's ceiling, or one.
    games: usize,
    /// Triggers missed told apart: up to the スルー天井, or one.
    misses: usize,
    /// How likely play is still going at each place, misses by games.
    alive: Vec<f64>,
}

impl Going {
    /// Play where it starts: certainly at the counts it was seen at, each
    /// kept within what is told apart.
    fn seated(mode: &ModeRule, since_trigger: u32, misses: u32) -> Self {
        let games = mode.ceiling.map_or(1, |ceiling| ceiling.get() as usize);
        let told = mode.misses.map_or(1, |limit| limit.get() as usize + 1);
        let at = Self::place_in(
            games,
            (since_trigger as usize).min(games - 1),
            (misses as usize).min(told - 1),
        );
        Self {
            games,
            misses: told,
            alive: (0..games * told)
                .map(|place| if place == at { 1.0 } else { 0.0 })
                .collect(),
        }
    }

    fn place_in(games: usize, since_trigger: usize, misses: usize) -> usize {
        misses * games + since_trigger
    }

    fn place(&self, since_trigger: usize, misses: usize) -> usize {
        Self::place_in(self.games, since_trigger, misses)
    }

    /// The counts a place stands for: games since the last trigger, triggers missed.
    fn counts(&self, place: usize) -> (usize, usize) {
        (place % self.games, place / self.games)
    }

    fn left(&self) -> f64 {
        self.alive.iter().sum()
    }
}

fn counted(count: usize) -> u32 {
    u32::try_from(count).unwrap_or(u32::MAX)
}

/// One game played in a mode `now` games after the last AT: what it adds —
/// the game, the AT won on it gaining `gain`, by a ceiling or at the odds,
/// and what a bonus that is the trigger pays there — and where what is still going goes on to: the next game without
/// a trigger, or a trigger missed.
fn played(
    rules: &AtRules,
    table: &AtTable,
    (index, mode): (usize, &ModeRule),
    going: &Going,
    now: u32,
    gain: f64,
) -> (Going, Hunted) {
    let at_ceiling = mode
        .at_ceiling
        .is_some_and(|ceiling| now + 1 >= ceiling.get());
    going
        .alive
        .iter()
        .enumerate()
        .filter(|(_, alive)| **alive > 0.0)
        .fold(
            (
                Going {
                    alive: vec![0.0; going.alive.len()],
                    ..*going
                },
                Hunted::NONE,
            ),
            |(mut next, sum), (place, alive)| {
                let (since_trigger, missed) = going.counts(place);
                let (won, miss, quiet) = chances(
                    rules,
                    table,
                    (index, mode),
                    (counted(since_trigger), now, counted(missed)),
                );
                let through = mode
                    .misses
                    .is_some_and(|limit| missed + 1 > limit.get() as usize);
                let direct_ceiling = rules.trigger.is_none()
                    && mode
                        .ceiling
                        .is_some_and(|ceiling| since_trigger + 1 >= ceiling.get() as usize);
                let on = next.place((since_trigger + 1).min(next.games - 1), missed);
                let after_miss = next.place(0, (missed + 1).min(next.misses - 1));
                if let Some(cell) = next.alive.get_mut(on) {
                    *cell += alive * quiet;
                }
                if let Some(cell) = next.alive.get_mut(after_miss) {
                    *cell += alive * miss;
                }
                let outright = direct_on(
                    table.direct.value(),
                    Odds::of(table).gates_of(index),
                    now as usize + 1,
                );
                let game = Hunted {
                    games: 1.0,
                    medals: 0.0,
                    at_medals: won * gain,
                    trigger_medals: trigger_medals(
                        rules,
                        table,
                        (mode, Odds::of(table).gates_of(index)),
                        now,
                        (won, miss),
                    ),
                    by_ceiling: if at_ceiling {
                        won
                    } else if through || direct_ceiling {
                        won - outright
                    } else {
                        0.0
                    },
                };
                (next, sum.plus(game, *alive))
            },
        )
}

/// Play in one mode from where it stands until the AT: game by game, each
/// by the counts at it, the AT gaining what is held then allows, until what
/// is still going is too little to tell. None where the AT might never come.
fn hunt_in_mode(
    rules: &AtRules,
    table: &AtTable,
    (index, mode): (usize, &ModeRule),
    held: &Held,
    (since_trigger, since_at, misses): (u32, u32, u32),
) -> Option<Hunted> {
    let finished = |sum: Hunted| Hunted {
        medals: sum.at_medals + sum.trigger_medals - rules.base.loss_per_game() * sum.games,
        ..sum
    };
    let walked = (0..LONGEST).try_fold(
        (Going::seated(mode, since_trigger, misses), Hunted::NONE),
        |(going, sum), game| {
            if going.left() < SETTLED {
                return Err(finished(sum));
            }
            let now = since_at.saturating_add(game);
            let (next, added) = played(
                rules,
                table,
                (index, mode),
                &going,
                now,
                gain_now(rules, table, held, now),
            );
            Ok((next, sum.plus(added, 1.0)))
        },
    );
    walked.err()
}

/// What playing on from where play stands until the next AT is over comes
/// to under one setting: over the modes play may be in, as what was seen
/// when it sat down weighs them. None where the AT might never come.
pub fn hunt(start: PathStart, rules: &AtRules, table: &AtTable) -> Option<Hunted> {
    let seated = started(rules, table, start);
    if chained(rules, Odds::of(table)) {
        return hunt_chained(rules, table, &seated);
    }
    let counts = (seated.since_trigger, seated.since_at, seated.misses);
    rules
        .modes
        .iter()
        .zip(&seated.modes)
        .enumerate()
        .filter(|(_, (_, weight))| **weight > 0.0)
        .try_fold(Hunted::NONE, |sum, (index, (mode, weight))| {
            Some(sum.plus(
                hunt_in_mode(rules, table, (index, mode), &seated.held, counts)?,
                *weight,
            ))
        })
}

/// What playing on from where play stands comes to where it is walked as a
/// chain, every mode at once — and where play starts again at a bonus that
/// misses the AT, what playing on from such a start comes to, as often as
/// play starts again. None where the AT might never come.
fn hunt_chained(rules: &AtRules, table: &AtTable, seated: &Standing) -> Option<Hunted> {
    let finished = |sum: Hunted| Hunted {
        medals: sum.at_medals + sum.trigger_medals - rules.base.loss_per_game() * sum.games,
        ..sum
    };
    let (sum, again) = stretch(rules, table, seated)?;
    if !rules.restarts() || again <= 0.0 {
        return Some(finished(sum));
    }
    let restart = Standing {
        since_trigger: 0,
        since_at: 0,
        misses: 0,
        modes: table.allotments.after_at.clone(),
        held: fresh(),
    };
    let (anew, anew_again) = stretch(rules, table, &restart)?;
    (anew_again < 1.0).then(|| {
        let each = Hunted::NONE.plus(anew, 1.0 / (1.0 - anew_again));
        finished(sum.plus(each, again))
    })
}

/// Playing on as a chain from where play stands to the AT — or, where play
/// starts again at a bonus that misses the AT, to such a bonus — game by
/// game: the AT won outright at the machine's own chance before anything
/// else is drawn, what a trigger that is a bonus pays where it comes, until
/// what is still going is too little to tell; and how often it ends at a
/// bonus that starts play again. None where it might never end.
fn stretch(rules: &AtRules, table: &AtTable, seated: &Standing) -> Option<(Hunted, f64)> {
    let odds = Odds::of(table);
    let mut chain = Chain::seated(
        rules,
        odds,
        (seated.since_trigger, seated.since_at, seated.misses),
        &seated.modes,
    );
    let keep = 1.0 - odds.direct;
    let paid = rules
        .trigger_payout
        .map_or(0.0, |payout| payout.medals.get() * table.paid.value());
    let through_wins = if rules.restarts() {
        odds.bonus_share
    } else {
        1.0
    };
    let walked = (0..LONGEST).try_fold(
        (Hunted::NONE, 1.0_f64, 0.0_f64),
        |(sum, reached, again), game| {
            let going = chain.going(None);
            if reached * going < SETTLED {
                return Err((sum, again));
            }
            let now = seated.since_at.saturating_add(game);
            let played = chain.play();
            let restarted = reached * keep * played.bonus * (1.0 - odds.bonus_share);
            let won = reached * (odds.direct * going + keep * played.ended) - restarted;
            let added = Hunted {
                games: reached * going,
                medals: 0.0,
                at_medals: won * gain_now(rules, table, &seated.held, now),
                trigger_medals: reached * keep * played.arrived * paid,
                by_ceiling: reached * (played.on_at_ceiling + keep * played.through * through_wins),
            };
            Ok((sum.plus(added, 1.0), reached * keep, again + restarted))
        },
    );
    walked.err()
}
