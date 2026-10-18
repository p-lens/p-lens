import type { SettingLevelFigures } from "../../pachislot/figures"
import { chance, exponential, triesToWin, type Draws, type Drawn } from "../draws"
import type { Leaving, Sitting, SittingTerms, Stretch } from "../sitting"
import { settingLevelOf } from "./setting-level"

/** What a pachislot machine's sittings are drawn from: its formula's figures at each setting level. */
export interface Seat {
  readonly levels: readonly SettingLevelFigures[]
}

const MEDALS_A_GAME = 3

const GAMES_PER_HOUR = 800

/** How fast a bonus or an AT pays its medals out, a minute's worth. */
const MEDALS_GAINED_PER_MINUTE = 35

/** What a game pays back between bonuses, small roles and replays together, on a machine whose bonuses' gain its formula does not say. */
const RETURN_BETWEEN_BONUSES = 1.8

/** The least a game between bonuses is taken to cost, so a machine paying out more than it takes still costs something to wait on. */
const LEAST_DRAIN = 0.05

/** A sitting as far as it has gone. */
interface Going {
  readonly minutesLeft: number
  readonly shotSinceWin: number
  readonly games: number
  readonly stretches: readonly Stretch[]
}

interface Gone extends Going {
  readonly leaving: Leaving
}

const withStretch = (stretches: readonly Stretch[], stretch: Stretch): readonly Stretch[] => (stretch.shot === 0 && stretch.won === 0 ? stretches : [...stretches, stretch])

/**
 * A sitting at a pachislot machine, game after game to each bonus: at a
 * high setting level, 4 to 6, each bonus one in its 合算 and
 * gaining what its AT gains on average or, where the formula does not say,
 * what makes up its 機械割 above what a game pays back between bonuses —
 * more or less by chance — so that a game comes, over many sittings, to
 * what its 機械割 says. The person gets up when the day is over, when they
 * have lost so much since a win, or now and then as a run ends.
 */
export const sittingOf = (seat: Seat, terms: SittingTerms, draws: Draws): Drawn<Sitting> => {
  const [level, drawing] = settingLevelOf(seat.levels, draws)
  const payoutRate = level?.payoutRate ?? 1
  const combinedOneIn = level?.combinedOneIn ?? Number.POSITIVE_INFINITY
  const gain = level?.at?.gain ?? Math.max(0, (MEDALS_A_GAME * payoutRate - RETURN_BETWEEN_BONUSES) * combinedOneIn)
  const drain = Math.max(LEAST_DRAIN, MEDALS_A_GAME - (MEDALS_A_GAME * payoutRate - gain / combinedOneIn))
  const gamesPerMinute = GAMES_PER_HOUR / 60
  const playOn = (going: Going, run: Draws): Drawn<Gone> => {
    const [tries, afterTries] = triesToWin(run, combinedOneIn)
    const byTime = Math.max(0, Math.floor(going.minutesLeft * gamesPerMinute))
    const byGivingUp = terms.givingUpAfter === undefined ? Number.POSITIVE_INFINITY : Math.max(0, Math.floor((terms.givingUpAfter - going.shotSinceWin) / drain))
    const gamesLeft = Math.min(byTime, byGivingUp)
    if (!Number.isFinite(tries) || tries > gamesLeft)
      return [
        {
          minutesLeft: going.minutesLeft - gamesLeft / gamesPerMinute,
          shotSinceWin: going.shotSinceWin + gamesLeft * drain,
          games: going.games + gamesLeft,
          stretches: withStretch(going.stretches, {
            shot: Math.round(gamesLeft * drain),
            won: 0,
          }),
          leaving: byTime <= byGivingUp ? "closing" : "gave-up",
        },
        afterTries,
      ]
    const [first, afterFirst] = exponential(afterTries, gain / 2)
    const [second, afterSecond] = exponential(afterFirst, gain / 2)
    const won = Math.round(first + second)
    const next: Going = {
      minutesLeft: going.minutesLeft - tries / gamesPerMinute - won / MEDALS_GAINED_PER_MINUTE,
      shotSinceWin: 0,
      games: going.games + tries,
      stretches: withStretch(going.stretches, {
        shot: Math.round(tries * drain),
        won,
      }),
    }
    const [leaves, afterLeaving] = chance(afterSecond, terms.leavingAfterRun)
    if (next.minutesLeft <= 0) return [{ ...next, leaving: "closing" }, afterLeaving]
    return leaves ? [{ ...next, leaving: "run-over" }, afterLeaving] : playOn(next, afterLeaving)
  }
  const [gone, after] = playOn({ minutesLeft: terms.minutes, shotSinceWin: 0, games: 0, stretches: [] }, drawing)
  return [
    {
      stretches: gone.stretches,
      minutes: terms.minutes - Math.max(0, gone.minutesLeft),
      theoreticalValue: gone.games * MEDALS_A_GAME * (payoutRate - 1) * terms.tokenValue,
      spinPerformance: undefined,
      leaving: gone.leaving,
    },
    after,
  ]
}
