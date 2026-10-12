//! A play told of afterwards, weighed for the spin performance its cabinet
//! must have had. All that is known of it is how long it lasted, the cash it
//! took and what came back — and, where the person looked, the jackpots the
//! counter showed. Each trial draws a spin performance
//! from what is believed before looking, plays the machine for that long at
//! it, and is weighed by how near it came to what was told; the spin
//! performances of the trials that came near are what the play is taken to
//! have had.
//!
//! The clock is the one thing this adds to a session: a regular spin takes
//! the time the cabinet's pace gives it, and a jackpot the time its rounds
//! and the play around it take. A person cannot tell cash from luck, but a
//! machine played out a thousand times can.

use std::num::NonZeroU64;

use pachinko_domain::conditions::BallValue;
use pachinko_domain::normalized::NormalizedSpec;

use crate::combo::{ComboResult, ReliefGauge, combo_following, gauge_after, wait_from};
use crate::rng::{Rng, Seed};

/// Seconds one round of a jackpot takes, with what is shown around it. Put
/// long rather than short: time given to jackpots is time not spun, and
/// fewer spins for the same cash is a worse cabinet.
const ROUND_SECONDS: f64 = 14.0;

/// Seconds a jackpot takes beside its rounds: its fanfare and ending, and
/// the fast spins until the next.
const JACKPOT_SECONDS: f64 = 80.0;

/// Hours a trial may run past those told and still be near them: a person
/// tells them to the five minutes, and remembers them less exactly than that.
const OVERRUN_TOLERANCE: f64 = 0.2;

/// Hours past those told beyond which a trial is no play of those hours at
/// all, and is not counted among the plays that went as far as the one told.
const OVERRUN_COUNTED: f64 = 0.25;

/// Cash goes in by this many yen at a time.
const LOT_YEN: f64 = 500.0;

/// The spin performances a play is weighed over, in spins per ¥1,000: from
/// `FLOOR`, in bins `BIN` wide.
const FLOOR: f64 = 5.0;
const BIN: f64 = 0.25;
pub const BINS: usize = 160;

/// The theoretical values a play is weighed over, in yen: from
/// `VALUE_FLOOR`, in bins `VALUE_BIN` wide.
const VALUE_FLOOR: f64 = -300_000.0;
const VALUE_BIN: f64 = 500.0;
pub const VALUE_BINS: usize = 1000;

/// What a person tells of a play afterwards.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Told {
    /// How long the play lasted, in hours.
    pub hours: f64,
    /// The cash it took, in yen.
    pub outlay: f64,
    /// What came back, in yen.
    pub takings: f64,
    /// The jackpots the counter showed, where the person looked.
    pub jackpots: Option<u64>,
}

/// What is believed of a cabinet's spin performance before anything is told
/// of the play: about `mean`, give or take `deviation`, in spins per ¥1,000.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Belief {
    pub mean: f64,
    pub deviation: f64,
}

/// How a told play is weighed.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct InferenceSetup {
    pub told: Told,
    pub belief: Belief,
    /// Regular spins the cabinet plays in an hour.
    pub spins_per_hour: f64,
    /// Balls ¥1,000 rents.
    pub rented_per_thousand: f64,
    pub ball_value: BallValue,
    pub payout_scale: f64,
    /// Balls a regular spin wins on average, by the play's formula: what a
    /// trial's spins are worth is this, exchanged, less what they cost.
    pub balls_per_spin: f64,
}

#[allow(clippy::cast_precision_loss)]
fn real(value: u64) -> f64 {
    value as f64
}

/// One play played out: the spin performance it was drawn at, and what it
/// came to.
#[derive(Clone, Copy, Debug, PartialEq)]
struct Trial {
    spin_performance: f64,
    outlay: f64,
    takings: f64,
    jackpots: u64,
    spins: u64,
    /// The hours it ran past those told: a combo under way as they ran out
    /// is played to its end, which a person would have counted in.
    overrun: f64,
    /// What its regular spins were worth by the formula, at the spin
    /// performance it was drawn at, every ball of them rented: in yen.
    value: f64,
}

/// A play part-way through its hours.
#[derive(Clone, Copy)]
struct Sitting {
    hours_left: f64,
    balls: f64,
    outlay: f64,
    spins: u64,
    jackpots: u64,
    gauge: ReliefGauge,
    rng: Rng,
    over: bool,
}

/// The hours a combo takes: its rounds, and what is played around each jackpot.
fn hours_of(combo: &ComboResult) -> f64 {
    (real(combo.rounds) * ROUND_SECONDS + real(combo.hits) * JACKPOT_SECONDS) / 3600.0
}

/// The balls and the cash after spins costing `needed` balls: what is in
/// hand is played first, and cash goes in a lot at a time for the rest.
fn paid(balls: f64, outlay: f64, needed: f64, lot: f64) -> (f64, f64) {
    if balls >= needed {
        (balls - needed, outlay)
    } else {
        let lots = ((needed - balls) / lot).ceil();
        (balls + lots * lot - needed, outlay + lots * LOT_YEN)
    }
}

/// The play one wait further on: the regular spins until a jackpot — or
/// until its hours run out — and the combo that follows.
fn next(
    spec: &NormalizedSpec,
    setup: &InferenceSetup,
    spin_performance: f64,
    sitting: &Sitting,
) -> Option<Sitting> {
    if sitting.over {
        return None;
    }
    let (wait, rng) = wait_from(spec, sitting.gauge, sitting.rng);
    let room = (sitting.hours_left * setup.spins_per_hour).floor().max(0.0);
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    let played = wait.spins.min(room as u64);
    let (balls, outlay) = paid(
        sitting.balls,
        sitting.outlay,
        real(played) * setup.rented_per_thousand / spin_performance,
        setup.rented_per_thousand * LOT_YEN / 1000.0,
    );
    let spun = Sitting {
        hours_left: sitting.hours_left - real(played) / setup.spins_per_hour,
        balls,
        outlay,
        spins: sitting.spins + played,
        rng,
        ..*sitting
    };
    if played < wait.spins {
        return Some(Sitting { over: true, ..spun });
    }
    let (combo, rng) = combo_following(spec, wait.end, rng);
    let hours_left = spun.hours_left - hours_of(&combo);
    Some(Sitting {
        hours_left,
        balls: spun.balls + real(combo.balls) * setup.payout_scale,
        jackpots: spun.jackpots + combo.hits,
        gauge: gauge_after(wait.end, &combo),
        rng,
        over: hours_left <= 0.0,
        ..spun
    })
}

/// A standard normal draw, by Box and Muller.
fn normal(rng: Rng) -> (f64, Rng) {
    let (first, rng) = rng.next_unit();
    let (second, rng) = rng.next_unit();
    (
        (-2.0 * (1.0 - first).ln()).sqrt() * (std::f64::consts::TAU * second).cos(),
        rng,
    )
}

/// The highest spin performance weighed.
#[allow(clippy::cast_precision_loss)]
fn ceiling() -> f64 {
    FLOOR + BIN * BINS as f64
}

fn play(spec: &NormalizedSpec, setup: &InferenceSetup, rng: Rng) -> (Trial, Rng) {
    let (draw, rng) = normal(rng);
    let spin_performance =
        (setup.belief.mean + setup.belief.deviation * draw).clamp(FLOOR, ceiling() - BIN / 2.0);
    let start = Sitting {
        hours_left: setup.told.hours,
        balls: 0.0,
        outlay: 0.0,
        spins: 0,
        jackpots: 0,
        gauge: ReliefGauge::default(),
        rng,
        over: false,
    };
    let end = std::iter::successors(Some(start), |sitting| {
        next(spec, setup, spin_performance, sitting)
    })
    .last()
    .unwrap_or(start);
    (
        Trial {
            spin_performance,
            outlay: end.outlay,
            takings: end.balls * setup.ball_value.value(),
            jackpots: end.jackpots,
            spins: end.spins,
            overrun: (-end.hours_left).max(0.0),
            value: (setup.balls_per_spin * setup.ball_value.value() - 1000.0 / spin_performance)
                * real(end.spins),
        },
        end.rng,
    )
}

/// How far a figure played out is from the one told, in tolerances.
fn off(played: f64, told: f64, tolerance: f64) -> f64 {
    (played - told) / tolerance
}

/// How far from the cash told a trial's may be and still be the same cash:
/// a lot, and a hundredth of it.
fn outlay_tolerance(told: &Told) -> f64 {
    500.0 + 0.01 * told.outlay
}

/// How far from what was told to have come back a trial's may be and still
/// be the same: a person who lost tells of nothing where a trial ends with
/// the last of a lot still in its tray.
fn takings_tolerance(told: &Told) -> f64 {
    1000.0 + 0.03 * told.takings
}

/// How far a trial is from what was told, squared: over the cash and what
/// came back, over the hours it ran past those told, and over the jackpots
/// where those were told.
/// A tolerance is a floor and a share of the figure, a larger figure being
/// told less exactly and played out less exactly too.
fn distance(trial: &Trial, told: &Told) -> f64 {
    let outlay = off(trial.outlay, told.outlay, outlay_tolerance(told));
    let takings = off(trial.takings, told.takings, takings_tolerance(told));
    let jackpots = told.jackpots.map_or(0.0, |jackpots| {
        off(
            real(trial.jackpots),
            real(jackpots),
            0.6 + 0.1 * real(jackpots),
        )
    });
    let overrun = trial.overrun / OVERRUN_TOLERANCE;
    outlay * outlay + takings * takings + jackpots * jackpots + overrun * overrun
}

/// The weight of the trials that came near what was told: by the spin
/// performance each was drawn at, by what each one's spins were worth, and
/// in all.
///
/// The fields are open so a run in progress can be carried across a boundary
/// and resumed; they stay consistent only when built up through `with`.
#[derive(Clone, Debug, PartialEq)]
pub struct Weighed {
    pub bins: Vec<f64>,
    pub values: Vec<f64>,
    pub weight: f64,
    pub weight_squared: f64,
    /// The trials' regular spins, each by its weight.
    pub spins: f64,
}

impl Default for Weighed {
    fn default() -> Self {
        Self {
            bins: vec![0.0; BINS],
            values: vec![0.0; VALUE_BINS],
            weight: 0.0,
            weight_squared: 0.0,
            spins: 0.0,
        }
    }
}

/// The bin a figure falls in: those below the floor in the first, those
/// past the last in the last.
#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn bin_of(figure: f64, floor: f64, width: f64, bins: usize) -> usize {
    (((figure - floor) / width).floor().max(0.0) as usize).min(bins.saturating_sub(1))
}

/// The figure below which this much of the weight in the bins lies.
#[allow(clippy::cast_precision_loss)]
fn point_at(bins: &[f64], floor: f64, width: f64, sought: f64) -> Option<f64> {
    bins.iter()
        .enumerate()
        .scan(0.0, |below, (index, held)| {
            let before = *below;
            *below += held;
            Some((index, before, *held))
        })
        .find(|&(_, before, held)| held > 0.0 && before + held >= sought)
        .map(|(index, before, held)| {
            floor + width * (index as f64 + ((sought - before) / held).clamp(0.0, 1.0))
        })
}

impl Weighed {
    #[must_use]
    fn with(mut self, trial: &Trial, weight: f64) -> Self {
        if let Some(held) = self
            .bins
            .get_mut(bin_of(trial.spin_performance, FLOOR, BIN, BINS))
        {
            *held += weight;
        }
        if let Some(held) =
            self.values
                .get_mut(bin_of(trial.value, VALUE_FLOOR, VALUE_BIN, VALUE_BINS))
        {
            *held += weight;
        }
        self.weight += weight;
        self.weight_squared += weight * weight;
        self.spins += weight * real(trial.spins);
        self
    }

    /// How many trials of equal weight these are worth.
    pub fn effective_trials(&self) -> f64 {
        if self.weight_squared > 0.0 {
            self.weight * self.weight / self.weight_squared
        } else {
            0.0
        }
    }

    /// The spin performance below which this share of the weight lies.
    fn at(&self, share: f64) -> Option<f64> {
        point_at(&self.bins, FLOOR, BIN, self.weight * share)
    }

    /// The theoretical value below which this share of the weight lies.
    fn value_at(&self, share: f64) -> Option<f64> {
        point_at(&self.values, VALUE_FLOOR, VALUE_BIN, self.weight * share)
    }
}

/// What a told play is taken to have been.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Reading {
    /// The spin performance a quarter of the weight lies below.
    pub lower: f64,
    /// The spin performance half the weight lies below: the one to go by,
    /// as likely to be over the truth as under it.
    pub middle: f64,
    /// The spin performance three quarters of the weight lie below.
    pub upper: f64,
    /// The regular spins the play had, on average.
    pub spins: f64,
    /// The theoretical value half the weight lies below, in yen: each
    /// trial's own — its spins at its spin performance — and the middle of
    /// those, not a figure worked from the two above.
    pub value: f64,
    /// How many trials of equal weight the reading rests on.
    pub effective_trials: f64,
}

/// How many trials went at least as far as what was told, each way a play
/// can be out of the ordinary: in the cash it took, in what came back, and
/// in what the two came to — as far, give or take what counts as the same
/// figure, a trial not being held to the yen. Where few did, the play told
/// of is a rare one.
/// A trial that ran well past the hours told is no play of those hours,
/// and is counted nowhere.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub struct Beyond {
    pub outlay_at_least: u64,
    pub outlay_at_most: u64,
    pub takings_at_least: u64,
    pub takings_at_most: u64,
    pub result_at_least: u64,
    pub result_at_most: u64,
}

impl Beyond {
    #[must_use]
    fn with(self, trial: &Trial, told: &Told) -> Self {
        if trial.overrun > OVERRUN_COUNTED {
            return self;
        }
        let (outlay, takings) = (outlay_tolerance(told), takings_tolerance(told));
        let (result, told_result) = (trial.takings - trial.outlay, told.takings - told.outlay);
        Self {
            outlay_at_least: self.outlay_at_least + u64::from(trial.outlay >= told.outlay - outlay),
            outlay_at_most: self.outlay_at_most + u64::from(trial.outlay <= told.outlay + outlay),
            takings_at_least: self.takings_at_least
                + u64::from(trial.takings >= told.takings - takings),
            takings_at_most: self.takings_at_most
                + u64::from(trial.takings <= told.takings + takings),
            result_at_least: self.result_at_least
                + u64::from(result >= told_result - outlay - takings),
            result_at_most: self.result_at_most
                + u64::from(result <= told_result + outlay + takings),
        }
    }

    /// The fewest trials that went as far as the play any one way, and
    /// which way that was: how often a play as far out as this one comes,
    /// out of the trials played, and what it is far out in.
    pub fn rarest(&self) -> (u64, Way) {
        [
            (self.outlay_at_least, Way::OutlayAtLeast),
            (self.outlay_at_most, Way::OutlayAtMost),
            (self.takings_at_least, Way::TakingsAtLeast),
            (self.takings_at_most, Way::TakingsAtMost),
            (self.result_at_least, Way::ResultAtLeast),
            (self.result_at_most, Way::ResultAtMost),
        ]
        .into_iter()
        .min_by_key(|&(count, _)| count)
        .unwrap_or((0, Way::ResultAtMost))
    }
}

/// A way a play can be out of the ordinary: in the cash it took, in what
/// came back or in what the two came to, by as much as told or more, or by
/// as little or less.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Way {
    OutlayAtLeast,
    OutlayAtMost,
    TakingsAtLeast,
    TakingsAtMost,
    ResultAtLeast,
    ResultAtMost,
}

/// Trials so far: those that came near what was told, weighed, and how
/// many went as far as it.
#[derive(Clone, Debug, PartialEq, Default)]
pub struct InferenceTally {
    pub trials: u64,
    pub weighed: Weighed,
    pub beyond: Beyond,
}

impl InferenceTally {
    #[must_use]
    fn with(self, trial: &Trial, told: &Told) -> Self {
        let weight = (-distance(trial, told) / 2.0).exp();
        Self {
            trials: self.trials + 1,
            weighed: self.weighed.with(trial, weight),
            beyond: self.beyond.with(trial, told),
        }
    }

    /// What the trials that came near say. None until one has any weight.
    /// How much it rests on is said with it, and is the caller's to judge.
    pub fn reading(&self) -> Option<Reading> {
        Some(Reading {
            lower: self.weighed.at(0.25)?,
            middle: self.weighed.at(0.5)?,
            upper: self.weighed.at(0.75)?,
            spins: self.weighed.spins / self.weighed.weight,
            value: self.weighed.value_at(0.5)?,
            effective_trials: self.weighed.effective_trials(),
        })
    }
}

/// An inference part-way through: everything needed to resume it, so a long
/// run can be done in chunks and come out exactly as one run would.
#[derive(Clone, Debug, PartialEq)]
pub struct Inference {
    pub rng: Rng,
    pub tally: InferenceTally,
}

impl Inference {
    pub fn start(seed: Seed) -> Self {
        Self {
            rng: Rng::from_seed(seed),
            tally: InferenceTally::default(),
        }
    }

    pub fn is_finished(&self, trials: NonZeroU64) -> bool {
        self.tally.trials >= trials.get()
    }
}

/// Play out up to `chunk` more trials, never past `trials` in all.
pub fn advance_inference(
    spec: &NormalizedSpec,
    setup: &InferenceSetup,
    trials: NonZeroU64,
    inference: &Inference,
    chunk: NonZeroU64,
) -> Inference {
    let remaining = trials.get().saturating_sub(inference.tally.trials);
    (0..chunk.get().min(remaining)).fold(inference.clone(), |current, _| {
        let (trial, rng) = play(spec, setup, current.rng);
        Inference {
            rng,
            tally: current.tally.with(&trial, &setup.told),
        }
    })
}

#[cfg(test)]
mod tests {
    #![allow(clippy::expect_used)]

    use pachinko_domain::normalized::{Outcome, Reward, Target};
    use pachinko_domain::probability::Probability;
    use pachinko_domain::version::SchemaVersion;

    use super::*;

    /// One jackpot in a hundred spins, ten rounds of 1,400 balls, and back.
    fn plain() -> NormalizedSpec {
        NormalizedSpec {
            schema_version: SchemaVersion::CURRENT,
            hit_chance: Probability::new(0.01).expect("a chance"),
            entry: vec![Outcome {
                probability: Probability::new(1.0).expect("certain"),
                reward: Reward {
                    rounds: 10,
                    hits: 1,
                    balls: 1400,
                },
                next: Target::End,
            }],
            states: Vec::new(),
            origins: Vec::new(),
            net_balls_per_round: 140,
            relief_drive: None,
        }
    }

    fn setup(told: Told, belief: Belief) -> InferenceSetup {
        InferenceSetup {
            told,
            belief,
            spins_per_hour: 200.0,
            rented_per_thousand: 250.0,
            ball_value: BallValue::new(100.0 / 28.0).expect("a value"),
            payout_scale: 1.0,
            balls_per_spin: 14.0,
        }
    }

    /// A machine with a RUSH: one jackpot in 319.7 spins of 450 balls, six in
    /// ten of them into a RUSH that goes on 81 times in a hundred at 1,500.
    fn rushing() -> NormalizedSpec {
        use pachinko_domain::normalized::{State, StateIndex, StateOrigin};
        use pachinko_domain::spec::ModeId;
        let chance = |value| Probability::new(value).expect("a chance");
        let first = |probability, next| Outcome {
            probability: chance(probability),
            reward: Reward {
                rounds: 3,
                hits: 1,
                balls: 450,
            },
            next,
        };
        NormalizedSpec {
            schema_version: SchemaVersion::CURRENT,
            hit_chance: chance(1.0 / 319.7),
            entry: vec![
                first(0.6, Target::State(StateIndex::new(0))),
                first(0.4, Target::End),
            ],
            states: vec![State {
                outcomes: vec![
                    Outcome {
                        probability: chance(0.81),
                        reward: Reward {
                            rounds: 10,
                            hits: 1,
                            balls: 1500,
                        },
                        next: Target::State(StateIndex::new(0)),
                    },
                    Outcome {
                        probability: chance(0.19),
                        reward: Reward::default(),
                        next: Target::End,
                    },
                ],
                fills_gauge: 0,
            }],
            origins: vec![StateOrigin {
                mode: ModeId::new("RUSH").expect("a name"),
                combo: 1,
            }],
            net_balls_per_round: 150,
            relief_drive: None,
        }
    }

    /// Not a test: plays read back, written out a line a play for looking at
    /// how well they are read. They are drawn as the app believes them to
    /// be, or — with `TRUTHS` naming how far from the border, in spins — at
    /// spin performances that are fixed, which is what shows whether a
    /// reading follows the play or only the belief.
    #[test]
    #[ignore = "a report, run by hand"]
    fn report() {
        use std::fmt::Write as _;
        let trials = NonZeroU64::new(200_000).expect("trials");
        let machines = [("plain", plain(), 14.0), ("rushing", rushing(), 13.4)];
        let mut out = String::from(
            "machine,hours,truth,outlay,takings,jackpots,spins,lower,middle,upper,ess,rarest,value\n",
        );
        for (name, machine, balls_per_spin) in &machines {
            let border = 1000.0 / (balls_per_spin * 100.0 / 28.0);
            let belief = Belief {
                mean: border - 1.0,
                deviation: border / 6.0,
            };
            let offsets: Vec<Option<f64>> = std::env::var("TRUTHS").map_or_else(
                |_| vec![None],
                |named| named.split(',').map(|each| each.parse().ok()).collect(),
            );
            for (hours, offset) in [2.0, 4.0, 8.0]
                .into_iter()
                .flat_map(|hours| offsets.iter().map(move |offset| (hours, *offset)))
            {
                let drawn = offset.map_or(belief, |offset| Belief {
                    mean: border + offset,
                    deviation: 0.0,
                });
                let blank = Told {
                    hours,
                    outlay: 0.0,
                    takings: 0.0,
                    jackpots: None,
                };
                let mut rng = Rng::from_seed(Seed(77));
                for seed in 0..60u64 {
                    let on = |told, belief| InferenceSetup {
                        balls_per_spin: *balls_per_spin,
                        ..setup(told, belief)
                    };
                    let (played, next) = play(machine, &on(blank, drawn), rng);
                    rng = next;
                    let more = std::env::var("MORE").unwrap_or_default();
                    let told = Told {
                        hours: ((hours + played.overrun) * 4.0).round() / 4.0,
                        outlay: played.outlay,
                        takings: played.takings,
                        jackpots: (!more.is_empty()).then_some(played.jackpots),
                    };
                    let read = advance_inference(
                        machine,
                        &on(told, belief),
                        trials,
                        &Inference::start(Seed(1000 + seed)),
                        trials,
                    );
                    let reading = read.tally.reading();
                    let ess = read.tally.weighed.effective_trials();
                    let _ = writeln!(
                        out,
                        "{name},{hours},{:.3},{},{:.0},{},{},{:.3},{:.3},{:.3},{ess:.1},{},{:.0}",
                        played.spin_performance,
                        played.outlay,
                        played.takings,
                        played.jackpots,
                        played.spins,
                        reading.map_or(0.0, |r| r.lower),
                        reading.map_or(0.0, |r| r.middle),
                        reading.map_or(0.0, |r| r.upper),
                        read.tally.beyond.rarest().0,
                        reading.map_or(0.0, |r| r.value),
                    );
                }
            }
        }
        if let Ok(path) = std::env::var("REPORT") {
            let _ = std::fs::write(path, out);
        }
    }

    /// Plays at a spin performance that is known, each told as a person would
    /// tell it and read back with nothing believed either way: the middle of
    /// the readings is the truth, and their lower quartile falls short of it
    /// far more often than it overshoots.
    #[test]
    fn plays_at_a_known_spin_performance_are_read_truly_with_the_truth_above_their_lower_quartile()
    {
        let machine = plain();
        let truth = 17.0;
        let exact = Belief {
            mean: truth,
            deviation: 0.0,
        };
        let open = Belief {
            mean: truth,
            deviation: 4.0,
        };
        let blank = Told {
            hours: 5.0,
            outlay: 0.0,
            takings: 0.0,
            jackpots: None,
        };
        let trials = NonZeroU64::new(6_000).expect("trials");
        let readings: Vec<Reading> = (0..60)
            .scan(Rng::from_seed(Seed(21)), |rng, seed| {
                let (played, next) = play(&machine, &setup(blank, exact), *rng);
                *rng = next;
                let told = Told {
                    outlay: played.outlay,
                    takings: played.takings,
                    ..blank
                };
                advance_inference(
                    &machine,
                    &setup(told, open),
                    trials,
                    &Inference::start(Seed(seed)),
                    trials,
                )
                .tally
                .reading()
            })
            .collect();
        assert_eq!(readings.len(), 60);
        let middle = readings.iter().map(|reading| reading.middle).sum::<f64>() / 60.0;
        assert!((middle - truth).abs() < 1.0, "{middle}");
        let short = readings
            .iter()
            .filter(|reading| reading.lower < truth)
            .count();
        assert!(short >= 40, "{short}");
    }
}
