/**
 * Where a cabinet's own spin performance likely is, from one measured over
 * so many balls: each ball played is taken to enter the heso, and so to be
 * a spin, by itself, with the chance the measurement says, so that the
 * spins over a count of balls fall as a binomial does, and the range is
 * that binomial's Wilson score interval — which, unlike one standing
 * evenly either side, never closes up over a handful of balls or none of
 * them entering. That is a theory: a full hold losing balls narrows it a
 * little, and balls coming in streaks, 止め打ち and a hand misread widen it.
 *
 * How sure the range is grows with what was played, and the range narrows
 * with it: what more balls tell is shared between the two, the deviations
 * the range reaches growing as the fourth root of the yen played, so that
 * four times as much played makes them √2 times as many and the range
 * 1/√2 as wide, until ¥10,000 makes them 90%'s. From there the chance
 * stays at 90% and the range alone narrows. How sure it is hangs on what
 * was played alone, never on what was measured, so that each range said
 * is as sure as it says.
 */

import type { PlayTerms } from "../../parlor/terms"
import { rentedForThousand, type Measured } from "../consumption"

/** The yen played at which the range is as sure as it ever is. */
const SUREST_AFTER_YEN = 10_000

/** The standard deviations a range reaches either side at its surest: a normal distribution's for nine chances in ten. */
const SUREST_DEVIATIONS = 1.6449

/** How the deviations grow with the yen played until their surest: as its fourth root, half of what more balls tell going to the chance and half to the range. */
const GROWTH = 0.25

/** The range a cabinet's own spin performance is likely in, in spins for the balls ¥1,000 rents, and the chance, in whole percent, that it holds it. */
export interface SpinRange {
  readonly coveragePercent: number
  readonly low: number
  readonly high: number
}

/** The standard deviations a range reaches either side after so many yen played. */
export const deviationsAfter = (yenPlayed: number): number => (yenPlayed >= SUREST_AFTER_YEN ? SUREST_DEVIATIONS : SUREST_DEVIATIONS * (Math.max(0, yenPlayed) / SUREST_AFTER_YEN) ** GROWTH)

/** The error function, by Abramowitz and Stegun's 7.1.26, good to 1.5e-7: enough for a whole percent. */
const erf = (x: number): number => {
  const t = 1 / (1 + 0.3275911 * Math.abs(x))
  const polynomial = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))))
  return Math.sign(x) * (1 - polynomial * Math.exp(-x * x))
}

/** The chance, in whole percent, that a normal variable falls within so many standard deviations either side. */
export const coveragePercentOf = (deviations: number): number => Math.round(100 * erf(deviations / Math.SQRT2))

/**
 * The range a cabinet's own spin performance is likely in, from so many
 * spins over so many balls at a rental of so many balls to ¥1,000: the
 * Wilson score interval reaching as far as what was played makes it sure.
 * None where no ball was played or the spins cannot be so many.
 */
export const spinRangeOf = (spins: number, balls: number, rentedPerThousand: number): SpinRange | undefined => {
  if (balls <= 0 || spins < 0 || spins > balls || rentedPerThousand <= 0) return undefined
  const deviations = deviationsAfter((balls * 1000) / rentedPerThousand)
  const share = spins / balls
  const squared = (deviations * deviations) / balls
  const centre = (share + squared / 2) / (1 + squared)
  const half = (deviations / (1 + squared)) * Math.sqrt((share * (1 - share)) / balls + squared / (4 * balls))
  return { coveragePercent: coveragePercentOf(deviations), low: Math.max(0, centre - half) * rentedPerThousand, high: Math.min(1, centre + half) * rentedPerThousand }
}

/** The range a cabinet's own spin performance is likely in, from what a play has measured so far at its corner; none until a ball of a stretch is measured. */
export const measuredSpinRangeOf = (measured: Measured | undefined, terms: PlayTerms | undefined): SpinRange | undefined =>
  measured === undefined || terms === undefined ? undefined : spinRangeOf(measured.spins, measured.balls, rentedForThousand(terms))
