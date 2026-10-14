use pachislot_domain::distribution::Distribution;
use pachislot_domain::normalized::{AtRules, NormalizedSpec, SettingLevelTable};
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

fn check_segment(
    spec: &NormalizedSpec,
    index: usize,
    segment: &Segment,
) -> Result<(), InferenceError> {
    let known = |id: &EntityId| {
        spec.tables
            .iter()
            .any(|table| table.events.iter().any(|event| event.answers_to(id)))
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
        .map(|(_, count)| u64::from(*count))
        .sum();
    if counted > u64::from(segment.games) {
        return Err(InferenceError::CountsExceedGames { segment: index });
    }
    Ok(())
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

/// The multinomial log-likelihood of one stretch under one setting's table,
/// without the coefficient, which is the same for every setting. The games
/// that came up with nothing counted share what probability is left.
fn log_likelihood(table: &SettingLevelTable, segment: &Segment) -> f64 {
    let chance = |id: &EntityId| -> f64 {
        table
            .events
            .iter()
            .filter(|event| event.answers_to(id))
            .map(|event| event.chance.value())
            .sum()
    };
    let (counted, covered, log) =
        segment
            .counts
            .iter()
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
/// segment counts more than it played, a path is given for a machine with
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
            .map(|segment| log_likelihood(table, segment))
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
