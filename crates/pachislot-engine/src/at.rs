//! An AT machine, solved exactly. Play is in one of its modes, which the
//! player never sees. Each regular game may bring the trigger — a CZ, or the
//! AT itself on a machine without one — at one chance below the mode's
//! ceiling and certainly on it; a trigger wins the AT at the setting's
//! success rate, certainly once it has missed so many times since the last
//! AT; and the AT間天井 wins it whatever came before.
//!
//! The published figures are a cycle's, from one AT to the next: the
//! triggers it brings and the games it lasts, worked out exactly by
//! convolving the games between triggers. A play is walked game by game,
//! the modes still possible weighed by how likely play was to have come
//! that way: each game is worth its chance of the AT, and the path's
//! likelihood is exact.

use std::num::NonZeroU32;

use std::collections::BTreeMap;

use pachislot_domain::normalized::{Allotments, AtRules, AtTable, ModeRule, PayoutLaw};
use pachislot_domain::observation::{AtSeen, LegEnd, Path, PathStart, ToldLeg, ToldPath};
use pachislot_domain::spec::Medals;

use crate::payout::{CapFigures, below, cap_figures, capped, headroom, set_chance};

/// What a cycle from one AT to the next comes to on average: the triggers it
/// brings, and the regular games it lasts.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Cycle {
    pub triggers: f64,
    pub games: f64,
}

impl Cycle {
    /// The trigger's published 合算, ceilings included.
    pub fn trigger_chance(self) -> f64 {
        self.triggers / self.games
    }

    /// The AT's published 初当たり, ceilings included.
    pub fn at_chance(self) -> f64 {
        1.0 / self.games
    }
}

/// The chance the `n`th game since the last trigger brings the next one,
/// with `p` below the ceiling and certainty on it; none past it.
fn interval(p: f64, ceiling: Option<NonZeroU32>, n: usize) -> f64 {
    let risk = 1.0 - p;
    let ceiling = ceiling.map_or(usize::MAX, |ceiling| ceiling.get() as usize);
    match n.cmp(&ceiling) {
        std::cmp::Ordering::Less => risk.powi(i32::try_from(n - 1).unwrap_or(i32::MAX)) * p,
        std::cmp::Ordering::Equal => risk.powi(i32::try_from(n - 1).unwrap_or(i32::MAX)),
        std::cmp::Ordering::Greater => 0.0,
    }
}

/// Games on average between triggers in a mode: `(1 − (1 − p)^C) / p`, or
/// `1 / p` without a ceiling.
fn games_between(p: f64, ceiling: Option<NonZeroU32>) -> f64 {
    let Some(ceiling) = ceiling else {
        return 1.0 / p;
    };
    let ceiling = f64::from(ceiling.get());
    if p <= 0.0 {
        ceiling
    } else {
        -(ceiling * (-p).ln_1p()).exp_m1() / p
    }
}

/// The chance the `j`th trigger since the last AT wins it.
fn success_of(j: u32, success: f64, misses: Option<NonZeroU32>) -> f64 {
    if misses.is_some_and(|misses| j > misses.get()) {
        1.0
    } else {
        success
    }
}

/// The games between triggers in a mode, as a running sum carries them:
/// geometric at `p` below the ceiling, so each game's share of `f ⋆ d`
/// follows from the one before rather than a sum over the ceiling.
#[derive(Clone, Copy)]
struct Between {
    p: f64,
    risk: f64,
    span: Option<usize>,
    tail: f64,
    decayed: f64,
}

impl Between {
    fn of(p: f64, ceiling: Option<NonZeroU32>) -> Self {
        let risk = 1.0 - p;
        let span = ceiling.map(|ceiling| ceiling.get() as usize);
        Self {
            p,
            risk,
            span,
            tail: span.map_or(0.0, |span| interval(p, ceiling, span)),
            decayed: span.map_or(0.0, |span| {
                risk.powi(i32::try_from(span - 1).unwrap_or(i32::MAX))
            }),
        }
    }

    /// Game `at` of `f ⋆ d`, from the running sum before it: the running
    /// sum at it, and where the next trigger falls on it. Only the games of
    /// `f` before `at` are read, so `f` may be written as it is read.
    fn step(self, f: &[f64], running: f64, at: usize) -> (f64, f64) {
        let before = |back: usize| -> f64 {
            at.checked_sub(back)
                .and_then(|at| f.get(at))
                .copied()
                .unwrap_or(0.0)
        };
        let dropped = self.span.map_or(0.0, |span| before(span) * self.decayed);
        let running = self.risk * running + before(1) - dropped;
        let reached = self.span.map_or(0.0, |span| before(span) * self.tail);
        (running, self.p * running + reached)
    }
}

/// The next trigger's games after the last, convolved onto where the last
/// fell: `f ⋆ d`, with `d` the games between triggers.
fn convolved(f: &[f64], p: f64, ceiling: Option<NonZeroU32>) -> Vec<f64> {
    let between = Between::of(p, ceiling);
    let (_, next) = (0..f.len()).fold(
        (0.0_f64, Vec::with_capacity(f.len())),
        |(running, mut next), at| {
            let (running, here) = between.step(f, running, at);
            next.push(here);
            (running, next)
        },
    );
    next
}

/// The triggers a mode brings on each of the first `length` regular games
/// of an AT, and the chance the AT is won on each, in one pass over the
/// games: what any shorter length brings is the same games cut short. The
/// triggers are told apart by their count since the AT only as far as the
/// スルー天井 makes it matter: each count is a stream of where its trigger
/// falls, fed by the misses of the count before it, the last counted fed
/// by its own; with no スルー天井 one stream feeds itself.
fn ended_by(
    p: f64,
    success: f64,
    mode: &ModeRule,
    length: usize,
    misses: Option<NonZeroU32>,
) -> Walk {
    let between = Between::of(p, mode.ceiling);
    let streams = misses.map_or(1, |misses| misses.get() as usize + 1);
    let wins: Vec<f64> = (1..=streams)
        .map(|j| success_of(u32::try_from(j).unwrap_or(u32::MAX), success, misses))
        .collect();
    let (_, _, _, arrived, ended) = (0..length).fold(
        (
            (0..streams)
                .map(|_| Vec::with_capacity(length))
                .collect::<Vec<Vec<f64>>>(),
            vec![0.0_f64; streams],
            vec![0.0_f64; streams],
            Vec::with_capacity(length),
            Vec::with_capacity(length),
        ),
        |(mut sources, mut running, mut here, mut arrived, mut ended), at| {
            for ((source, running), here) in sources.iter().zip(&mut running).zip(&mut here) {
                (*running, *here) = between.step(source, *running, at);
            }
            for (stream, source) in sources.iter_mut().enumerate() {
                let start = if stream == 0 && at == 0 { 1.0 } else { 0.0 };
                source.push(start + fed(&wins, &here, stream));
            }
            ended.push(here.iter().zip(&wins).map(|(here, wins)| here * wins).sum());
            arrived.push(here.iter().sum());
            (sources, running, here, arrived, ended)
        },
    );
    Walk { arrived, ended }
}

/// What tells two modes' walks apart: the trigger's ceiling and the
/// スルー天井, all a walk turns on short of the AT間天井 it is cut at.
type WalkKey = (Option<NonZeroU32>, Option<NonZeroU32>);

/// What a mode's triggers come to game by game after an AT: the chance a
/// trigger arrives on each, and the chance the AT is won on each.
struct Walk {
    arrived: Vec<f64>,
    ended: Vec<f64>,
}

/// What a stream is fed on a game: the misses there of the count before
/// it, and the last counted's of its own.
fn fed(wins: &[f64], here: &[f64], stream: usize) -> f64 {
    let from_before = stream
        .checked_sub(1)
        .map_or(0.0, |before| missed(wins, here, before));
    let from_itself = if stream + 1 == here.len() {
        missed(wins, here, stream)
    } else {
        0.0
    };
    from_before + from_itself
}

/// What a stream's trigger on a game leaves to the next: the chance it fell
/// there and missed.
fn missed(wins: &[f64], here: &[f64], stream: usize) -> f64 {
    here.get(stream).copied().unwrap_or(0.0) * (1.0 - wins.get(stream).copied().unwrap_or(1.0))
}

/// A cycle in one mode with an AT間天井 of `at_ceiling` games, which ends
/// it there at the latest: its trigger's walk cut short there.
fn cycle_to_ceiling(walk: &Walk, at_ceiling: NonZeroU32) -> Cycle {
    let length = at_ceiling.get() as usize;
    let triggers: f64 = walk.arrived.iter().take(length).sum();
    let ended = walk.ended.iter().take(length);
    let ended_before: f64 = ended.clone().sum();
    #[allow(
        clippy::cast_precision_loss,
        reason = "a game's number is far below where a float loses whole numbers"
    )]
    let games = ended
        .enumerate()
        .map(|(game, end)| game as f64 * end)
        .sum::<f64>()
        + f64::from(at_ceiling.get()) * (1.0 - ended_before);
    Cycle { triggers, games }
}

/// The chance the next AT is won on each of the first `horizon` regular
/// games after one, over the modes as an AT allots them: the `g`th game's
/// at `g − 1`, a mode's AT間天井 winning whatever is left on its game.
pub(crate) fn arrivals(
    rules: &AtRules,
    chance: f64,
    success: f64,
    shares: &[f64],
    horizon: u32,
) -> Vec<f64> {
    rules
        .modes
        .iter()
        .zip(shares)
        .fold(vec![0.0_f64; horizon as usize], |sum, (mode, share)| {
            let reach = mode
                .at_ceiling
                .map_or(horizon + 1, |ceiling| ceiling.get().min(horizon + 1));
            let Walk { ended, .. } = ended_by(chance, success, mode, reach as usize, mode.misses);
            let left = 1.0 - ended.iter().sum::<f64>();
            sum.iter()
                .zip(1_u32..)
                .map(|(total, game)| {
                    let here = if game < reach {
                        ended.get(game as usize).copied().unwrap_or(0.0)
                    } else if mode.at_ceiling.is_some_and(|ceiling| ceiling.get() == game) {
                        left
                    } else {
                        0.0
                    };
                    total + share * here
                })
                .collect()
        })
}

/// A cycle in one mode without an AT間天井, in closed form: the triggers
/// until one wins, each the games between triggers apart.
fn cycle_unceiled(p: f64, success: f64, mode: &ModeRule) -> Cycle {
    let triggers = match mode.misses {
        Some(misses) => (0..=misses.get())
            .map(|j| (1.0 - success).powi(i32::try_from(j).unwrap_or(i32::MAX)))
            .sum(),
        None if success > 0.0 => 1.0 / success,
        None => f64::INFINITY,
    };
    Cycle {
        triggers,
        games: triggers * games_between(p, mode.ceiling),
    }
}

/// A cycle under one setting, over the modes play may be in as an AT
/// allots them: in closed form in a mode without an AT間天井, and with one
/// its trigger's walk cut short there. Modes that share a trigger's
/// ceiling share its walk, taken as far as the longest AT間天井 among them.
pub fn cycle(rules: &AtRules, chance: f64, success: f64, shares: &[f64]) -> Cycle {
    let played: Vec<(&ModeRule, f64)> = rules
        .modes
        .iter()
        .zip(shares.iter().copied())
        .filter(|(_, share)| *share > 0.0)
        .collect();
    let walks: Vec<(WalkKey, Walk)> = played
        .iter()
        .filter_map(|(mode, _)| mode.at_ceiling.map(|at_ceiling| (mode, at_ceiling)))
        .fold(
            Vec::<(&ModeRule, NonZeroU32)>::new(),
            |mut longest, (mode, at_ceiling)| {
                match longest
                    .iter_mut()
                    .find(|(other, _)| other.ceiling == mode.ceiling && other.misses == mode.misses)
                {
                    Some(found) => found.1 = found.1.max(at_ceiling),
                    None => longest.push((mode, at_ceiling)),
                }
                longest
            },
        )
        .into_iter()
        .map(|(mode, at_ceiling)| {
            (
                (mode.ceiling, mode.misses),
                ended_by(
                    chance,
                    success,
                    mode,
                    at_ceiling.get() as usize,
                    mode.misses,
                ),
            )
        })
        .collect();
    played.iter().fold(
        Cycle {
            triggers: 0.0,
            games: 0.0,
        },
        |sum, (mode, share)| {
            let each = mode
                .at_ceiling
                .and_then(|at_ceiling| {
                    walks
                        .iter()
                        .find(|(key, _)| *key == (mode.ceiling, mode.misses))
                        .map(|(_, walk)| cycle_to_ceiling(walk, at_ceiling))
                })
                .unwrap_or_else(|| cycle_unceiled(chance, success, mode));
            Cycle {
                triggers: sum.triggers + share * each.triggers,
                games: sum.games + share * each.games,
            }
        },
    )
}

/// The shares play starts from after an AT: after any AT, or — where play
/// starts again as after a setting change once an AT reaches the cap — the
/// two mixed by the share of ATs that do.
pub(crate) fn after_at(rules: &AtRules, allotments: &Allotments, completion: f64) -> Vec<f64> {
    if !rules.reset_on_cap {
        return allotments.after_at.clone();
    }
    allotments
        .after_at
        .iter()
        .zip(&allotments.after_reset)
        .map(|(at, reset)| (1.0 - completion) * at + completion * reset)
        .collect()
}

/// What an AT comes to under a setting, over every AT play goes through:
/// the share that complete the 有利区間 and the medals one gains, the next
/// AT's arrivals within the window counted from the shares after an AT
/// that fell short.
pub(crate) fn cap_figures_of(
    rules: &AtRules,
    chance: f64,
    success: f64,
    allotments: &Allotments,
    payout: &PayoutLaw,
) -> CapFigures {
    let window = rules.window.map(NonZeroU32::get);
    let arrived = window.map_or_else(Vec::new, |window| {
        arrivals(rules, chance, success, &allotments.after_at, window)
    });
    cap_figures(
        payout,
        rules.cap.map(Medals::get),
        window,
        &arrived,
        rules.base.loss_per_game(),
    )
}

/// What an AT machine's setting settles to: what an AT comes to, and the
/// shares a cycle starts from given it.
pub fn settled(rules: &AtRules, table: &AtTable) -> (CapFigures, Vec<f64>) {
    let figures = cap_figures_of(
        rules,
        table.chance.value(),
        table.success.value(),
        &table.allotments,
        &table.payout,
    );
    let shares = after_at(rules, &table.allotments, figures.completion);
    (figures, shares)
}

/// Narrowings at most of the bracket a chance is found in: far more than
/// it takes, as each narrows it faster than the last.
const NARROWINGS: u32 = 200;

/// The trigger's chance a regular game below the ceilings that makes its
/// published 合算 — ceilings, misses and the AT間天井 included — come true,
/// over the modes as an AT allots them. The 合算 grows with the chance, so
/// the chance lies between none and a chance at which the 合算 is past
/// the published — the 合算 itself, or twice it and so on where an AT間天井
/// keeps the 合算 below its chance; it is found there by false position,
/// the end that stays halved in weight so that both ends close in (the
/// Illinois method). None when no chance can: the published figure as rare
/// as the ceilings allow or rarer, or past what any chance gives.
pub(crate) fn natural_chance(
    published: f64,
    rules: &AtRules,
    success: f64,
    shares: &[f64],
) -> Option<f64> {
    let gap = |p: f64| cycle(rules, p, success, shares).trigger_chance() - published;
    if !published.is_finite() || published >= 1.0 {
        return None;
    }
    let low = (0.0, gap(0.0));
    if low.1.is_nan() || low.1 >= 0.0 {
        return None;
    }
    let high = match above(published, gap) {
        Ok(high) => high,
        Err(found) => return found,
    };
    let found = (0..NARROWINGS).try_fold(
        Bracket {
            low,
            high,
            kept: Kept::Neither,
        },
        |bracket, _| bracket.narrowed(gap),
    );
    Some(found.map_or_else(|chance| chance, Bracket::nearer))
}

/// A chance from the 合算 up, doubled while the 合算 there falls short:
/// the first past the published with how far past, the chance itself where
/// the 合算 meets it there, or none where even certainty falls short.
fn above(published: f64, gap: impl Fn(f64) -> f64) -> Result<(f64, f64), Option<f64>> {
    let first = (published, gap(published));
    let (Ok(last) | Err(last)) = (0..f64::MAX_EXP).try_fold(first, |(chance, short), _| {
        if short >= 0.0 || chance >= 1.0 {
            Err((chance, short))
        } else {
            let next = (2.0 * chance).min(1.0);
            Ok((next, gap(next)))
        }
    });
    let (chance, short) = last;
    if short > 0.0 {
        Ok(last)
    } else if short == 0.0 {
        Err(Some(chance))
    } else {
        Err(None)
    }
}

/// Which end of a bracket the last narrowing kept.
#[derive(Clone, Copy, PartialEq)]
enum Kept {
    Neither,
    Low,
    High,
}

/// Where a chance is found: below it the gap is short, above it over.
#[derive(Clone, Copy)]
struct Bracket {
    low: (f64, f64),
    high: (f64, f64),
    kept: Kept,
}

impl Bracket {
    /// The bracket narrowed at the false position, or the chance there
    /// once the bracket closes on it.
    fn narrowed(self, gap: impl Fn(f64) -> f64) -> Result<Self, f64> {
        let ((low, below), (high, over)) = (self.low, self.high);
        let at = (low * over - high * below) / (over - below);
        if !(at > low && at < high) || high - low <= 4.0 * f64::EPSILON * high {
            return Err(self.nearer());
        }
        let here = gap(at);
        if here == 0.0 {
            return Err(at);
        }
        Ok(if here < 0.0 {
            Self {
                low: (at, here),
                high: if self.kept == Kept::High {
                    (high, over / 2.0)
                } else {
                    self.high
                },
                kept: Kept::High,
            }
        } else {
            Self {
                low: if self.kept == Kept::Low {
                    (low, below / 2.0)
                } else {
                    self.low
                },
                high: (at, here),
                kept: Kept::Low,
            }
        })
    }

    /// The end whose gap is the shorter.
    fn nearer(self) -> f64 {
        if self.low.1.abs() < self.high.1.abs() {
            self.low.0
        } else {
            self.high.0
        }
    }
}

/// Where play stands as a path is walked: games since the last trigger and
/// AT, triggers missed since that AT, how likely each mode is, and how
/// likely each sum the 有利区間 holds from the last AT — none where it
/// ended with it.
pub(crate) struct Standing {
    pub(crate) since_trigger: u32,
    pub(crate) since_at: u32,
    pub(crate) misses: u32,
    pub(crate) modes: Vec<f64>,
    pub(crate) held: Held,
}

/// The sums a 有利区間 may hold from the last AT, each with its weight;
/// none where it ended with it.
pub(crate) type Held = Vec<(Option<f64>, f64)>;

/// Nothing held: the 有利区間 starts afresh.
fn fresh() -> Held {
    vec![(None, 1.0)]
}

/// One mode's chances for the next game, where play stands so many games
/// since the last trigger and AT with so many triggers missed since that
/// AT: the AT, a missed trigger, nothing.
pub(crate) fn chances(
    table: &AtTable,
    mode: &ModeRule,
    since_trigger: u32,
    since_at: u32,
    misses: u32,
) -> (f64, f64, f64) {
    if mode
        .at_ceiling
        .is_some_and(|ceiling| since_at + 1 >= ceiling.get())
    {
        return (1.0, 0.0, 0.0);
    }
    let triggered = if mode
        .ceiling
        .is_some_and(|ceiling| since_trigger + 1 >= ceiling.get())
    {
        1.0
    } else {
        table.chance.value()
    };
    let wins = success_of(misses + 1, table.success.value(), mode.misses);
    (triggered * wins, triggered * (1.0 - wins), 1.0 - triggered)
}

/// What the next game's trigger pays on average in a mode, where it is a
/// bonus: its medals at the chance it comes, as the AT won on it or a
/// miss. An AT won on the AT間天井 is no trigger's and pays none of them.
pub(crate) fn trigger_medals(
    rules: &AtRules,
    mode: &ModeRule,
    since_at: u32,
    (at, missed): (f64, f64),
) -> f64 {
    let ceiled = mode
        .at_ceiling
        .is_some_and(|ceiling| since_at + 1 >= ceiling.get());
    match rules.trigger_payout {
        Some(payout) if !ceiled => (at + missed) * payout.medals.get(),
        _ => 0.0,
    }
}

/// The chance a mode lasts `games` regular games without a trigger.
fn lasting(mode: &ModeRule, chance: f64, games: u32) -> f64 {
    if mode.ceiling.is_some_and(|ceiling| games >= ceiling.get()) {
        0.0
    } else {
        (f64::from(games) * (-chance).ln_1p()).exp()
    }
}

/// What walking a path comes to under one setting: the theoretical medals
/// of its games, and its log-likelihood given where it started.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Walked {
    pub medals: f64,
    pub log_likelihood: f64,
}

fn normalised(weights: &[f64], fallback: &[f64]) -> (Vec<f64>, f64) {
    let total: f64 = weights.iter().sum();
    if total > 0.0 && total.is_finite() {
        (
            weights.iter().map(|weight| weight / total).collect(),
            total.ln(),
        )
    } else {
        (fallback.to_vec(), f64::NEG_INFINITY)
    }
}

/// The chance a mode brought `misses` triggers, one after another, in
/// exactly `games` regular games.
fn reached(mode: &ModeRule, chance: f64, misses: u32, games: u32) -> f64 {
    let start: Vec<f64> = (0..=games)
        .map(|at| if at == 0 { 1.0 } else { 0.0 })
        .collect();
    (0..misses)
        .fold(start, |f, _| convolved(&f, chance, mode.ceiling))
        .last()
        .copied()
        .unwrap_or(0.0)
}

/// How likely each mode is where play was first seen: the share an AT or a
/// setting change allots it, none where its AT間天井 is behind the games
/// since the last AT or its スルー天井 below the triggers missed since, times the chance it brought the triggers missed in
/// the games between the AT and the last of them, times the chance it then
/// went the games since without one. Where the counts cannot have come
/// about — misses given with no games between — the games since the last
/// trigger alone weigh the modes.
pub(crate) fn started(rules: &AtRules, table: &AtTable, start: PathStart) -> Standing {
    let shares = table.allotments.of(start.after_reset);
    let chance = table.chance.value();
    let between = start.since_at.checked_sub(start.since_trigger);
    let lasted: Vec<f64> = rules
        .modes
        .iter()
        .zip(shares)
        .map(|(mode, share)| {
            if mode
                .at_ceiling
                .is_some_and(|ceiling| start.since_at >= ceiling.get())
                || mode.misses.is_some_and(|limit| start.misses > limit.get())
            {
                0.0
            } else {
                share * lasting(mode, chance, start.since_trigger)
            }
        })
        .collect();
    let history = rules
        .modes
        .iter()
        .zip(&lasted)
        .map(|(mode, weight)| match between {
            Some(games) if start.misses > 0 => weight * reached(mode, chance, start.misses, games),
            _ => *weight,
        });
    let (fallback, _) = normalised(&lasted, shares);
    let (modes, _) = normalised(&history.collect::<Vec<_>>(), &fallback);
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

/// The headroom an AT won on the next game has, from what is held.
fn headroom_at(rules: &AtRules, held: Option<f64>, since_at: u32) -> Option<f64> {
    headroom(
        rules.cap.map(Medals::get),
        held,
        rules.window.map(NonZeroU32::get),
        since_at,
        rules.base.loss_per_game(),
    )
}

/// The medals an AT won on the next game gains, so many games since the
/// last AT, on average over what is held.
pub(crate) fn gain_now(rules: &AtRules, table: &AtTable, held: &Held, since_at: u32) -> f64 {
    held.iter()
        .map(|(held, weight)| {
            weight * capped(&table.payout, headroom_at(rules, *held, since_at)).gain
        })
        .sum()
}

/// What an AT seen as it was comes to from one sum held: how likely it is,
/// and what it leaves held — none once it reaches the cap — each with its
/// weight.
fn outcome(
    rules: &AtRules,
    payout: &PayoutLaw,
    headroom: Option<f64>,
    seen: AtSeen,
) -> (f64, Held) {
    let start = headroom
        .zip(rules.cap)
        .map_or(0.0, |(headroom, cap)| cap.get() - headroom);
    let at = capped(payout, headroom);
    let carried = |medals: f64| rules.cap.map(|_| start + medals);
    let short = || {
        seen.medals.map_or_else(
            || {
                below(payout, headroom)
                    .into_iter()
                    .map(|(medals, chance)| (carried(medals), chance))
                    .collect()
            },
            |medals| vec![(carried(f64::from(medals)), 1.0 - at.completion)],
        )
    };
    let counted = match (payout, seen.sets, seen.completed) {
        (
            PayoutLaw::Sets {
                first,
                set,
                continuation_rate,
            },
            Some(sets),
            completed,
        ) if completed != Some(true) => {
            let medals = first.get() + f64::from(sets) * set.get();
            Some(if headroom.is_none_or(|headroom| medals < headroom) {
                let chance = set_chance(continuation_rate.value(), sets);
                let kept = seen.medals.map_or(medals, f64::from);
                (chance, vec![(carried(kept), chance)])
            } else {
                (at.completion, vec![(None, at.completion)])
            })
        }
        _ => None,
    };
    counted.unwrap_or_else(|| match seen.completed {
        Some(true) => (at.completion, vec![(None, at.completion)]),
        Some(false) => (1.0 - at.completion, short()),
        None => (
            1.0,
            [(None, at.completion)].into_iter().chain(short()).collect(),
        ),
    })
}

/// Sums held, merged to the whole medal, their weights made to sum to one.
#[allow(
    clippy::cast_possible_truncation,
    clippy::cast_precision_loss,
    reason = "medals held are below the cap, far inside an i64"
)]
fn merged(held: Held) -> Held {
    let total: f64 = held.iter().map(|(_, weight)| weight).sum();
    if total <= 0.0 || !total.is_finite() {
        return fresh();
    }
    held.into_iter()
        .fold(
            BTreeMap::<Option<i64>, f64>::new(),
            |mut sums, (medals, weight)| {
                *sums
                    .entry(medals.map(|medals| medals.round() as i64))
                    .or_insert(0.0) += weight / total;
                sums
            },
        )
        .into_iter()
        .map(|(medals, weight)| (medals.map(|medals| medals as f64), weight))
        .collect()
}

/// Play after an AT seen as it was: its likelihood from what was held, the
/// sums it leaves held, and the modes play starts in — as after a setting
/// change for the share that reached the cap where the machine says so.
fn after_won(
    rules: &AtRules,
    table: &AtTable,
    standing: &Standing,
    seen: AtSeen,
) -> (Standing, f64) {
    let each: Vec<(f64, Held)> = standing
        .held
        .iter()
        .map(|(held, weight)| {
            let (likely, left) = outcome(
                rules,
                &table.payout,
                headroom_at(rules, *held, standing.since_at),
                seen,
            );
            (
                weight * likely,
                left.into_iter()
                    .map(|(medals, share)| (medals, weight * share))
                    .collect(),
            )
        })
        .collect();
    let likely: f64 = each.iter().map(|(likely, _)| likely).sum();
    let left: Held = each.into_iter().flat_map(|(_, left)| left).collect();
    let total: f64 = left.iter().map(|(_, weight)| weight).sum();
    let completed = if total > 0.0 {
        left.iter()
            .filter(|(medals, _)| medals.is_none() && rules.cap.is_some())
            .map(|(_, weight)| weight)
            .sum::<f64>()
            / total
    } else {
        0.0
    };
    let after = Standing {
        since_trigger: 0,
        since_at: 0,
        misses: 0,
        modes: after_at(rules, &table.allotments, completed),
        held: merged(left),
    };
    (after, likely.ln())
}

/// One game walked: its theoretical medals, then how it ended, which
/// reweighs the modes and moves play on.
fn played(
    rules: &AtRules,
    table: &AtTable,
    standing: &Standing,
    end: LegEnd,
) -> (Standing, f64, f64) {
    let each: Vec<(f64, f64, f64)> = rules
        .modes
        .iter()
        .map(|mode| {
            chances(
                table,
                mode,
                standing.since_trigger,
                standing.since_at,
                standing.misses,
            )
        })
        .collect();
    let winning: f64 = each
        .iter()
        .zip(&standing.modes)
        .map(|((at, _, _), weight)| at * weight)
        .sum();
    let bonuses: f64 = rules
        .modes
        .iter()
        .zip(&each)
        .zip(&standing.modes)
        .map(|((mode, (at, missed, _)), weight)| {
            weight * trigger_medals(rules, mode, standing.since_at, (*at, *missed))
        })
        .sum();
    let medals = gain_now(rules, table, &standing.held, standing.since_at) * winning + bonuses
        - rules.base.loss_per_game();
    let seen = each
        .iter()
        .zip(&standing.modes)
        .map(|((at, missed, going), weight)| {
            weight
                * match end {
                    LegEnd::Going => *going,
                    LegEnd::Missed => *missed,
                    LegEnd::WonAt(_) => *at,
                }
        });
    let (modes, log) = normalised(&seen.collect::<Vec<_>>(), &standing.modes);
    let (after, seen) = match end {
        LegEnd::Going => (
            Standing {
                since_trigger: standing.since_trigger + 1,
                since_at: standing.since_at + 1,
                misses: standing.misses,
                modes,
                held: standing.held.clone(),
            },
            0.0,
        ),
        LegEnd::Missed => (
            Standing {
                since_trigger: 0,
                since_at: standing.since_at + 1,
                misses: standing.misses + 1,
                modes,
                held: standing.held.clone(),
            },
            0.0,
        ),
        LegEnd::WonAt(seen) => after_won(rules, table, standing, seen),
    };
    (after, medals, log + seen)
}

/// A trigger missed or an AT won on a game no leg counted — one the counter
/// showed only after the line before it was written: play moves on as it
/// says, and when it came is not weighed, since it is not known; how an AT
/// went still is.
fn unseen(rules: &AtRules, table: &AtTable, standing: Standing, end: LegEnd) -> (Standing, f64) {
    match end {
        LegEnd::Going => (standing, 0.0),
        LegEnd::Missed => (
            Standing {
                since_trigger: 0,
                misses: standing.misses + 1,
                ..standing
            },
            0.0,
        ),
        LegEnd::WonAt(seen) => after_won(rules, table, &standing, seen),
    }
}

/// A path walked under one setting, game by game: each game's theoretical
/// medals — what an AT gains there, from what the 有利区間 holds, at its
/// chance there, and what a bonus that is the trigger pays at its own,
/// less what the ベース says —
/// and the likelihood of how each game ended. A leg of no games that ends in
/// a trigger or an AT is one nobody saw come.
pub fn walk(path: &Path, rules: &AtRules, table: &AtTable) -> Walked {
    let first = started(rules, table, path.start);
    let (_, medals, log_likelihood) =
        path.legs
            .iter()
            .fold((first, 0.0_f64, 0.0_f64), |(standing, medals, log), leg| {
                if leg.games == 0 {
                    let (after, seen) = unseen(rules, table, standing, leg.end);
                    return (after, medals, log + seen);
                }
                (1..=leg.games).fold((standing, medals, log), |(standing, medals, log), game| {
                    let end = if game == leg.games {
                        leg.end
                    } else {
                        LegEnd::Going
                    };
                    let (after, gained, seen) = played(rules, table, &standing, end);
                    (after, medals + gained, log + seen)
                })
            });
    Walked {
        medals,
        log_likelihood,
    }
}

/// The triggers' games in one mode within `horizon` games of an AT: for
/// each count `j` from none on, where the `j`th trigger may fall, with the
/// chance every trigger before it missed — stopped once no more can come.
fn triggers_by_count(
    p: f64,
    success: f64,
    mode: &ModeRule,
    horizon: usize,
    misses: Option<NonZeroU32>,
    most: u32,
) -> Vec<(Vec<f64>, f64)> {
    let start: Vec<f64> = (0..horizon)
        .map(|at| if at == 0 { 1.0 } else { 0.0 })
        .collect();
    (1..=most).fold(vec![(start, 1.0_f64)], |mut counts, j| {
        let Some((previous, alive)) = counts.last().cloned() else {
            return counts;
        };
        if alive <= 0.0 || previous.iter().sum::<f64>() < f64::EPSILON * f64::EPSILON {
            return counts;
        }
        let at = convolved(&previous, p, mode.ceiling);
        let wins = success_of(j, success, misses);
        counts.push((at, alive * (1.0 - wins)));
        counts
    })
}

/// The chance a trigger count `j` has been reached by game `game`: always
/// for none, and by the `j`th trigger's games otherwise.
fn reached_by(counts: &[(Vec<f64>, f64)], j: usize, game: usize) -> f64 {
    if j == 0 {
        return 1.0;
    }
    counts
        .get(j)
        .map_or(0.0, |(at, _)| at.iter().take(game + 1).sum())
}

/// The chance one mode tells a leg as it was told: an AT won on its last
/// game, or none through it — after exactly the triggers missed told, or
/// over every number where they were not. On the mode's AT間天井 the AT
/// comes whatever the triggers did; past it no leg goes on.
fn told_leg_in_mode(p: f64, success: f64, mode: &ModeRule, leg: ToldLeg) -> f64 {
    let games = leg.games as usize;
    let ceiling = mode.at_ceiling.map(|ceiling| ceiling.get() as usize);
    if ceiling.is_some_and(|ceiling| games > ceiling || (games == ceiling && !leg.won)) {
        return 0.0;
    }
    let on_ceiling = ceiling.is_some_and(|ceiling| games == ceiling);
    let most = leg
        .misses
        .map_or(u32::try_from(games).unwrap_or(u32::MAX), |misses| {
            misses + 1
        });
    let counts = triggers_by_count(p, success, mode, games + 1, mode.misses, most);
    let alive = |j: usize| counts.get(j).map_or(0.0, |(_, alive)| *alive);
    let won_at = |j: usize, game: usize| -> f64 {
        counts
            .get(j)
            .and_then(|(at, _)| at.get(game))
            .copied()
            .unwrap_or(0.0)
            * alive(j - 1)
            * success_of(u32::try_from(j).unwrap_or(u32::MAX), success, mode.misses)
    };
    let quiet = |k: usize, through: usize| {
        alive(k) * (reached_by(&counts, k, through) - reached_by(&counts, k + 1, through))
    };
    let last = games.saturating_sub(1);
    match (leg.won, leg.misses, on_ceiling) {
        (true, Some(misses), true) => quiet(misses as usize, last),
        (true, None, true) => {
            1.0 - (1..games)
                .map(|game| (1..counts.len()).map(|j| won_at(j, game)).sum::<f64>())
                .sum::<f64>()
        }
        (true, Some(misses), false) => won_at(misses as usize + 1, games),
        (true, None, false) => (1..counts.len()).map(|j| won_at(j, games)).sum(),
        (false, Some(misses), _) => quiet(misses as usize, games),
        (false, None, _) => {
            1.0 - (1..=games)
                .map(|game| (1..counts.len()).map(|j| won_at(j, game)).sum::<f64>())
                .sum::<f64>()
        }
    }
}

/// The chance a leg is told as it was, over the modes by their shares.
fn told_leg(rules: &AtRules, table: &AtTable, shares: &[f64], leg: ToldLeg) -> f64 {
    let p = table.chance.value();
    let success = table.success.value();
    rules
        .modes
        .iter()
        .zip(shares)
        .map(|(mode, share)| share * told_leg_in_mode(p, success, mode, leg))
        .sum()
}

/// The log-likelihood of an AT machine's play told by its totals, under
/// one setting: each leg weighed over the modes as play stood when it
/// began — as a setting change or an AT allots them where play began after
/// one, and as a cycle starts from after an AT for every leg after the
/// first, the 有利区間's carry left unweighed, which a history does not
/// say. Where play began after no setting change, the first leg is taken
/// as if from an AT. The first leg is counted from the last AT, its games
/// since then added in, given that no AT came in those: a cabinet sat down
/// at is one whose AT had not yet come.
pub fn told_log_likelihood(told: &ToldPath, rules: &AtRules, table: &AtTable) -> f64 {
    let (_, after_an_at) = settled(rules, table);
    let first = if told.after_reset {
        table.allotments.of(true).to_vec()
    } else {
        after_an_at.clone()
    };
    let unseen = told_leg(
        rules,
        table,
        &first,
        ToldLeg {
            games: told.since_at,
            won: false,
            misses: None,
        },
    );
    told.legs
        .iter()
        .enumerate()
        .scan(first, |shares, (index, leg)| {
            let likely = if index == 0 {
                told_leg(
                    rules,
                    table,
                    shares,
                    ToldLeg {
                        games: leg.games + told.since_at,
                        ..*leg
                    },
                ) / unseen
            } else {
                told_leg(rules, table, shares, *leg)
            };
            if leg.won {
                shares.clone_from(&after_an_at);
            }
            Some(likely.max(0.0).ln())
        })
        .sum()
}
