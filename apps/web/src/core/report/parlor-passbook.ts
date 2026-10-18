import type { IsoDate } from "../calendar/calendar"
import { ZERO, type Decimal } from "../decimal/decimal"
import type { SavingsPool } from "../parlor/parlor"
import type { PassbookDay } from "./passbook"

/** One pool's day within a parlor's: the pool, and its day as its own passbook has it. */
export interface PoolDay {
  readonly pool: SavingsPool
  readonly day: PassbookDay
}

/**
 * One day of a parlor's passbook: what went out of its savings and came
 * in, in yen at the day's rates, what they were all worth at the day's end,
 * and the day of each pool that moved or had its rate set. A figure is
 * none where some token had no rate to be valued at.
 */
export interface ParlorPassbookDay {
  readonly date: IsoDate
  readonly withdrawn: Decimal | undefined
  readonly deposited: Decimal | undefined
  readonly balance: Decimal | undefined
  readonly pools: readonly PoolDay[]
}

/** A pool and its passbook, newest day first. */
export interface PoolPassbook {
  readonly pool: SavingsPool
  readonly days: readonly PassbookDay[]
}

/** What hledger said of the parlor's savings in yen: by day, what came in, what went out, and what was held at each day's end; a map left out where some token had no rate. */
export interface ParlorValues {
  readonly deposited: ReadonlyMap<string, Decimal> | undefined
  readonly withdrawn: ReadonlyMap<string, Decimal> | undefined
  readonly balances: ReadonlyMap<string, Decimal | undefined>
}

/** Every day any of the parlor's pools moved or had its rate set, newest first. */
export const parlorDaysOf = (pools: readonly PoolPassbook[]): readonly IsoDate[] => [...new Set(pools.flatMap((each) => each.days.map((day) => day.date)))].sort().reverse()

/**
 * A parlor's passbook, newest day first: its pools' passbooks taken day by
 * day together, with the yen hledger valued them at. Tokens of one pool
 * are never added to another's: only yen are summed, and by hledger.
 */
export const parlorPassbookOf = (pools: readonly PoolPassbook[], values: ParlorValues): readonly ParlorPassbookDay[] =>
  parlorDaysOf(pools).map((date) => ({
    date,
    withdrawn: values.withdrawn === undefined ? undefined : (values.withdrawn.get(date) ?? ZERO),
    deposited: values.deposited === undefined ? undefined : (values.deposited.get(date) ?? ZERO),
    balance: values.balances.get(date),
    pools: pools.flatMap((each) => each.days.filter((day) => day.date === date).map((day) => ({ pool: each.pool, day }))),
  }))
