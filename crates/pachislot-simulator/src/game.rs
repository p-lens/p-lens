use pachislot_domain::normalized::{EventKind, NormalizedSpec};
use pachislot_domain::setting_level::SettingLevel;
use pachislot_engine::analysis::Analysis;
use pachislot_engine::error::AnalysisError;

use crate::rng::Rng;

/// One setting's regular game, ready to draw from: each outcome's chance and
/// the medals it gains net of the bet, and what a game that came up with
/// nothing listed gains.
#[derive(Clone, Debug, PartialEq)]
pub struct GameModel {
    pub setting_level: SettingLevel,
    outcomes: Vec<(f64, f64)>,
    rest: f64,
}

/// The medals a game with nothing listed gains: `-bet` when the rate comes
/// from the spec. A measured rate leaves the rest to make up the difference,
/// so the model's mean is the measured rate whatever the listed outcomes pay.
fn rest_gain(listed: &[(f64, f64)], net_per_game: f64) -> f64 {
    let chance: f64 = listed.iter().map(|(probability, _)| probability).sum();
    let gained: f64 = listed
        .iter()
        .map(|(probability, gain)| probability * gain)
        .sum();
    let rest = 1.0 - chance;
    if rest > 0.0 {
        (net_per_game - gained) / rest
    } else {
        0.0
    }
}

/// A model of each setting's regular game, matching what the analysis solved.
///
/// # Errors
/// When a bonus has no payout, so a game that wins it cannot be paid, or
/// the machine is of an AT, whose games between ATs this model does not
/// draw.
pub fn models(spec: &NormalizedSpec, analysis: &Analysis) -> Result<Vec<GameModel>, AnalysisError> {
    if spec.at_rules.is_some() {
        return Err(AnalysisError::RateNotFromSpec);
    }
    let bet = f64::from(spec.bet);
    spec.tables
        .iter()
        .zip(&analysis.setting_levels)
        .map(|(table, figures)| {
            let outcomes = table
                .events
                .iter()
                .map(|event| {
                    let gain = match event.kind {
                        EventKind::Bonus(Some(payout)) | EventKind::Role(Some(payout)) => {
                            Ok(payout.get() - bet)
                        }
                        EventKind::Bonus(None) | EventKind::Role(None) => {
                            Err(AnalysisError::MissingPayout {
                                at: event.id.clone(),
                            })
                        }
                        EventKind::Replay => Ok(0.0),
                    }?;
                    Ok((event.chance.value(), gain))
                })
                .collect::<Result<Vec<_>, _>>()?;
            Ok(GameModel {
                setting_level: table.setting_level,
                rest: rest_gain(&outcomes, figures.net_per_game),
                outcomes,
            })
        })
        .collect()
}

impl GameModel {
    /// One regular game: the medals it gained, and the generator after it.
    pub fn play(&self, rng: Rng) -> (f64, Rng) {
        let (unit, rng) = rng.next_unit();
        let found = self
            .outcomes
            .iter()
            .scan(0.0, |reached, (probability, gain)| {
                *reached += probability;
                Some((*reached, *gain))
            })
            .find(|(reached, _)| unit < *reached);
        (found.map_or(self.rest, |(_, gain)| gain), rng)
    }
}

/// The setting a weighted draw lands on; the last one when rounding leaves
/// the draw past every weight.
pub fn draw_setting_level(
    weights: &[(SettingLevel, f64)],
    rng: Rng,
) -> (Option<SettingLevel>, Rng) {
    let (unit, rng) = rng.next_unit();
    let found = weights
        .iter()
        .scan(0.0, |reached, (setting_level, weight)| {
            *reached += weight;
            Some((*reached, *setting_level))
        })
        .find(|(reached, _)| unit < *reached)
        .map(|(_, setting_level)| setting_level)
        .or_else(|| weights.last().map(|(setting_level, _)| *setting_level));
    (found, rng)
}
