/**
 * How far a spin performance measured over so many balls may stand from
 * the cabinet's own: each ball played is taken to enter the heso, and so
 * to be a spin, by itself, with the chance the measurement says, so that
 * the spins over a count of balls fall as a binomial does. That is a
 * theory: a full hold losing balls narrows it a little, and balls coming
 * in streaks, 止め打ち and a hand misread widen it.
 */

import type { PlayTerms } from "../../parlor/terms"
import { rentedForThousand, spinPerformanceOf, type Measured } from "../consumption"

/** How many standard deviations either side of a spin performance its range reaches: a normal distribution's for nine chances in ten. */
export const SPREAD_DEVIATIONS = 1.6449

/** The chance, in percent, that a range reaching so far either side holds the cabinet's own spin performance. */
export const SPREAD_COVERAGE_PERCENT = 90

/** The range a cabinet's own spin performance is likely in, in spins for the balls ¥1,000 rents. */
export interface SpinRange {
  readonly low: number
  readonly high: number
}

/**
 * One standard deviation of a spin performance measured over so many
 * balls, in spins for the balls ¥1,000 rents: `√(R × (k − R) ÷ n)` for a
 * spin performance R, k balls to ¥1,000 and n balls played. None where no
 * ball was played or the spin performance cannot be one.
 */
export const spinDeviationOf = (spinPerformance: number, rentedPerThousand: number, balls: number): number | undefined =>
  balls <= 0 || spinPerformance < 0 || spinPerformance > rentedPerThousand ? undefined : Math.sqrt((spinPerformance * (rentedPerThousand - spinPerformance)) / balls)

/** The range a cabinet's own spin performance is likely in, from one measured over so many balls; none where it cannot be said. */
export const spinRangeOf = (spinPerformance: number, rentedPerThousand: number, balls: number): SpinRange | undefined => {
  const deviation = spinDeviationOf(spinPerformance, rentedPerThousand, balls)
  return deviation === undefined ? undefined : { low: Math.max(0, spinPerformance - SPREAD_DEVIATIONS * deviation), high: spinPerformance + SPREAD_DEVIATIONS * deviation }
}

/** How far either side a spin performance's range reaches after so many yen of balls, at the rental ¥1,000 buys so many: what the app's notes tabulate. */
export const spreadAfterYen = (spinPerformance: number, rentedPerThousand: number, yen: number): number | undefined =>
  ((deviation) => (deviation === undefined ? undefined : SPREAD_DEVIATIONS * deviation))(spinDeviationOf(spinPerformance, rentedPerThousand, (yen * rentedPerThousand) / 1000))

/** The range a cabinet's own spin performance is likely in, from what a play has measured so far at its corner; none until a ball of a stretch is measured. */
export const measuredSpinRangeOf = (measured: Measured | undefined, terms: PlayTerms | undefined): SpinRange | undefined =>
  measured === undefined || terms === undefined || measured.balls <= 0 ? undefined : spinRangeOf(spinPerformanceOf(measured, terms), rentedForThousand(terms), measured.balls)
