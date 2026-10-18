import type { IsoDate } from "../calendar/calendar"
import { tokenCommodity } from "../commodity/commodity"
import { compare, isNegative, isZero, type Decimal } from "../decimal/decimal"
import type { SavingsPool } from "../parlor/parlor"
import { Err, Ok, type Result } from "../result/result"
import { rateOn, renderPricePoint, type PricePoint } from "../valuation/valuation"

/** A pool's exchange rate set from a day: yen for a token, as the book's prices say a rate. */
export interface RateChange {
  readonly parlorName: string
  readonly pool: SavingsPool
  readonly date: IsoDate
  readonly rate: Decimal
}

/** Why a rate cannot be set: it is no rate above nothing. */
export type RateChangeError = { readonly type: "rate-not-positive" }

/**
 * The price line that sets a pool's rate from a day, or nothing where that
 * rate is already in force on that day, whichever day it was set. It is all a change of rate is:
 * the savings are valued at it from then on, and what they gained or lost
 * by it is hledger's to work out.
 */
export const rateChangeLine = (change: RateChange, prices: readonly PricePoint[]): Result<string | undefined, RateChangeError> => {
  if (isZero(change.rate) || isNegative(change.rate)) return Err({ type: "rate-not-positive" })
  const commodity = tokenCommodity(change.pool.kind, change.parlorName, change.pool.tier)
  const current = rateOn(prices, commodity, change.date)
  return Ok(current !== undefined && compare(current.rate, change.rate) === 0 ? undefined : renderPricePoint({ date: change.date, commodity, rate: change.rate }))
}
