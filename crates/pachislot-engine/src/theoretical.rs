use pachislot_domain::conditions::PlayConditions;
use pachislot_domain::normalized::{AtRules, NormalizedSpec};
use pachislot_domain::observation::{Path, PathStart};
use pachislot_domain::setting_level::SettingLevel;

use crate::analysis::{Analysis, SettingLevelFigures};
use crate::at::walk;
use crate::hunt::{Hunted, hunt};

/// The theoretical value of so many regular games: each setting level's
/// figures weighed by how likely it is.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TheoreticalValue {
    /// 期待機械割, as a ratio.
    pub payout_rate: f64,
    /// Theoretical medals a regular game gains or loses.
    pub net_per_game: f64,
    /// Medals over the games: 期待差枚.
    pub medals: f64,
    /// Yen over the games: the medals at their exchange value, less what
    /// renting the share played from cash costs above that value.
    pub yen: f64,
    pub yen_per_hour: Option<f64>,
}

/// A figure of each setting level weighed by how likely it is. A weight for
/// a setting the analysis does not have counts for nothing.
fn weighted(
    analysis: &Analysis,
    weights: &[(SettingLevel, f64)],
    read: fn(&SettingLevelFigures) -> f64,
) -> f64 {
    weights
        .iter()
        .filter_map(|(setting_level, weight)| {
            analysis
                .setting_levels
                .iter()
                .find(|figures| figures.setting_level == *setting_level)
                .map(|figures| weight * read(figures))
        })
        .sum()
}

/// Medals over regular games, in yen on the player's terms.
///
/// The rental spread is charged on the share of the medals played that was
/// rented, and the replay fee on the share drawn from savings:
/// `games × bet × spread per medal`. Played from medals in hand, a medal
/// costs nothing beyond its value.
fn yen_of(medals: f64, games: f64, bet: u32, play: PlayConditions) -> f64 {
    medals * play.medal_value() - games * f64::from(bet) * play.spread_per_medal()
}

/// Medals over regular games as a theoretical value on the player's terms.
fn priced(
    payout_rate: f64,
    medals: f64,
    games: f64,
    bet: u32,
    play: PlayConditions,
) -> TheoreticalValue {
    let yen = yen_of(medals, games, bet, play);
    TheoreticalValue {
        payout_rate,
        net_per_game: if games > 0.0 { medals / games } else { 0.0 },
        medals,
        yen,
        yen_per_hour: play
            .games_per_hour()
            .filter(|_| games > 0.0)
            .map(|pace| yen / games * pace),
    }
}

/// The theoretical value of `games` regular games of a machine of bonuses and
/// small wins, given how likely each setting is: every game is worth the
/// same.
pub fn theoretical_value(
    analysis: &Analysis,
    bet: u32,
    weights: &[(SettingLevel, f64)],
    play: PlayConditions,
    games: u32,
) -> TheoreticalValue {
    let net_per_game = weighted(analysis, weights, |figures| figures.net_per_game);
    let games = f64::from(games);
    TheoreticalValue {
        net_per_game,
        ..priced(
            weighted(analysis, weights, |figures| figures.payout_rate),
            games * net_per_game,
            games,
            bet,
            play,
        )
    }
}

/// The theoretical value of an AT machine's path, given how likely each
/// setting is: each game is worth what play there makes it — its chance of
/// the AT, by its counts since the last trigger and AT, the triggers missed
/// and the modes still possible — so it is the games played, not their
/// number, that count.
pub fn path_theoretical_value(
    spec: &NormalizedSpec,
    rules: &AtRules,
    analysis: &Analysis,
    weights: &[(SettingLevel, f64)],
    play: PlayConditions,
    path: &Path,
) -> TheoreticalValue {
    let medals: f64 = weights
        .iter()
        .filter_map(|(setting_level, weight)| {
            let table = spec.table(*setting_level)?.at.as_ref()?;
            Some(weight * walk(path, rules, table).medals)
        })
        .sum();
    #[allow(
        clippy::cast_precision_loss,
        reason = "a play's games are far below where a float loses whole numbers"
    )]
    let games = path.games() as f64;
    priced(
        weighted(analysis, weights, |figures| figures.payout_rate),
        medals,
        games,
        spec.bet,
        play,
    )
}

/// What sitting down at an AT machine where it stands is worth, played on
/// until the next AT is won and over, each setting level weighed by how
/// likely it is: the regular games played on average, the AT's medals and
/// what the bonuses that are its trigger pay on the way, the medals over
/// them and in yen on the player's terms, and the chance the AT is won by a
/// ceiling.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct HuntValue {
    pub games: f64,
    pub at_medals: f64,
    pub trigger_medals: f64,
    pub medals: f64,
    pub yen: f64,
    pub by_ceiling: f64,
}

/// What sitting down where play stands is worth: each setting level's
/// hunt weighed by how likely it is, a weight for a setting the spec does
/// not have counting for nothing. None where under some setting the AT
/// might never come.
pub fn hunt_theoretical_value(
    spec: &NormalizedSpec,
    rules: &AtRules,
    weights: &[(SettingLevel, f64)],
    play: PlayConditions,
    start: PathStart,
) -> Option<HuntValue> {
    let hunted = weights
        .iter()
        .try_fold(Hunted::NONE, |sum, (setting_level, weight)| {
            spec.table(*setting_level)
                .and_then(|table| table.at.as_ref())
                .map_or(Some(sum), |table| {
                    Some(sum.plus(hunt(start, rules, table)?, *weight))
                })
        })?;
    Some(HuntValue {
        games: hunted.games,
        at_medals: hunted.at_medals,
        trigger_medals: hunted.trigger_medals,
        medals: hunted.medals,
        yen: yen_of(hunted.medals, hunted.games, spec.bet, play),
        by_ceiling: hunted.by_ceiling,
    })
}
