use pachislot_domain::distribution::Distribution;
use pachislot_domain::normalized::{AtRules, NormalizedSpec, SettingLevelTable, WatchRule};
use pachislot_domain::observation::{Path, Segment, ToldPath};
use pachislot_domain::probability::BasisPoints;
use pachislot_domain::setting_level::SettingLevel;
use pachislot_domain::spec::EntityId;

use crate::at::{told_log_likelihood, walk};
use crate::error::InferenceError;

/// How likely each of the machine's settings is, given the prior and what
/// was seen. Sums to one.
#[derive(Clone, Debug, PartialEq)]
pub struct Posterior {
    pub setting_levels: Vec<(SettingLevel, f64)>,
}

/// The prior as log-weights in the spec's order of settings: an even spread
/// when none is given, `-inf` for a setting ruled out.
fn log_prior(
    spec: &NormalizedSpec,
    prior: Option<&Distribution>,
) -> Result<Vec<f64>, InferenceError> {
    let Some(Distribution(shares)) = prior else {
        return Ok(spec.tables.iter().map(|_| 0.0).collect());
    };
    if let Some((setting_level, _)) = shares
        .0
        .iter()
        .find(|(setting_level, _)| spec.table(*setting_level).is_none())
    {
        return Err(InferenceError::PriorMismatch {
            setting_level: *setting_level,
        });
    }
    let sum: u32 = shares.0.iter().map(|(_, share)| share.get()).sum();
    if sum != BasisPoints::WHOLE.get() {
        return Err(InferenceError::InvalidPrior { sum });
    }
    spec.tables
        .iter()
        .map(|table| {
            shares
                .get(table.setting_level)
                .map(|share| f64::from(share.get()).ln())
                .ok_or(InferenceError::PriorMismatch {
                    setting_level: table.setting_level,
                })
        })
        .collect()
}

/// Whether two ids would count the same games: the same id, or a bonus and
/// one of its parts.
fn overlap(spec: &NormalizedSpec, left: &EntityId, right: &EntityId) -> bool {
    left == right
        || spec.tables.iter().any(|table| {
            table
                .events
                .iter()
                .any(|event| event.answers_to(left) && event.answers_to(right))
        })
}

/// Whether an id is a watch's cue, which no regular game comes up with.
fn is_cue(table: &SettingLevelTable, id: &EntityId) -> bool {
    table.cues.iter().any(|cue| cue.id == *id)
}

/// How many of a bonus a stretch counted: the bonus itself, or its parts.
fn bonuses_counted(table: &SettingLevelTable, segment: &Segment, bonus: &EntityId) -> u64 {
    segment
        .counts
        .iter()
        .filter(|(id, _)| {
            id == bonus
                || table
                    .events
                    .iter()
                    .any(|event| event.id == *id && event.group.as_ref() == Some(bonus))
        })
        .map(|(_, count)| u64::from(*count))
        .sum()
}

/// A watch's cues a stretch counted, each with its chance on a trial; none
/// where it did not watch, and a stretch watched where it counts any of
/// them, none of it included.
fn cues_counted(
    table: &SettingLevelTable,
    segment: &Segment,
    watch: &WatchRule,
) -> Vec<(f64, u64)> {
    table
        .cues
        .iter()
        .filter(|cue| cue.watch == watch.id)
        .filter_map(|cue| {
            segment
                .counts
                .iter()
                .find(|(id, _)| *id == cue.id)
                .map(|(_, count)| (cue.chance.value(), u64::from(*count)))
        })
        .collect()
}

/// The trials a stretch watched of a watch whose cues are not certain:
/// every trial of each of its bonus counted.
fn trials_watched(table: &SettingLevelTable, segment: &Segment, watch: &WatchRule) -> u64 {
    bonuses_counted(table, segment, &watch.bonus) * u64::from(watch.trials.get())
}

fn check_cues(
    spec: &NormalizedSpec,
    index: usize,
    segment: &Segment,
) -> Result<(), InferenceError> {
    let Some(table) = spec.tables.first() else {
        return Ok(());
    };
    spec.watches
        .iter()
        .filter(|watch| !watch.whole)
        .find(|watch| {
            let seen: u64 = cues_counted(table, segment, watch)
                .iter()
                .map(|(_, count)| count)
                .sum();
            seen > trials_watched(table, segment, watch)
        })
        .map_or(Ok(()), |watch| {
            Err(InferenceError::CuesExceedTrials {
                segment: index,
                id: watch.id.clone(),
            })
        })
}

fn check_segment(
    spec: &NormalizedSpec,
    index: usize,
    segment: &Segment,
) -> Result<(), InferenceError> {
    let known = |id: &EntityId| {
        spec.tables
            .iter()
            .any(|table| is_cue(table, id) || table.events.iter().any(|event| event.answers_to(id)))
    };
    if let Some((id, _)) = segment.counts.iter().find(|(id, _)| !known(id)) {
        return Err(InferenceError::UnknownCount {
            segment: index,
            id: id.clone(),
        });
    }
    let overlapping = segment
        .counts
        .iter()
        .enumerate()
        .find(|(position, (id, _))| {
            segment
                .counts
                .iter()
                .skip(position + 1)
                .any(|(other, _)| overlap(spec, id, other))
        });
    if let Some((_, (id, _))) = overlapping {
        return Err(InferenceError::OverlappingCounts {
            segment: index,
            id: id.clone(),
        });
    }
    let counted: u64 = segment
        .counts
        .iter()
        .filter(|(id, _)| !spec.tables.iter().any(|table| is_cue(table, id)))
        .map(|(_, count)| u64::from(*count))
        .sum();
    if counted > u64::from(segment.games) {
        return Err(InferenceError::CountsExceedGames { segment: index });
    }
    check_cues(spec, index, segment)
}

/// `n f`, taking `0 f` as nothing even where `f` is infinite: an outcome that
/// cannot happen and did not costs no likelihood.
fn times(count: u64, log: f64) -> f64 {
    if count == 0 {
        0.0
    } else {
        #[allow(clippy::cast_precision_loss)]
        let count = count as f64;
        count * log
    }
}

/// The log-likelihood of what a stretch counted of one watch under one
/// setting's table, without the coefficient: of a watch whose cues are
/// certain, each cue's share among them over the trials it counted; of one
/// whose are not, every trial of its bonus, those with no cue counted as
/// showing none. Nothing where the stretch did not watch it.
fn watch_log_likelihood(table: &SettingLevelTable, segment: &Segment, watch: &WatchRule) -> f64 {
    let counted = cues_counted(table, segment, watch);
    if counted.is_empty() {
        return 0.0;
    }
    let covered: f64 = table
        .cues
        .iter()
        .filter(|cue| cue.watch == watch.id)
        .map(|cue| cue.chance.value())
        .sum();
    let seen: u64 = counted.iter().map(|(_, count)| count).sum();
    let shown: f64 = counted
        .iter()
        .map(|(chance, count)| times(*count, chance.ln()))
        .sum();
    if watch.whole {
        shown - times(seen, covered.ln())
    } else {
        let rest = trials_watched(table, segment, watch).saturating_sub(seen);
        shown + times(rest, (-covered).ln_1p())
    }
}

/// The multinomial log-likelihood of one stretch under one setting's table,
/// without the coefficient, which is the same for every setting. The games
/// that came up with nothing counted share what probability is left; each
/// watch the stretch watched adds its own.
fn log_likelihood(watches: &[WatchRule], table: &SettingLevelTable, segment: &Segment) -> f64 {
    regular_log_likelihood(table, segment)
        + watches
            .iter()
            .map(|watch| watch_log_likelihood(table, segment, watch))
            .sum::<f64>()
}

/// The regular games' part of a stretch's log-likelihood: every count but
/// a watch's cues.
fn regular_log_likelihood(table: &SettingLevelTable, segment: &Segment) -> f64 {
    let chance = |id: &EntityId| -> f64 {
        table
            .events
            .iter()
            .filter(|event| event.answers_to(id))
            .map(|event| event.chance.value())
            .sum()
    };
    let (counted, covered, log) = segment
        .counts
        .iter()
        .filter(|(id, _)| !is_cue(table, id))
        .fold((0_u64, 0.0, 0.0), |(counted, covered, log), (id, count)| {
            let probability = chance(id);
            (
                counted + u64::from(*count),
                covered + probability,
                log + times(u64::from(*count), probability.ln()),
            )
        });
    let rest = u64::from(segment.games).saturating_sub(counted);
    log + times(rest, (-covered).ln_1p())
}

/// `ln Σ exp(x)`, by the largest term so nothing overflows; `-inf` when every
/// term is.
fn log_sum_exp(values: &[f64]) -> f64 {
    let largest = values.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    if !largest.is_finite() {
        return largest;
    }
    largest
        + values
            .iter()
            .map(|value| (value - largest).exp())
            .sum::<f64>()
            .ln()
}

/// The log-likelihood of an AT machine's path under one setting's table:
/// nothing when there is none.
fn path_log_likelihood(
    table: &SettingLevelTable,
    rules: Option<&AtRules>,
    path: Option<&Path>,
) -> f64 {
    match (rules, table.at.as_ref(), path) {
        (Some(rules), Some(at), Some(path)) => walk(path, rules, at).log_likelihood,
        _ => 0.0,
    }
}

/// How likely each setting is, given a prior — an even spread when there is
/// none — the segments of games counted, and on an AT machine the path its
/// play went through.
///
/// # Errors
/// When a count names something the spec lacks or counts games twice, a
/// segment counts more than it played or more of a watch's cues than the
/// trials of its bonus it counted, a path is given for a machine with
/// no AT, the prior does not match the machine's settings or sum to 100%,
/// or what was seen is impossible under every setting the prior allows.
pub fn posterior(
    spec: &NormalizedSpec,
    prior: Option<&Distribution>,
    segments: &[Segment],
    path: Option<&Path>,
) -> Result<Posterior, InferenceError> {
    segments
        .iter()
        .enumerate()
        .try_for_each(|(index, segment)| check_segment(spec, index, segment))?;
    if path.is_some() && spec.at_rules.is_none() {
        return Err(InferenceError::PathWithoutAt);
    }
    weighed(spec, prior, |table| {
        segments
            .iter()
            .map(|segment| log_likelihood(&spec.watches, table, segment))
            .sum::<f64>()
            + path_log_likelihood(table, spec.at_rules.as_ref(), path)
    })
}

/// How likely each setting of an AT machine is, given a prior — an even
/// spread when there is none — and its play told by its totals afterwards.
///
/// # Errors
/// When the machine has no AT, the prior does not match the machine's
/// settings or sum to 100%, or what was told is impossible under every
/// setting the prior allows.
pub fn posterior_told(
    spec: &NormalizedSpec,
    prior: Option<&Distribution>,
    told: &ToldPath,
) -> Result<Posterior, InferenceError> {
    let Some(rules) = spec.at_rules.as_ref() else {
        return Err(InferenceError::PathWithoutAt);
    };
    weighed(spec, prior, |table| {
        table
            .at
            .as_ref()
            .map_or(0.0, |at| told_log_likelihood(told, rules, at))
    })
}

/// Each setting's prior weighed by what was seen under its table, as a
/// share of all of them.
fn weighed(
    spec: &NormalizedSpec,
    prior: Option<&Distribution>,
    seen: impl Fn(&SettingLevelTable) -> f64,
) -> Result<Posterior, InferenceError> {
    let logs: Vec<f64> = log_prior(spec, prior)?
        .into_iter()
        .zip(&spec.tables)
        .map(|(log_prior, table)| log_prior + seen(table))
        .map(|log| if log.is_nan() { f64::NEG_INFINITY } else { log })
        .collect();
    let total = log_sum_exp(&logs);
    if !total.is_finite() {
        return Err(InferenceError::ContradictoryEvidence);
    }
    Ok(Posterior {
        setting_levels: spec
            .setting_levels()
            .zip(logs)
            .map(|(setting_level, log)| (setting_level, (log - total).exp()))
            .collect(),
    })
}
