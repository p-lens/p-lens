use pachislot_domain::conditions::PlayConditions;
use pachislot_domain::normalized::{AtRules, NormalizedSpec};
use pachislot_domain::observation::Path;
use pachislot_domain::setting_level::SettingLevel;

use crate::analysis::{Analysis, SettingLevelFigures};
use crate::at::walk;

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
/// rented: `games × bet × cash share × (rental price − medal value)`. Played
/// from medals in hand, it costs nothing beyond their value.
fn priced(
    payout_rate: f64,
    medals: f64,
    games: f64,
    bet: u32,
    play: PlayConditions,
) -> TheoreticalValue {
    let played = games * f64::from(bet);
    let spread = played * play.cash_share().value() * (play.rental_price() - play.medal_value());
    let yen = medals * play.medal_value() - spread;
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
