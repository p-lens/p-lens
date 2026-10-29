import type { IsoDate } from "../../../core/calendar/calendar"
import { isZero, negate, parseDecimal, sum, type Decimal } from "../../../core/decimal/decimal"
import { Err, Ok, type Result } from "../../../core/result/result"
import type { DayResult } from "../../../core/tally/day-results"

/** Which way a day went, chosen beside its sum: a phone's keyboard for numbers often has no minus. */
export type Sign = "gain" | "loss"

/** A day as it is being typed: which way it went, and its sum as typed. */
export interface Typed {
  readonly sign: Sign
  readonly amount: string
}

/** Whole yen, its thousands grouped by commas or not. */
const WHOLE_YEN = /^(\d+|\d{1,3}(,\d{3})+)$/

/** A day's 収支 from what was typed for it: none where nothing was, or nought, a day being written only where it came to something; refused where the sum is no whole yen. */
export const typedResult = (typed: Typed): Result<Decimal | undefined, "not-a-sum"> => {
  const plain = typed.amount.trim()
  if (plain === "") return Ok(undefined)
  const read = WHOLE_YEN.test(plain) ? parseDecimal(plain.replaceAll(",", "")) : undefined
  if (read?.ok !== true) return Err("not-a-sum")
  return Ok(isZero(read.value) ? undefined : typed.sign === "loss" ? negate(read.value) : read.value)
}

/** The days typed as they are written: in date order, those that came to something; a day whose sum is no whole yen is among the `unread`. */
export const enteredOf = (typed: ReadonlyMap<IsoDate, Typed>): { readonly days: readonly DayResult[]; readonly unread: readonly IsoDate[] } => {
  const dates = [...typed.keys()].sort()
  const read = dates.map((date) => [date, typedResult(typed.get(date) ?? { sign: "loss", amount: "" })] as const)
  return {
    days: read.flatMap(([date, result]) => (result.ok && result.value !== undefined ? [{ date, result: result.value }] : [])),
    unread: read.flatMap(([date, result]) => (result.ok ? [] : [date])),
  }
}

/** What the days typed come to together. */
export const enteredTotal = (days: readonly DayResult[]): Decimal => sum(days.map((day) => day.result))

/** The day after a day, whatever month it falls in. */
export const dayAfter = (day: IsoDate): IsoDate => {
  const [year = 0, monthOfYear = 1, dayOfMonth = 1] = day.split("-").map(Number)
  const next = new Date(Date.UTC(year, monthOfYear - 1, dayOfMonth + 1))
  return `${String(next.getUTCFullYear()).padStart(4, "0")}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}` as IsoDate
}
