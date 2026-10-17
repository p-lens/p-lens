//! Play whose hidden mode moves at each missed trigger, or whose modes win
//! the AT each at a rate of its own: walked over every mode and every count
//! of misses at once, game by game, as one chain. Each mode and count is a
//! stream of where its trigger's games began, carried as a running sum the
//! way a mode's own walk is; a trigger that misses starts its mode's row of
//! the next count, spread over the modes it moves play to. A mode's AT間天井
//! wins whatever of play is in it on its game, and play moved into a mode
//! past it wins the game after. The AT won outright at the machine's own
//! chance a game is the caller's to weigh, as for a mode's own walk; a
//! zone's, which is a mode's, is drawn here.

use pachislot_domain::normalized::{AtRules, AtTable};
use pachislot_domain::observation::{PathStart, ToldLeg};

use crate::at::{
    Between, Cycle, LONGEST_WALK, Odds, Standing, WALKED, Walk, cycle_to_ceiling, direct_on, drawn,
    drawn_on, expires, fresh, gate_on, is_forced, normalised, passed_unbrought, success_of,
    with_direct,
};

/// One mode and count of misses: where its trigger's games began, the
/// running sum over them, how much of play is in it, and whether any play
/// ever came into it — a mode and count play never reaches has nothing to
/// draw, and a game passes it by.
#[derive(Clone)]
struct Stream {
    source: Vec<f64>,
    running: f64,
    alive: f64,
    fed: bool,
}

/// The games since its trigger play moved into or seated in a mode is
/// held at: no more than the mode's ceiling leaves, so that play past it
/// meets its ceiling on the next game.
fn held_since(rules: &AtRules, mode: usize, since_trigger: u32) -> u32 {
    rules
        .modes
        .get(mode)
        .and_then(|mode| mode.ceiling)
        .map_or(since_trigger, |ceiling| {
            since_trigger.min(ceiling.get() - 1)
        })
}

impl Stream {
    /// Play taken into the stream as it stands after game `last`: so much of
    /// it, so many games since its trigger in a mode whose game goes
    /// without one at `risk` — where it began, as the running sum would
    /// have carried it.
    fn holding(&mut self, last: usize, since: u32, mass: f64, risk: f64) {
        let lasted = risk.powi(i32::try_from(since).unwrap_or(i32::MAX));
        if since == 0 {
            if let Some(cell) = self.source.get_mut(last) {
                *cell += mass;
            }
        } else if lasted > 0.0 && risk > 0.0 {
            if let Some(cell) = self.source.get_mut(last.saturating_sub(since as usize)) {
                *cell += mass / lasted;
            }
            self.running += mass / risk;
        }
        self.alive += mass;
        self.fed |= mass != 0.0;
    }

    /// Play that has gone the whole of its mode's span to its expiry before
    /// game `at`, taken out: what began `span` games before it, at `risk`
    /// a game, and its share of the running sum.
    fn expired(&mut self, at: usize, span: usize, risk: f64) -> f64 {
        let Some(began) = at.checked_sub(span) else {
            return 0.0;
        };
        let Some(cell) = self.source.get_mut(began) else {
            return 0.0;
        };
        let reached = *cell * risk.powi(i32::try_from(span - 1).unwrap_or(i32::MAX));
        self.running -=
            *cell * risk.powi(i32::try_from(span.saturating_sub(2)).unwrap_or(i32::MAX));
        *cell = 0.0;
        self.alive -= reached;
        reached
    }

    /// The stream's triggers on game `at`, and how many of them its mode's
    /// ceiling brings: by its chance, on its ceiling, and on a game that
    /// draws a share of play still waiting besides — the share taken from
    /// what waits on.
    fn triggered(&mut self, between: Between, at: usize, share: f64, chance: f64) -> (f64, f64) {
        let ceiling = between.on_ceiling(&self.source, at);
        let (running, here) = between.step(&self.source, self.running, at);
        let (running, here) = if share > 0.0 {
            crate::budget::spend(self.source.len());
            for before in &mut self.source {
                *before *= 1.0 - share;
            }
            ((1.0 - share) * running, drawn(here, running, chance, share))
        } else {
            (running, here)
        };
        self.running = running;
        self.alive -= here;
        (ceiling, here)
    }

    fn scaled(&mut self, kept: f64) {
        for began in &mut self.source {
            *began *= kept;
        }
        self.running *= kept;
        self.alive *= kept;
    }
}

/// What one game of the chain came to, before the AT won outright at the
/// machine's own chance is weighed: the triggers drawn, the AT won, the
/// part of it won on an AT間天井 and on a スルー天井, and the AT won by each
/// count of misses before it.
pub(crate) struct Game {
    pub(crate) arrived: f64,
    pub(crate) ended: f64,
    /// Where play starts again at a bonus, the part of `ended` that is the
    /// bonus a CZ's success brought, the AT won or not.
    pub(crate) bonus: f64,
    pub(crate) on_at_ceiling: f64,
    pub(crate) through: f64,
    pub(crate) ended_by: Vec<f64>,
}

/// Where a missed trigger in one mode moves play: a mode it reaches, and
/// the share of play that goes there from a miss off the mode's ceiling
/// and from one on it.
#[derive(Clone, Copy)]
struct Move {
    to: usize,
    off_ceiling: f64,
    on_ceiling: f64,
}

/// Each mode's moves, the modes a miss reaches and no other: most modes
/// keep play in themselves, and a game walks every mode's every count.
fn moves_of(odds: Odds<'_>, modes: usize) -> Vec<Vec<Move>> {
    (0..modes)
        .map(|from| {
            (0..modes)
                .map(|to| Move {
                    to,
                    off_ceiling: odds.moved(from, to),
                    on_ceiling: odds.moved_from_ceiling(from, to),
                })
                .filter(|each| each.off_ceiling != 0.0 || each.on_ceiling != 0.0)
                .collect()
        })
        .collect()
}

/// The chain as it stands: its streams, mode by mode and count by count,
/// and the game it plays next, counted from the AT.
pub(crate) struct Chain<'a> {
    rules: &'a AtRules,
    odds: Odds<'a>,
    counts: usize,
    between: Vec<Between>,
    streams: Vec<Stream>,
    pending: Vec<f64>,
    moves: Vec<Vec<Move>>,
    game: usize,
    /// Whether a CZ's success ends the chain at its bonus, play starting
    /// again from it, rather than winning the AT at the bonus's share.
    restarting: bool,
}

/// The counts of misses a chain tells apart: as far as the deepest スルー天井
/// makes them matter, and at least `least`, the last holding every count
/// from it on.
fn counts_of(rules: &AtRules, least: usize) -> usize {
    rules
        .modes
        .iter()
        .filter_map(|mode| mode.misses)
        .map(|limit| limit.get() as usize + 1)
        .max()
        .unwrap_or(1)
        .max(least)
        .max(1)
}

impl<'a> Chain<'a> {
    /// A chain with nothing in it yet, at game nought.
    fn empty(rules: &'a AtRules, odds: Odds<'a>, counts: usize) -> Self {
        let streams = rules.modes.len() * counts;
        Self {
            rules,
            odds,
            counts,
            between: rules
                .modes
                .iter()
                .enumerate()
                .map(|(index, mode)| {
                    let span = if expires(mode) {
                        mode.expiry.and_then(|expiry| expiry.games.checked_add(1))
                    } else {
                        mode.ceiling
                    };
                    Between::of(odds.chance_in(index), span)
                })
                .collect(),
            streams: vec![
                Stream {
                    source: Vec::new(),
                    running: 0.0,
                    alive: 0.0,
                    fed: false,
                };
                streams
            ],
            pending: vec![0.0; streams],
            moves: moves_of(odds, rules.modes.len()),
            game: 0,
            restarting: rules.restarts(),
        }
    }

    /// The same chain with every bonus that misses the AT taken as a miss,
    /// as a history told by its totals counts it, play never starting
    /// again at one.
    pub(crate) fn lumped(self) -> Self {
        Self {
            restarting: false,
            ..self
        }
    }

    /// A chain starting from an AT, play in each mode at its share.
    pub(crate) fn from_at(
        rules: &'a AtRules,
        odds: Odds<'a>,
        shares: &[f64],
        least: usize,
    ) -> Self {
        let mut chain = Self::empty(rules, odds, counts_of(rules, least));
        for (mode, share) in shares.iter().enumerate() {
            if let Some(pending) = chain.pending.get_mut(mode * chain.counts) {
                *pending += share;
            }
        }
        chain
    }

    /// A chain where play is seen: so many games since the AT and the last
    /// trigger — no more than a mode's ceiling leaves it — so many triggers
    /// missed, each mode at its weight, the next game the one after.
    pub(crate) fn seated(
        rules: &'a AtRules,
        odds: Odds<'a>,
        (since_trigger, since_at, misses): (u32, u32, u32),
        weights: &[f64],
    ) -> Self {
        let mut chain = Self::empty(rules, odds, counts_of(rules, misses as usize + 1));
        let now = since_at as usize;
        let count = (misses as usize).min(chain.counts - 1);
        for stream in &mut chain.streams {
            stream.source = vec![0.0; now + 1];
        }
        for (mode, weight) in weights.iter().enumerate() {
            let since = held_since(rules, mode, since_trigger);
            let risk = 1.0 - odds.chance_in(mode);
            if let Some(stream) = chain.streams.get_mut(mode * chain.counts + count) {
                stream.holding(now, since, *weight, risk);
            }
        }
        chain.game = now + 1;
        chain
    }

    /// How much of play is going, in every mode, with `count` misses or with any.
    pub(crate) fn going(&self, count: Option<usize>) -> f64 {
        self.streams
            .iter()
            .enumerate()
            .filter(|(index, _)| {
                count.is_none_or(|count| index % self.counts == count.min(self.counts - 1))
            })
            .map(|(_, stream)| stream.alive)
            .sum()
    }

    /// Where each mode's play with `count` misses began on the last game played.
    fn began_last(&self, count: usize) -> Vec<f64> {
        (0..self.rules.modes.len())
            .map(|mode| {
                self.streams
                    .get(mode * self.counts + count.min(self.counts - 1))
                    .and_then(|stream| stream.source.last())
                    .copied()
                    .unwrap_or(0.0)
            })
            .collect()
    }

    /// The next game played: each mode's AT間天井 and zones, its triggers
    /// and what they win or miss, and where a miss moves play.
    /// Play whose mode's span reaches its expiry on game `at` moved, before
    /// the game is drawn, to the mode it names: so many games since its
    /// trigger there, as many as it went.
    fn expire(&mut self, at: usize) {
        let counts = self.counts;
        let moved: Vec<(usize, usize, u32, f64)> = self
            .rules
            .modes
            .iter()
            .enumerate()
            .filter(|(_, mode)| expires(mode))
            .filter_map(|(index, mode)| mode.expiry.map(|expiry| (index, expiry)))
            .flat_map(|(index, expiry)| {
                let risk = 1.0 - self.odds.chance_in(index);
                let span = expiry.games.get() as usize + 1;
                (0..counts)
                    .filter_map(|count| {
                        let stream = self.streams.get_mut(index * counts + count)?;
                        let reached = stream.expired(at, span, risk);
                        (reached > 0.0).then_some((expiry.to, count, expiry.games.get(), reached))
                    })
                    .collect::<Vec<_>>()
            })
            .collect();
        for (to, count, games, mass) in moved {
            let since = held_since(self.rules, to, games);
            let risk = 1.0 - self.odds.chance_in(to);
            if let Some(stream) = self.streams.get_mut(to * counts + count) {
                stream.holding(at.saturating_sub(1), since, mass, risk);
            }
        }
    }

    pub(crate) fn play(&mut self) -> Game {
        let at = self.game;
        self.expire(at);
        let counts = self.counts;
        let modes = self.rules.modes.len();
        let mut game = Game {
            arrived: 0.0,
            ended: 0.0,
            bonus: 0.0,
            on_at_ceiling: 0.0,
            through: 0.0,
            ended_by: vec![0.0; counts],
        };
        let mut moved = vec![0.0; modes * counts];
        for (index, mode) in self.rules.modes.iter().enumerate() {
            let gates = self.odds.gates_of(index);
            let success = if self.restarting {
                self.odds.bonus_in(index)
            } else {
                self.odds.success_in(index)
            };
            let sure = self.rules.ceiling_wins() && is_forced(mode, at);
            let sure_wins = if self.restarting {
                1.0
            } else {
                self.odds.bonus_share
            };
            let ceiled = mode
                .at_ceiling
                .is_some_and(|ceiling| at >= ceiling.get() as usize);
            let outright = gate_on(gates, at).map_or(0.0, |gate| gate.at.value());
            let share = drawn_on(mode, gates, at);
            let between = self.between.get(index).copied();
            for count in 0..counts {
                let Some(stream) = self
                    .streams
                    .get_mut(index * counts + count)
                    .filter(|stream| stream.fed)
                else {
                    continue;
                };
                let ended_by = game.ended_by.get_mut(count);
                if ceiled {
                    game.ended += stream.alive;
                    game.on_at_ceiling += stream.alive;
                    if let Some(ended_by) = ended_by {
                        *ended_by += stream.alive;
                    }
                    stream.alive = 0.0;
                    stream.running = 0.0;
                    continue;
                }
                let mut won = 0.0;
                if outright > 0.0 {
                    won += outright * stream.alive;
                    stream.scaled(1.0 - outright);
                }
                let Some(between) = between else {
                    continue;
                };
                let (ceiling, here) =
                    stream.triggered(between, at, share, self.odds.chance_in(index));
                let forced = if sure { here } else { 0.0 };
                let tries = u32::try_from(count + 1).unwrap_or(u32::MAX);
                let wins = success_of(tries, success, mode.misses);
                if mode.misses.is_some_and(|limit| tries > limit.get()) {
                    game.through += here;
                }
                let succeeded = (here - forced) * wins + forced * sure_wins;
                if self.restarting {
                    game.bonus += succeeded;
                }
                won += succeeded;
                game.arrived += here;
                game.ended += won;
                if let Some(ended_by) = ended_by {
                    *ended_by += won;
                }
                let unsure_ceiling = if sure { 0.0 } else { ceiling };
                let lost =
                    (here - unsure_ceiling - forced) * (1.0 - wins) + forced * (1.0 - sure_wins);
                let lost_on_ceiling = unsure_ceiling * (1.0 - wins);
                let next = (count + 1).min(counts - 1);
                for each in self.moves.get(index).map_or(&[][..], Vec::as_slice) {
                    if let Some(cell) = moved.get_mut(each.to * counts + next) {
                        *cell += lost * each.off_ceiling + lost_on_ceiling * each.on_ceiling;
                    }
                }
            }
        }
        for ((stream, pending), moved) in self.streams.iter_mut().zip(&mut self.pending).zip(&moved)
        {
            let began = *pending + moved;
            stream.source.push(began);
            stream.alive += began;
            stream.fed |= began != 0.0;
            *pending = 0.0;
        }
        self.game += 1;
        game
    }
}

/// What a chain walked from an AT comes to: its triggers and ends game by
/// game, the bonuses among the ends game by game, and the play its
/// AT間天井 wins, each with the AT won outright at the machine's own chance
/// weighed in.
struct Walked {
    walk: Walk,
    bonuses: Vec<f64>,
    on_at_ceiling: f64,
}

/// A chain from an AT walked game by game until next to nothing of it is
/// left — every mode at its AT間天井 or the walk at its longest — the AT
/// won outright at the machine's own chance weighed in.
fn walked(rules: &AtRules, odds: Odds<'_>, shares: &[f64], horizon: Option<usize>) -> Walked {
    let mut chain = Chain::from_at(rules, odds, shares, 0);
    let mut arrived = Vec::new();
    let mut ended = Vec::new();
    let mut bonuses = Vec::new();
    let mut ceiled = Vec::new();
    while horizon.map_or(arrived.len() < LONGEST_WALK, |horizon| {
        arrived.len() <= horizon
    }) && crate::budget::spend(chain.streams.len())
    {
        let game = chain.play();
        arrived.push(game.arrived);
        ended.push(game.ended);
        bonuses.push(game.bonus);
        ceiled.push(game.on_at_ceiling);
        if horizon.is_none() && arrived.len() > 1 && chain.going(None) < WALKED {
            break;
        }
    }
    let keep = 1.0 - odds.direct;
    let reached = |game: usize| {
        if game == 0 {
            1.0
        } else {
            keep.powi(i32::try_from(game).unwrap_or(i32::MAX))
        }
    };
    Walked {
        walk: with_direct(Walk { arrived, ended }, |_| odds.direct),
        bonuses: bonuses
            .iter()
            .enumerate()
            .map(|(game, bonus)| reached(game) * bonus)
            .collect(),
        on_at_ceiling: ceiled
            .iter()
            .enumerate()
            .map(|(game, ceiled)| reached(game) * ceiled)
            .sum(),
    }
}

/// The share of a chain's ends where play starts again at a bonus: the
/// bonuses that miss the AT.
fn restarts(odds: Odds<'_>, bonuses: &[f64]) -> Vec<f64> {
    bonuses
        .iter()
        .map(|bonus| bonus * (1.0 - odds.bonus_share))
        .collect()
}

/// A cycle under one setting, walked as a chain. Where play starts again at
/// a bonus that misses the AT, the chain is walked from an AT or such a
/// bonus to the next, and the AT comes after as many of those as it takes:
/// the cycle is one of them over the chance it ends in the AT. Where the
/// AT間天井 brings the trigger, the play it wins is a trigger each.
pub(crate) fn cycle(rules: &AtRules, odds: Odds<'_>, shares: &[f64]) -> Cycle {
    let Walked {
        walk,
        bonuses,
        on_at_ceiling,
    } = walked(rules, odds, shares, None);
    let length = u32::try_from(walk.ended.len())
        .ok()
        .and_then(std::num::NonZeroU32::new);
    let Some(length) = length else {
        return Cycle {
            triggers: f64::INFINITY,
            games: f64::INFINITY,
            ceiled: 0.0,
        };
    };
    let stretch = cycle_to_ceiling(&walk, length, false);
    let at: f64 = 1.0 - restarts(odds, &bonuses).iter().sum::<f64>();
    let ceiled = if rules.ceiling_triggers() {
        on_at_ceiling
    } else {
        0.0
    };
    Cycle {
        triggers: (stretch.triggers + ceiled) / at,
        games: stretch.games / at,
        ceiled: ceiled / at,
    }
}

/// The chance the next AT is won on each of the first `horizon` games after
/// one, walked as a chain: where play starts again at a bonus that misses
/// the AT, each start again carrying on from where it fell.
pub(crate) fn arrivals(rules: &AtRules, odds: Odds<'_>, shares: &[f64], horizon: u32) -> Vec<f64> {
    let horizon = horizon as usize;
    let Walked { walk, bonuses, .. } = walked(rules, odds, shares, Some(horizon));
    let again = restarts(odds, &bonuses);
    let ends: Vec<f64> = walk
        .ended
        .iter()
        .zip(&again)
        .map(|(ended, again)| ended - again)
        .collect();
    (1..=horizon).fold(Vec::with_capacity(horizon), |mut arrived, game| {
        let carried: f64 = (1..game)
            .map(|at| {
                again.get(at).copied().unwrap_or(0.0)
                    * arrived.get(game - at - 1).copied().unwrap_or(0.0)
            })
            .sum();
        arrived.push(ends.get(game).copied().unwrap_or(0.0) + carried);
        arrived
    })
}

/// How likely each mode is where play was first seen, walked as a chain
/// from the AT or the setting change: where the triggers missed told left
/// play when the last of them came, each mode then going the games since
/// without a trigger, through its zones, short of its ceilings.
pub(crate) fn started(rules: &AtRules, table: &AtTable, start: PathStart) -> Standing {
    let odds = Odds::of(table);
    let shares = table.allotments.of(start.after_reset);
    let possible = |index: usize| {
        rules.modes.get(index).is_some_and(|mode| {
            !(mode
                .at_ceiling
                .is_some_and(|ceiling| start.since_at >= ceiling.get())
                || mode.misses.is_some_and(|limit| start.misses > limit.get())
                || mode
                    .ceiling
                    .is_some_and(|ceiling| start.since_trigger >= ceiling.get())
                || passed_unbrought(mode, start))
        })
    };
    let quiet = |index: usize, from: u32, to: u32| {
        rules.modes.get(index).map_or(0.0, |mode| {
            let gates = odds.gates_of(index);
            let zones: f64 = (from as usize + 1..=to as usize)
                .map(|game| {
                    (1.0 - drawn_on(mode, gates, game))
                        * gate_on(gates, game).map_or(1.0, |gate| 1.0 - gate.at.value())
                })
                .product();
            (f64::from(to.saturating_sub(from)) * (-odds.chance_in(index)).ln_1p()).exp() * zones
        })
    };
    let lasting = |weights: &[f64], from: u32| -> Vec<f64> {
        weights
            .iter()
            .enumerate()
            .fold(vec![0.0; weights.len()], |mut lasted, (index, weight)| {
                let expiry = rules
                    .modes
                    .get(index)
                    .filter(|mode| expires(mode))
                    .and_then(|mode| mode.expiry)
                    .filter(|expiry| expiry.games.get() <= start.since_trigger);
                let (to, through) = match expiry {
                    Some(expiry) => {
                        let left = from + expiry.games.get();
                        (
                            expiry.to,
                            quiet(index, from, left) * quiet(expiry.to, left, start.since_at),
                        )
                    }
                    None => (index, quiet(index, from, start.since_at)),
                };
                if possible(to)
                    && let Some(cell) = lasted.get_mut(to)
                {
                    *cell += weight * through;
                }
                lasted
            })
    };
    let began = start
        .since_at
        .checked_sub(start.since_trigger)
        .filter(|_| start.misses > 0);
    let weights: Vec<f64> = match began {
        Some(began) => {
            let mut chain = Chain::from_at(rules, odds, shares, start.misses as usize + 2);
            for _ in 0..=began {
                chain.play();
            }
            lasting(&chain.began_last(start.misses as usize), began)
        }
        None => lasting(shares, start.since_at.saturating_sub(start.since_trigger)),
    };
    let (modes, _) = normalised(&weights, shares);
    Standing {
        since_trigger: start.since_trigger,
        since_at: start.since_at,
        misses: start.misses,
        modes,
        held: start
            .held
            .map_or_else(fresh, |held| vec![(Some(f64::from(held)), 1.0)]),
    }
}

/// The chance a leg is told as it was, play starting from an AT at the
/// shares given, walked as a chain: the AT won on its last game — outright
/// or otherwise — or none through it, after exactly the misses told, or
/// over every number where they were not.
pub(crate) fn told_leg(rules: &AtRules, table: &AtTable, shares: &[f64], leg: ToldLeg) -> f64 {
    let odds = Odds::of(table);
    let count = leg.misses.map(|misses| misses as usize);
    let games = leg.games as usize;
    if games == 0 {
        return if leg.won { 0.0 } else { shares.iter().sum() };
    }
    let mut chain =
        Chain::from_at(rules, odds, shares, count.map_or(0, |count| count + 2)).lumped();
    let keep = 1.0 - odds.direct;
    let lasted = |through: usize| keep.powi(i32::try_from(through).unwrap_or(i32::MAX));
    for _ in 0..games {
        chain.play();
    }
    let going = chain.going(count);
    let game = chain.play();
    if !leg.won {
        return lasted(games) * chain.going(count);
    }
    let won = count.map_or(game.ended, |count| {
        game.ended_by.get(count).copied().unwrap_or(0.0)
    });
    let direct = direct_on(odds.direct, &[], games);
    lasted(games - 1) * ((1.0 - direct) * won + direct * going)
}
