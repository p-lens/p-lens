import { ZERO, add, compare, negate, rounded, type Decimal } from "../decimal/decimal"
import type { TallyLine } from "../report/tally-line"

const larger = (left: Decimal, right: Decimal): Decimal => (compare(left, right) >= 0 ? left : right)

/** A tally's two sides in whole yen, as another app takes them in. */
export interface WholeSides {
  readonly outlay: Decimal
  readonly takings: Decimal
  readonly result: Decimal
}

/**
 * A tally's two sides in whole yen, so that what came back less what went
 * in is its 収支 as this app shows it, to the yen, and neither is below
 * nothing: what went in is the expenses rounded, raised where a hand-written
 * entry would leave it short of a loss or below nothing.
 */
export const wholeSidesOf = (line: TallyLine): WholeSides => {
  const result = rounded(line.actual, 0)
  const outlay = [rounded(line.sides.spent, 0), negate(result)].reduce(larger, ZERO)
  return { outlay, takings: add(outlay, result), result }
}
