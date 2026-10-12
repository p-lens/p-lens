import type { IsoDate } from "../calendar/calendar"
import { YEN, renderCommodity } from "../commodity/commodity"
import { toPlainString, type Decimal } from "../decimal/decimal"

/**
 * How amounts in tokens are turned into yen, and the two are never mixed:
 *
 * - `posting-date` values each posting at the exchange rate of its own day —
 *   hledger's `--value=then`. What a period actually made or lost.
 * - `period-end` values what is held at the rate in force at the end of the
 *   period — `--value=end`. What savings are worth now, or were worth then.
 */
export type Valuation = { readonly at: "posting-date" } | { readonly at: "period-end" }

/**
 * One exchange rate, as a `P` directive states it: from this day on, one unit
 * of the commodity is worth `rate` yen at its parlor.
 *
 * Rates are only ever added. A changed rate is a new point on a later day, so
 * every past day keeps the rate it had.
 */
export interface PricePoint {
  readonly date: IsoDate
  readonly commodity: string
  readonly rate: Decimal
}

/** Of points on the same day, the one written later wins, as in hledger. */
const latestOf = (points: readonly PricePoint[]): PricePoint | undefined =>
  points.reduce<PricePoint | undefined>(
    (latest, point) => (latest === undefined || point.date >= latest.date ? point : latest),
    undefined,
  )

/** The rate in force for a commodity on a day: the latest point on or before it. */
export const rateOn = (points: readonly PricePoint[], commodity: string, date: IsoDate): PricePoint | undefined =>
  latestOf(points.filter((point) => point.commodity === commodity && point.date <= date))

/** The latest rate a commodity has at all. */
export const latestRate = (points: readonly PricePoint[], commodity: string): PricePoint | undefined =>
  latestOf(points.filter((point) => point.commodity === commodity))

/**
 * The point that gives a commodity a rate on a day it has none: the first
 * rate it was ever given, reaching back to that day. A play dated before
 * its pool was opened is counted at the rate the pool was opened with,
 * since the book knows no other, and no day that had a rate is given
 * another. Nothing where the day has a rate already, or the commodity
 * never had one.
 */
export const rateReachingBack = (points: readonly PricePoint[], commodity: string, date: IsoDate): PricePoint | undefined => {
  if (rateOn(points, commodity, date) !== undefined) return undefined
  const first = points.reduce<IsoDate | undefined>((earliest, point) => (point.commodity === commodity && (earliest === undefined || point.date < earliest) ? point.date : earliest), undefined)
  const opened = first === undefined ? undefined : rateOn(points, commodity, first)
  return opened === undefined ? undefined : { ...opened, date }
}

/** A rate as the `P` directive that states it, on a line of its own. */
export const renderPricePoint = (point: PricePoint): string => `P ${point.date} ${renderCommodity(point.commodity)} ${toPlainString(point.rate)} ${YEN}\n`
