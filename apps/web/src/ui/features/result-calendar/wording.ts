import type { IsoDate, IsoMonth } from "../../../core/calendar/calendar"
import type { Decimal } from "../../../core/decimal/decimal"
import { formatSignedYen } from "../../wording/numbers"

/** What the calendar is called in a book's list of views. */
export const RESULT_CALENDAR = "カレンダー"

/** The days of a week as the calendar heads its columns, Sunday first. */
export const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const

/** `2026-10` as `2026年10月`. */
export const monthTitle = (month: IsoMonth): string => {
  const [year = 0, monthOfYear = 0] = month.split("-").map(Number)
  return `${year}年${monthOfYear}月`
}

/** `2026-10-03` as `3`: a day in its cell, where the month is said above. */
export const dayNumber = (day: IsoDate): string => String(Number(day.slice(8)))

/** A day's result as its cell has room for: signed and grouped, the yen sign left to the figures above. */
export const cellResult = (value: Decimal): string => formatSignedYen(value).replace("¥", "")

/** What a day's cell says to whoever cannot see it. */
export const daySays = (day: IsoDate, result: Decimal | undefined): string => {
  const [, monthOfYear = 0, dayOfMonth = 0] = day.split("-").map(Number)
  return result === undefined ? `${monthOfYear}月${dayOfMonth}日 稼働なし` : `${monthOfYear}月${dayOfMonth}日 実収支 ${formatSignedYen(result)}`
}
