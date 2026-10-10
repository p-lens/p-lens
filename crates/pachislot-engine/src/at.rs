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
use pachislot_domain::observation::{AtSeen, LegEnd, Path, PathStart};
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

/// The next trigger's games after the last, convolved onto where the last
/// fell: `f ⋆ d`, with `d` the games between triggers. The games between
/// are geometric below the ceiling, so a running sum gives each game in
/// turn rather than a sum over the ceiling.
fn convolved(f: &[f64], p: f64, ceiling: Option<NonZeroU32>) -> Vec<f64> {
    let risk = 1.0 - p;
    let span = ceiling.map(|ceiling| ceiling.get() as usize);
    let tail = span.map_or(0.0, |span| interval(p, ceiling, span));
    let decayed = span.map_or(0.0, |span| {
        risk.powi(i32::try_from(span - 1).unwrap_or(i32::MAX))
    });
    let before = |at: usize, back: usize| -> f64 {
        at.checked_sub(back)
            .and_then(|at| f.get(at))
            .copied()
            .unwrap_or(0.0)
    };
    let (_, next) = (0..f.len()).fold(
        (0.0_f64, Vec::with_capacity(f.len())),
        |(running, mut next), at| {
            let dropped = span.map_or(0.0, |span| before(at, span) * decayed);
            let running = risk * running + before(at, 1) - dropped;
            let reached = span.map_or(0.0, |span| before(at, span) * tail);
            next.push(p * running + reached);
            (running, next)
        },
    );
    next
}

/// The triggers a mode brings within `length` regular games of an AT, and
/// the chance the AT is won on each game: the triggers' games convolved one
/// after another, each alive while every trigger before it missed.
fn ended_by(
    p: f64,
    success: f64,
    mode: &ModeRule,
    length: usize,
    misses: Option<NonZeroU32>,
) -> (f64, Vec<f64>) {
    let start: Vec<f64> = (0..length)
        .map(|at| if at == 0 { 1.0 } else { 0.0 })
        .collect();
    let most = u32::try_from(length).unwrap_or(u32::MAX);
    let (_, _, triggers, ended) = (1..=most)
        .try_fold(
            (start, 1.0_f64, 0.0_f64, vec![0.0_f64; length]),
            |(previous, alive, triggers, mut ended), j| {
                let at = convolved(&previous, p, mode.ceiling);
                let wins = success_of(j, success, misses);
                let arrived: f64 = at.iter().sum::<f64>() * alive;
                ended
                    .iter_mut()
                    .zip(&at)
                    .for_each(|(end, here)| *end += here * alive * wins);
                let next = (at, alive * (1.0 - wins), triggers + arrived, ended);
                if next.1 <= 0.0 || arrived < f64::EPSILON * f64::EPSILON {
                    Err(next)
                } else {
                    Ok(next)
                }
            },
        )
        .unwrap_or_else(|stopped| stopped);
    (triggers, ended)
}

/// A cycle in one mode with an AT間天井 of `at_ceiling` games, which ends
/// it there at the latest.
fn cycle_to_ceiling(
    p: f64,
    success: f64,
    mode: &ModeRule,
    at_ceiling: NonZeroU32,
    misses: Option<NonZeroU32>,
) -> Cycle {
    let (triggers, ended) = ended_by(p, success, mode, at_ceiling.get() as usize, misses);
    let ended_before: f64 = ended.iter().sum();
    #[allow(
        clippy::cast_precision_loss,
        reason = "a game's number is far below where a float loses whole numbers"
    )]
    let games = ended
        .iter()
        .enumerate()
        .map(|(game, end)| game as f64 * end)
        .sum::<f64>()
        + f64::from(at_ceiling.get()) * (1.0 - ended_before);
    Cycle { triggers, games }
}

/// The chance the next AT is won on each of the first `horizon` regular
/// games after one, over the modes as an AT allots them: the `g`th game's
/// at `g − 1`, the AT間天井 winning whatever is left on its game.
pub(crate) fn arrivals(
    rules: &AtRules,
    chance: f64,
    success: f64,
    shares: &[f64],
    horizon: u32,
) -> Vec<f64> {
    let reach = rules
        .at_ceiling
        .map_or(horizon + 1, |ceiling| ceiling.get().min(horizon + 1));
    rules
        .modes
        .iter()
        .zip(shares)
        .fold(vec![0.0_f64; horizon as usize], |sum, (mode, share)| {
            let (_, ended) = ended_by(chance, success, mode, reach as usize, rules.misses);
            let left = 1.0 - ended.iter().sum::<f64>();
            sum.iter()
                .zip(1_u32..)
                .map(|(total, game)| {
                    let here = if game < reach {
                        ended.get(game as usize).copied().unwrap_or(0.0)
                    } else if rules
                        .at_ceiling
                        .is_some_and(|ceiling| ceiling.get() == game)
                    {
                        left
                    } else {
                        0.0
                    };
                    total + share * here
                })
                .collect()
        })
}

/// A cycle in one mode: in closed form without an AT間天井 — the triggers
/// until one wins, each the games between triggers apart — and convolved to
/// the ceiling with one.
fn cycle_in_mode(p: f64, success: f64, mode: &ModeRule, rules: &AtRules) -> Cycle {
    if let Some(at_ceiling) = rules.at_ceiling {
        return cycle_to_ceiling(p, success, mode, at_ceiling, rules.misses);
    }
    let triggers = match rules.misses {
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

/// A cycle under one setting, over the modes as an AT allots them.
pub fn cycle(rules: &AtRules, chance: f64, success: f64, shares: &[f64]) -> Cycle {
    rules.modes.iter().zip(shares).fold(
        Cycle {
            triggers: 0.0,
            games: 0.0,
        },
        |sum, (mode, share)| {
            let each = cycle_in_mode(chance, success, mode, rules);
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

/// Halvings enough to pin a chance to the last bit a float has.
const HALVINGS: u32 = 120;

/// The trigger's chance a regular game below the ceilings that makes its
/// published 合算 — ceilings, misses and the AT間天井 included — come true,
/// over the modes as an AT allots them: found by halving, since the 合算
/// grows with the chance. None when no chance can: the published figure as
/// rare as the ceilings allow, or rarer.
pub(crate) fn natural_chance(
    published: f64,
    rules: &AtRules,
    success: f64,
    shares: &[f64],
) -> Option<f64> {
    let rate = |p: f64| cycle(rules, p, success, shares).trigger_chance();
    if !published.is_finite() || published <= rate(f64::MIN_POSITIVE) || published >= 1.0 {
        return None;
    }
    let (low, high) = (0..HALVINGS).fold((0.0_f64, 1.0_f64), |(low, high), _| {
        let middle = f64::midpoint(low, high);
        if rate(middle) < published {
            (middle, high)
        } else {
            (low, middle)
        }
    });
    Some(f64::midpoint(low, high))
}

/// Where play stands as a path is walked: games since the last trigger and
/// AT, triggers missed since that AT, how likely each mode is, and how
/// likely each sum the 有利区間 holds from the last AT — none where it
/// ended with it.
struct Standing {
    since_trigger: u32,
    since_at: u32,
    misses: u32,
    modes: Vec<f64>,
    held: Held,
}

/// The sums a 有利区間 may hold from the last AT, each with its weight;
/// none where it ended with it.
type Held = Vec<(Option<f64>, f64)>;

/// Nothing held: the 有利区間 starts afresh.
fn fresh() -> Held {
    vec![(None, 1.0)]
}

/// One mode's chances for the next game: the AT, a missed trigger, nothing.
fn chances(
    rules: &AtRules,
    table: &AtTable,
    mode: &ModeRule,
    standing: &Standing,
) -> (f64, f64, f64) {
    if rules
        .at_ceiling
        .is_some_and(|ceiling| standing.since_at + 1 >= ceiling.get())
    {
        return (1.0, 0.0, 0.0);
    }
    let triggered = if mode
        .ceiling
        .is_some_and(|ceiling| standing.since_trigger + 1 >= ceiling.get())
    {
        1.0
    } else {
        table.chance.value()
    };
    let wins = success_of(standing.misses + 1, table.success.value(), rules.misses);
    (triggered * wins, triggered * (1.0 - wins), 1.0 - triggered)
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
/// setting change allots it, times the chance it brought the triggers
/// missed in the games between the AT and the last of them, times the
/// chance it then went the games since without one. Where the counts
/// cannot have come about — misses given with no games between — the
/// games since the last trigger alone weigh the modes.
fn started(rules: &AtRules, table: &AtTable, start: PathStart) -> Standing {
    let shares = table.allotments.of(start.after_reset);
    let chance = table.chance.value();
    let between = start.since_at.checked_sub(start.since_trigger);
    let lasted: Vec<f64> = rules
        .modes
        .iter()
        .zip(shares)
        .map(|(mode, share)| share * lasting(mode, chance, start.since_trigger))
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

/// The medals an AT won on the next game gains, on average over what is held.
fn gain_now(rules: &AtRules, table: &AtTable, standing: &Standing) -> f64 {
    standing
        .held
        .iter()
        .map(|(held, weight)| {
            weight * capped(&table.payout, headroom_at(rules, *held, standing.since_at)).gain
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
        .map(|mode| chances(rules, table, mode, standing))
        .collect();
    let winning: f64 = each
        .iter()
        .zip(&standing.modes)
        .map(|((at, _, _), weight)| at * weight)
        .sum();
    let medals = gain_now(rules, table, standing) * winning - rules.base.loss_per_game();
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
/// chance there, less what the ベース says —
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
