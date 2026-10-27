import type { SettingLevelFigures } from "./figures"
import type { Prior } from "./prior"

/**
 * A corner as a person types it in to work a formula's theoretical value
 * out before playing (期待値算出): the medals ¥1,000 rents, the medals ¥100
 * of prizes takes, and the share of games played with the player's own
 * medals, from 0 to 1.
 */
export interface SheetCorner {
  readonly rentedPerThousand: number
  readonly exchangedPerHundred: number
  readonly ownShare: number
}

/** How a person means to play at a corner: the medals a game takes, the games they mean to play, and the games an hour where they say. */
export interface SheetPlay {
  readonly bet: number
  readonly games: number
  readonly gamesPerHour: number | undefined
}

/** What a play typed in comes to at one 機械割: the theoretical value over its games, a game's, the medals it gains net of those it plays, and an hour's where the games an hour are said. */
export interface SheetValue {
  readonly theoreticalValue: number
  readonly yenPerGame: number
  readonly medalsGained: number
  readonly yenPerHour: number | undefined
}

/**
 * A game played with rented medals is worth what it pays, exchanged, less
 * the yen its bet was rented for; one with the player's own medals, what
 * it pays less its bet, both exchanged. A play is worth the two mixed by
 * its share of own medals.
 */
export const sheetValueOf = (payoutRate: number, corner: SheetCorner, play: SheetPlay): SheetValue => {
  const medalValue = 100 / corner.exchangedPerHundred
  const gainedPerGame = play.bet * (payoutRate - 1)
  const cashPerGame = play.bet * payoutRate * medalValue - (play.bet * 1000) / corner.rentedPerThousand
  const perGame = (1 - corner.ownShare) * cashPerGame + corner.ownShare * gainedPerGame * medalValue
  return {
    theoreticalValue: perGame * play.games,
    yenPerGame: perGame,
    medalsGained: gainedPerGame * play.games,
    yenPerHour: play.gamesPerHour === undefined ? undefined : perGame * play.gamesPerHour,
  }
}

/**
 * The 機械割 a prior makes a formula's: each setting level's weighed by
 * its share — evenly under an even spread — over the levels the formula
 * has; none where it shares out nothing among them. A play's value is even
 * in the 機械割, so this 機械割 is worth what the levels are worth together.
 */
export const priorPayoutRateOf = (figures: readonly SettingLevelFigures[], prior: Prior): number | undefined => {
  const weighed = figures.flatMap((each) => ((weight) => (weight > 0 ? [{ weight, payoutRate: each.payoutRate }] : []))(prior.type === "even" ? 1 : (prior.shares.find((share) => share.settingLevel === each.settingLevel)?.basisPoints ?? 0)))
  const total = weighed.reduce((sum, each) => sum + each.weight, 0)
  return total === 0 ? undefined : weighed.reduce((sum, each) => sum + each.weight * each.payoutRate, 0) / total
}
