import type { BalanceReport, MixedAmount, Quantity, ReportRow } from "../../hledger/protocol/wire"
import { parseIsoDate, previousDay, type IsoDate } from "../calendar/calendar"
import { YEN } from "../commodity/commodity"
import { decimal, negate, sum, type Decimal } from "../decimal/decimal"
import { isWrittenReversed } from "../journal/accounts"
import { Err, Ok, andThen, collect, mapOk, type Result } from "../result/result"

/**
 * Why an hledger answer could not be read as the figure wanted. Kept as what
 * happened: a commodity left unvalued usually means a parlor with no exchange
 * rate on the day asked about, which the person can do something about.
 */
export type ReportError = { readonly type: "unvalued"; readonly commodities: readonly string[] }

/**
 * hledger's Decimal as an exact one, from the mantissa and the scale. hledger
 * also sends the value as a float; that field is never read.
 */
export const decimalOfQuantity = (quantity: Quantity): Decimal =>
  decimal(BigInt(quantity.decimalMantissa), quantity.decimalPlaces)

/**
 * The quantity of one commodity in a mixed amount; absent is zero.
 *
 * Summed, because one commodity can arrive as several amounts: hledger keeps
 * tokens rented at a cost apart from the same tokens drawn from savings, so
 * 4,800 balls shot can be 3,000 `@ 3.57 JPY` beside 1,800 with no cost at all.
 */
export const quantityIn = (mixed: MixedAmount, commodity: string): Decimal =>
  sum(mixed.filter((amount) => amount.acommodity === commodity).map((amount) => decimalOfQuantity(amount.aquantity)))

/** A mixed amount that should be all yen, or the commodities that were not. */
export const yenOf = (mixed: MixedAmount): Result<Decimal, ReportError> => {
  const others = mixed.map((amount) => amount.acommodity).filter((commodity) => commodity !== YEN)
  return others.length > 0 ? Err({ type: "unvalued", commodities: others }) : Ok(quantityIn(mixed, YEN))
}

/**
 * What the plays in an income statement made: hledger's total with the sign
 * an income statement is read with. Revenue is a credit and arrives negative,
 * so the net result is the total turned over, not recomputed.
 */
export const actualOf = (statement: BalanceReport): Result<Decimal, ReportError> =>
  mapOk(yenOf(statement.prTotals.prrTotal), negate)

/**
 * An income statement's two sides as a person reads them: what went into
 * the plays — cash and savings alike, the savings at the statement's
 * valuation — and what came out of them. What they made is the one less the
 * other.
 */
export interface Sides {
  readonly spent: Decimal
  readonly won: Decimal
}

const isRevenue = (row: ReportRow): boolean => typeof row.prrName === "string" && isWrittenReversed(row.prrName)

const yenAcross = (rows: readonly ReportRow[]): Result<Decimal, ReportError> => mapOk(collect(rows.map((row) => yenOf(row.prrTotal))), sum)

/** The sides of an income statement, each summed from hledger's own rows: revenue arrives negative and is turned over, as the total is. */
export const sidesOf = (statement: BalanceReport): Result<Sides, ReportError> =>
  andThen(yenAcross(statement.prRows.filter((row) => !isRevenue(row))), (spent) =>
    mapOk(yenAcross(statement.prRows.filter(isRevenue)), (credited) => ({ spent, won: negate(credited) })),
  )

/** A statistics account — the theoretical value — as hledger summed it in a balance report. */
export const statisticTotalOf = (balance: BalanceReport): Result<Decimal, ReportError> => yenOf(balance.prTotals.prrTotal)

/**
 * The last day a report covers, as hledger decided it. hledger's end is
 * exclusive, so this is the day before it. Absent for a report over nothing.
 */
export const lastDayOf = (report: BalanceReport): IsoDate | undefined => {
  const end = report.prDates.at(-1)?.[1]
  if (end === undefined || end === null) return undefined
  const parsed = parseIsoDate(end.contents)
  return parsed.ok ? previousDay(parsed.value) : undefined
}
