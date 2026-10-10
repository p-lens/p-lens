import type { IsoDate } from "../calendar/calendar"
import { YEN, renderCommodity, tokenCommodity } from "../commodity/commodity"
import { compare, isNegative, isZero, toPlainString, type Decimal } from "../decimal/decimal"
import { savingsAccount } from "../journal/accounts"
import { Err, Ok, type Result } from "../result/result"
import { rateOn, type PricePoint } from "../valuation/valuation"
import { identityTags, sameIdentity, samePool, type Parlor, type ParlorIdentity, type SavingsPool } from "./parlor"
import { sameParlorName } from "./search"
import { isWritableParlorName } from "./shared"

/**
 * A play about to start at a parlor's pool: the parlor — listed, or submitted
 * and waiting — the pool its terms make, and the exchange rate those terms
 * state for the day.
 */
export interface PoolOpening {
  readonly identity: ParlorIdentity
  readonly parlorName: string
  readonly pool: SavingsPool
  readonly rate: Decimal
  readonly date: IsoDate
}

export type OpeningProblem =
  | { readonly type: "name-unwritable"; readonly name: string }
  /** Another parlor the book keeps has this name, widths, case, spaces and marks aside, and their accounts would be the same or told apart by nobody. */
  | { readonly type: "name-taken"; readonly name: string }
  | { readonly type: "rate-not-positive" }

/** An opening that can be written into a book with these parlors, or the first reason it cannot. */
export const checkOpening = (opening: PoolOpening, parlors: readonly Parlor[]): Result<PoolOpening, OpeningProblem> => {
  if (!isWritableParlorName(opening.parlorName)) return Err({ type: "name-unwritable", name: opening.parlorName })
  if (parlors.some((parlor) => sameParlorName(parlor.name, opening.parlorName) && !sameIdentity(parlor.identity, opening.identity))) return Err({ type: "name-taken", name: opening.parlorName })
  return isNegative(opening.rate) || isZero(opening.rate) ? Err({ type: "rate-not-positive" }) : Ok(opening)
}

const commodityOf = (opening: PoolOpening): string => tokenCommodity(opening.pool.kind, opening.parlorName, opening.pool.tier)

const kept = (opening: PoolOpening, parlors: readonly Parlor[]): boolean =>
  parlors.some((parlor) => sameIdentity(parlor.identity, opening.identity) && parlor.pools.some((pool) => samePool(pool, opening.pool)))

/**
 * What opening a pool writes into a book: its commodity and account, if the
 * book does not keep that pool yet, and the day's rate, if the book's rate for
 * the day is not already that. Either may be nothing.
 */
export interface OpeningText {
  readonly declarations: string | undefined
  readonly price: string | undefined
}

export const openingText = (opening: PoolOpening, parlors: readonly Parlor[], prices: readonly PricePoint[]): OpeningText => {
  const commodity = commodityOf(opening)
  const current = rateOn(prices, commodity, opening.date)
  return {
    declarations: kept(opening, parlors)
      ? undefined
      : [
          `commodity 1. ${renderCommodity(commodity)}`,
          `account ${savingsAccount(opening.pool.kind, opening.parlorName, opening.pool.tier)}  ; ${identityTags(opening.identity).map(([tag, value]) => `${tag}: ${value}`).join(", ")}`,
          "",
        ].join("\n"),
    price:
      current !== undefined && current.date === opening.date && compare(current.rate, opening.rate) === 0
        ? undefined
        : `P ${opening.date} ${renderCommodity(commodity)} ${toPlainString(opening.rate)} ${YEN}\n`,
  }
}

/** The parlor as the book keeps it once the pool is open. */
export const parlorOpened = (opening: PoolOpening, parlors: readonly Parlor[]): Parlor => {
  const existing = parlors.find((parlor) => sameIdentity(parlor.identity, opening.identity))
  const pools = existing?.pools ?? []
  return {
    identity: opening.identity,
    name: opening.parlorName,
    pools: pools.some((pool) => samePool(pool, opening.pool)) ? pools : [...pools, opening.pool],
  }
}
