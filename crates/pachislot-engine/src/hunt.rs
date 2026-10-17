//! 天井狙い: what sitting down at an AT machine where it stands is worth,
//! played on until the next AT is won and over, under one setting.

use pachislot_domain::normalized::{AtRules, AtTable, ModeRule};
use pachislot_domain::observation::PathStart;

use std::num::NonZeroU32;

use crate::at::{
    Held, Odds, Standing, chained, chances, direct_on, fresh, gain_now, started, trigger_medals,
};
use crate::chain::{Chain, spread};
use crate::side::{Chances, per_game};

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
    /// AT間天井 or the スルー天井 of a machine a CZ brings the AT on, a CZ
    /// a ceiling counted from the AT forces where it certainly succeeds —
    /// at its bonus's share, where its success brings one — and the
    /// trigger's ceiling of a machine won directly, whose trigger is the AT.
    pub by_ceiling: f64,
    /// What a side bonus pays on the way, from the games since the last of
    /// it at the seat; none where the machine has none.
    pub side_medals: f64,
}

impl Hunted {
    /// Nothing played yet.
    pub(crate) const NONE: Self = Self {
        games: 0.0,
        medals: 0.0,
        at_medals: 0.0,
        trigger_medals: 0.0,
        by_ceiling: 0.0,
        side_medals: 0.0,
    };

    /// Another added in at a weight.
    pub(crate) fn plus(self, other: Self, weight: f64) -> Self {
        Self {
            games: self.games + weight * other.games,
            medals: self.medals + weight * other.medals,
            at_medals: self.at_medals + weight * other.at_medals,
            trigger_medals: self.trigger_medals + weight * other.trigger_medals,
            by_ceiling: self.by_ceiling + weight * other.by_ceiling,
            side_medals: self.side_medals + weight * other.side_medals,
        }
    }

    /// The same with a side bonus paying `medals` at `chance` on each of
    /// its games.
    fn with_side(self, chance: f64, medals: f64) -> Self {
        Self {
            side_medals: self.games * chance * medals,
            ..self
        }
    }
}

/// What playing on comes to with its medals summed: what the AT gains, what
/// the triggers pay and — where the machine has one — what a side bonus
/// pays, less what the regular games lose.
fn finished(rules: &AtRules, sum: Hunted) -> Hunted {
    let loss = rules.base.loss_per_game() * sum.games;
    Hunted {
        medals: if rules.side_bonus.is_some() {
            sum.at_medals + sum.trigger_medals + sum.side_medals - loss
        } else {
            sum.at_medals + sum.trigger_medals - loss
        },
        ..sum
    }
}

/// A machine's side bonus from a seat so many games since the last of it:
/// the chance each game brings it, and what it pays; none where it has none.
fn side_from(rules: &AtRules, table: &AtTable, since: Option<u32>) -> Option<(Chances, f64)> {
    rules.side_bonus.as_ref().map(|side| {
        (
            Chances::from_seat(side, table, since),
            side.payout.medals.get(),
        )
    })
}

/// A game's figures with the side bonus paid on it, the `played`th game
/// from the seat before it; as they were where the machine has none.
fn sided(added: Hunted, side: Option<&mut (Chances, f64)>, played: usize) -> Hunted {
    side.map_or(added, |(chances, medals)| {
        added.with_side(chances.next_after(played), *medals)
    })
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
                    side_medals: 0.0,
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
    (held, since_side_bonus): (&Held, Option<u32>),
    (since_trigger, since_at, misses): (u32, u32, u32),
) -> Option<Hunted> {
    let walked = (0..LONGEST).try_fold(
        (
            Going::seated(mode, since_trigger, misses),
            Hunted::NONE,
            side_from(rules, table, since_side_bonus),
        ),
        |(going, sum, mut side), game| {
            if going.left() < SETTLED {
                return Err(finished(rules, sum));
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
            let added = sided(added, side.as_mut(), game as usize);
            Ok((next, sum.plus(added, 1.0), side))
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
        return hunt_chained(rules, table, &seated, start.since_side_bonus);
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
                hunt_in_mode(
                    rules,
                    table,
                    (index, mode),
                    (&seated.held, start.since_side_bonus),
                    counts,
                )?,
                *weight,
            ))
        })
}

/// What playing on from where play stands comes to where it is walked as a
/// chain, every mode at once — and where play starts again at a bonus that
/// misses the AT, what playing on from such a start comes to, as often as
/// play starts again. A side bonus is paid from the seat game by game over
/// the stretch from it, and over those after a start again at its chance
/// in the long run: where they fall from the seat is not kept, which is
/// the one approximation of a side bonus. None where the AT might never
/// come.
fn hunt_chained(
    rules: &AtRules,
    table: &AtTable,
    seated: &Standing,
    since_side_bonus: Option<u32>,
) -> Option<Hunted> {
    if let Some(across) = rules.ceiling_across_bonuses {
        return Some(finished(
            rules,
            hunt_across(rules, table, (seated, since_side_bonus), across),
        ));
    }
    let (sum, again) = stretch(
        rules,
        table,
        seated,
        side_from(rules, table, since_side_bonus),
    )?;
    if !rules.restarts() || again <= 0.0 {
        return Some(finished(rules, sum));
    }
    let (anew, anew_again) = stretch(rules, table, &restarted(table), None)?;
    let anew = rules.side_bonus.as_ref().map_or(anew, |side| {
        anew.with_side(per_game(side, table), side.payout.medals.get())
    });
    (anew_again < 1.0).then(|| {
        let each = Hunted::NONE.plus(anew, 1.0 / (1.0 - anew_again));
        finished(rules, sum.plus(each, again))
    })
}

/// Where play stands as a bonus that misses the AT starts it again: as
/// after an AT, nothing held.
fn restarted(table: &AtTable) -> Standing {
    Standing {
        since_trigger: 0,
        since_at: 0,
        since_at_across_bonuses: 0,
        misses: 0,
        modes: table.allotments.after_at.clone(),
        held: fresh(),
    }
}

/// Playing on as a chain from where play stands to the AT — or, where play
/// starts again at a bonus that misses the AT, to such a bonus — and how
/// often it ends at a bonus that starts play again. None where it might
/// never end.
fn stretch(
    rules: &AtRules,
    table: &AtTable,
    seated: &Standing,
    side: Option<(Chances, f64)>,
) -> Option<(Hunted, f64)> {
    let chain = Chain::seated(
        rules,
        Odds::of(table),
        (seated.since_trigger, seated.since_at, seated.misses),
        &seated.modes,
    );
    let (steps, settled) = stepped(rules, table, (seated, side), chain, LONGEST);
    settled.then(|| {
        steps
            .iter()
            .fold((Hunted::NONE, 0.0_f64), |(sum, again), step| {
                (sum.plus(step.added, 1.0), again + step.again)
            })
    })
}

/// What playing on comes to where an AT間天井 counted from the AT across
/// the bonuses that start play again stands beside the rest: the stretch
/// from where play stands, cut at that ceiling, and a fresh stretch from
/// each start again — laid where it begins, counted from the AT, and cut
/// there too, whatever of play is still going winning the AT on it. A side
/// bonus is paid on each game at its chance that many games from the seat.
fn hunt_across(
    rules: &AtRules,
    table: &AtTable,
    (seated, since_side_bonus): (&Standing, Option<u32>),
    across: NonZeroU32,
) -> Hunted {
    let ceiling = across.get() as usize;
    let since = seated.since_at_across_bonuses as usize;
    let chain = Chain::seated(
        rules,
        Odds::of(table),
        (seated.since_trigger, seated.since_at, seated.misses),
        &seated.modes,
    )
    .counted_across(since.saturating_sub(seated.since_at as usize));
    let (first, _) = stepped(
        rules,
        table,
        (seated, side_from(rules, table, since_side_bonus)),
        chain,
        LONGEST,
    );
    let seeded = first
        .iter()
        .enumerate()
        .fold(vec![0.0; ceiling], |mut seeded, (game, step)| {
            if let Some(cell) = seeded.get_mut(since + 1 + game) {
                *cell += step.again;
            }
            seeded
        });
    let anew = restarted(table);
    let fresh_chain = Chain::seated(rules, Odds::of(table), (0, 0, 0), &anew.modes);
    let (fresh, _) = stepped(
        rules,
        table,
        (&anew, None),
        fresh_chain,
        u32::try_from(ceiling).unwrap_or(u32::MAX),
    );
    let again: Vec<f64> = std::iter::once(0.0)
        .chain(fresh.iter().map(|step| step.again))
        .collect();
    let starts = spread(seeded, &again, ceiling);
    let before: Vec<Hunted> = std::iter::once(Hunted::NONE)
        .chain(fresh.iter().scan(Hunted::NONE, |sum, step| {
            *sum = sum.plus(step.added, 1.0);
            Some(*sum)
        }))
        .collect();
    let from_seat = first
        .iter()
        .fold(Hunted::NONE, |sum, step| sum.plus(step.added, 1.0));
    let played = starts
        .iter()
        .enumerate()
        .filter(|(_, start)| **start > 0.0)
        .fold(from_seat, |sum, (began, start)| {
            let played = ceiling - began - 1;
            let up_to = before
                .get(played)
                .or(before.last())
                .copied()
                .unwrap_or(Hunted::NONE);
            let on = fresh.get(played).map_or(Hunted::NONE, |step| step.ceiled);
            sum.plus(up_to.plus(on, 1.0), *start)
        });
    side_from(rules, table, since_side_bonus).map_or(played, |(chances, medals)| Hunted {
        side_medals: played.side_medals
            + medals * side_after_starts(chances, &starts, &fresh, (since, ceiling)),
        ..played
    })
}

/// The side bonuses the fresh stretches bring, each begun where play
/// started again counted from the AT and cut at the AT間天井 counted across
/// bonuses: each game of one played at the chance a game that many from the
/// seat brings the side bonus, the seat `since` games across from the AT.
fn side_after_starts(
    mut chances: Chances,
    starts: &[f64],
    fresh: &[Step],
    (since, ceiling): (usize, usize),
) -> f64 {
    chances.reach(ceiling.saturating_sub(since));
    starts
        .iter()
        .enumerate()
        .filter(|(_, start)| **start > 0.0)
        .map(|(began, start)| {
            let played = ceiling - began - 1;
            crate::budget::spend_sums(played.min(fresh.len()));
            let from_seat = |game: usize| chances.on((began + game + 1).saturating_sub(since));
            let before: f64 = fresh
                .iter()
                .take(played)
                .enumerate()
                .map(|(game, step)| step.added.games * from_seat(game))
                .sum();
            let on = fresh
                .get(played)
                .map_or(0.0, |step| step.ceiled.games * from_seat(played));
            start * (before + on)
        })
        .sum()
}

/// One game of a stretch played on: what it adds, what of it ended at a
/// bonus that starts play again, and what it would come to were the
/// AT間天井 counted across bonuses on it — the AT for whatever of play was
/// still going, and the trigger's medals in full where that ceiling brings
/// the trigger.
struct Step {
    added: Hunted,
    again: f64,
    ceiled: Hunted,
}

/// Playing on as a chain from where play stands, game by game, at most
/// `most` games: the AT won outright at the machine's own chance before
/// anything else is drawn, what a trigger that is a bonus pays where it
/// comes — in full on the AT間天井, where it brings the trigger — and what
/// ends at a bonus that starts play again; and whether what is still going
/// came to too little to tell within them.
fn stepped(
    rules: &AtRules,
    table: &AtTable,
    (seated, mut side): (&Standing, Option<(Chances, f64)>),
    mut chain: Chain<'_>,
    most: u32,
) -> (Vec<Step>, bool) {
    let odds = Odds::of(table);
    let keep = 1.0 - odds.direct;
    let paid = rules
        .trigger_payout
        .map_or(0.0, |payout| payout.medals.get() * table.paid.value());
    let direct_paid = rules.trigger_payout.map_or(0.0, |payout| {
        payout.medals.get() * table.direct_bonus.value()
    });
    let ceiling_paid = rules
        .ceiling_trigger_payout()
        .map_or(0.0, |payout| payout.medals.get());
    let through_wins = if rules.restarts() {
        odds.bonus_share
    } else {
        1.0
    };
    let walked = (0..most).try_fold(
        (Vec::new(), 1.0_f64),
        |(mut steps, reached): (Vec<Step>, f64), game| {
            let going = chain.going(None);
            if reached * going < SETTLED {
                return Err(steps);
            }
            let now = seated.since_at.saturating_add(game);
            let gain = gain_now(rules, table, &seated.held, now);
            let played = chain.play();
            let restarted = reached * keep * played.bonus * (1.0 - odds.bonus_share);
            let won = reached * (odds.direct * going + keep * played.ended) - restarted;
            let alive = reached * going;
            let added = Hunted {
                games: alive,
                medals: 0.0,
                at_medals: won * gain,
                trigger_medals: reached
                    * keep
                    * (played.arrived * paid + played.on_at_ceiling * ceiling_paid)
                    + reached * (going - played.on_at_ceiling) * direct_paid,
                by_ceiling: reached
                    * (played.on_at_ceiling
                        + keep
                            * (played.through * through_wins + played.forced * odds.bonus_share)),
                side_medals: 0.0,
            };
            steps.push(Step {
                added: sided(added, side.as_mut(), game as usize),
                again: restarted,
                ceiled: Hunted {
                    games: alive,
                    medals: 0.0,
                    at_medals: alive * gain,
                    trigger_medals: alive * keep * ceiling_paid,
                    by_ceiling: alive,
                    side_medals: 0.0,
                },
            });
            Ok((steps, reached * keep))
        },
    );
    match walked {
        Err(steps) => (steps, true),
        Ok((steps, _)) => (steps, false),
    }
}
