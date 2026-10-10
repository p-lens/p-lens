use std::num::NonZeroU64;

use pachislot_domain::conditions::PlayConditions;
use pachislot_domain::setting_level::SettingLevel;

use crate::aggregate::Aggregate;
use crate::game::{GameModel, draw_setting_level};
use crate::rng::{Rng, Seed};

/// The settings a session may be on, each with its weight and its game.
/// Never empty, and every weight has a model.
#[derive(Clone, Debug, PartialEq)]
pub struct Mix {
    weights: Vec<(SettingLevel, f64)>,
    models: Vec<GameModel>,
}

impl Mix {
    /// `None` when there are no weights, a weight is negative or not finite,
    /// or a weighted setting has no model.
    pub fn new(models: Vec<GameModel>, weights: Vec<(SettingLevel, f64)>) -> Option<Self> {
        let sound = !weights.is_empty()
            && weights.iter().all(|(setting_level, weight)| {
                weight.is_finite()
                    && *weight >= 0.0
                    && models
                        .iter()
                        .any(|model| model.setting_level == *setting_level)
            });
        sound.then_some(Self { weights, models })
    }

    fn draw(&self, rng: Rng) -> (Option<&GameModel>, Rng) {
        let (setting_level, rng) = draw_setting_level(&self.weights, rng);
        (
            setting_level.and_then(|setting_level| {
                self.models
                    .iter()
                    .find(|model| model.setting_level == setting_level)
            }),
            rng,
        )
    }
}

/// A whole simulation: so many sessions of so many regular games each, on the
/// player's terms.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Plan {
    pub sessions: NonZeroU64,
    pub games: u32,
    pub bet: u32,
    pub play: PlayConditions,
}

/// A simulation part-way through. Everything needed to resume it, so a long
/// run can be done in chunks and come out exactly as one run would.
#[derive(Clone, Debug, PartialEq)]
pub struct Progress {
    pub rng: Rng,
    pub aggregate: Aggregate,
}

impl Progress {
    pub fn start(seed: Seed) -> Self {
        Self {
            rng: Rng::from_seed(seed),
            aggregate: Aggregate::default(),
        }
    }

    pub fn done(&self) -> u64 {
        self.aggregate.sessions
    }

    pub fn is_finished(&self, plan: &Plan) -> bool {
        self.done() >= plan.sessions.get()
    }
}

/// One session: a setting drawn by its weight, then the games played on it.
/// Its yen are the medals at their value, less the rental spread on the share
/// rented for cash, as the exact theoretical value counts them.
fn play_session(mix: &Mix, plan: &Plan, rng: Rng) -> (f64, Rng) {
    let (model, rng) = mix.draw(rng);
    let (medals, rng) = model.map_or((0.0, rng), |model| {
        (0..plan.games).fold((0.0, rng), |(medals, rng), _| {
            let (gain, rng) = model.play(rng);
            (medals + gain, rng)
        })
    });
    let played = f64::from(plan.games) * f64::from(plan.bet);
    let spread = played
        * plan.play.cash_share().value()
        * (plan.play.rental_price() - plan.play.medal_value());
    (medals * plan.play.medal_value() - spread, rng)
}

/// Play up to `chunk` more sessions of a plan, never past its end.
pub fn advance(mix: &Mix, plan: &Plan, progress: &Progress, chunk: NonZeroU64) -> Progress {
    let remaining = plan.sessions.get().saturating_sub(progress.done());
    (0..chunk.get().min(remaining)).fold(progress.clone(), |current, _| {
        let (yen, rng) = play_session(mix, plan, current.rng);
        Progress {
            rng,
            aggregate: current.aggregate.with(yen),
        }
    })
}
