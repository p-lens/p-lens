import type { Figures } from "../../../core/pachinko/figures"
import { borderOf, theoreticalValueOf } from "../../../core/pachinko/theoretical-value"
import { chance, exponential, triesToWin, type Draws, type Drawn } from "../draws"
import type { Leaving, Sitting, SittingTerms, Stretch } from "../sitting"
import { spinMarginOf } from "./spin-margin"

/** What a pachinko machine's sittings are drawn from: its formula's figures. */
export interface Seat {
  readonly figures: Figures
}

/** Spins an hour where a formula does not say how fast its cabinet plays. */
const SPINS_PER_HOUR_UNSTATED = 200

/** How fast a jackpot pays its balls out, a minute's worth. */
const BALLS_PAID_PER_MINUTE = 300

/** A sitting as far as it has gone. */
interface Going {
  readonly minutesLeft: number
  readonly shotSinceWin: number
  readonly spins: number
  readonly stretches: readonly Stretch[]
}

interface Gone extends Going {
  readonly leaving: Leaving
}

const withStretch = (stretches: readonly Stretch[], stretch: Stretch): readonly Stretch[] => (stretch.shot === 0 && stretch.won === 0 ? stretches : [...stretches, stretch])

/**
 * A sitting at a pachinko machine, spin after spin to each jackpot: spins
 * at a share above the machine's border at the parlor's exchange, each
 * jackpot one in its total chance and paying its rounds — as many on
 * average as the total chance holds of the round chance, more or fewer by
 * chance — so that the balls a spin wins come, over many sittings, to what
 * the formula says. The person gets up when the day is over, when they
 * have shot so much since a win, or now and then as a run ends.
 */
export const sittingOf = (seat: Seat, terms: SittingTerms, draws: Draws): Drawn<Sitting> => {
  const [margin, drawing] = spinMarginOf(draws)
  const spinPerformance = Math.round(borderOf(seat.figures, terms.tokenValue) * (1 + margin) * 10) / 10
  const ballsPerSpin = terms.tokensPerThousand / spinPerformance
  const spinsPerMinute = (seat.figures.spinsPerHour ?? SPINS_PER_HOUR_UNSTATED) / 60
  const jackpotOneIn = seat.figures.totalChanceOneIn ?? seat.figures.roundChanceOneIn
  const roundsPerJackpot = Math.max(1, jackpotOneIn / seat.figures.roundChanceOneIn)
  const playOn = (going: Going, run: Draws): Drawn<Gone> => {
    const [tries, afterTries] = triesToWin(run, jackpotOneIn)
    const byTime = Math.max(0, Math.floor(going.minutesLeft * spinsPerMinute))
    const byGivingUp = terms.givingUpAfter === undefined ? Number.POSITIVE_INFINITY : Math.max(0, Math.floor((terms.givingUpAfter - going.shotSinceWin) / ballsPerSpin))
    const spinsLeft = Math.min(byTime, byGivingUp)
    if (tries > spinsLeft)
      return [
        {
          minutesLeft: going.minutesLeft - spinsLeft / spinsPerMinute,
          shotSinceWin: going.shotSinceWin + spinsLeft * ballsPerSpin,
          spins: going.spins + spinsLeft,
          stretches: withStretch(going.stretches, {
            shot: Math.round(spinsLeft * ballsPerSpin),
            won: 0,
          }),
          leaving: byTime <= byGivingUp ? "closing" : "gave-up",
        },
        afterTries,
      ]
    const [extraRounds, afterRounds] = exponential(afterTries, roundsPerJackpot - 1)
    const won = Math.round(seat.figures.payoutPerRound * (1 + extraRounds))
    const next: Going = {
      minutesLeft: going.minutesLeft - tries / spinsPerMinute - won / BALLS_PAID_PER_MINUTE,
      shotSinceWin: 0,
      spins: going.spins + tries,
      stretches: withStretch(going.stretches, {
        shot: Math.round(tries * ballsPerSpin),
        won,
      }),
    }
    const [leaves, afterLeaving] = chance(afterRounds, terms.leavingAfterRun)
    if (next.minutesLeft <= 0) return [{ ...next, leaving: "closing" }, afterLeaving]
    return leaves ? [{ ...next, leaving: "run-over" }, afterLeaving] : playOn(next, afterLeaving)
  }
  const [gone, after] = playOn({ minutesLeft: terms.minutes, shotSinceWin: 0, spins: 0, stretches: [] }, drawing)
  return [
    {
      stretches: gone.stretches,
      minutes: terms.minutes - Math.max(0, gone.minutesLeft),
      theoreticalValue: theoreticalValueOf(seat.figures, { spinPerformance, ballValue: terms.tokenValue }, gone.spins),
      spinPerformance,
      leaving: gone.leaving,
    },
    after,
  ]
}
