import type { IsoDate, IsoMonth } from "../../../core/calendar/calendar"
import type { Group } from "../../../core/report/breakdown"

const DAYS_A_WEEK = 7

const partsOf = (month: IsoMonth): readonly [number, number] => {
  const [year = 0, monthOfYear = 1] = month.split("-").map(Number)
  return [year, monthOfYear]
}

const padded = (count: number, width: number): string => String(count).padStart(width, "0")

/** The month so many months on from one, or before it where the count is below nothing. */
const monthsFrom = (month: IsoMonth, count: number): IsoMonth => {
  const [year, monthOfYear] = partsOf(month)
  const moved = new Date(Date.UTC(year, monthOfYear - 1 + count, 1))
  return `${padded(moved.getUTCFullYear(), 4)}-${padded(moved.getUTCMonth() + 1, 2)}` as IsoMonth
}

export const monthBefore = (month: IsoMonth): IsoMonth => monthsFrom(month, -1)

export const monthAfter = (month: IsoMonth): IsoMonth => monthsFrom(month, 1)

/** The hledger query that is a month: every figure the calendar shows is asked for by it. */
export const monthQuery = (month: IsoMonth): string => `date:${month}`

/** A day of a month, or the gap a week has before the month's first day and after its last. */
export type Cell = IsoDate | undefined

/**
 * A month as the weeks it is laid out in, Sunday first, each seven cells:
 * its days in order, with gaps where a week begins before the month or
 * ends after it.
 */
export const weeksOf = (month: IsoMonth): readonly (readonly Cell[])[] => {
  const [year, monthOfYear] = partsOf(month)
  const leading = new Date(Date.UTC(year, monthOfYear - 1, 1)).getUTCDay()
  const length = new Date(Date.UTC(year, monthOfYear, 0)).getUTCDate()
  const days = Array.from({ length }, (_, index): Cell => `${month}-${padded(index + 1, 2)}` as IsoDate)
  const cells: readonly Cell[] = [...Array.from({ length: leading }, (): Cell => undefined), ...days]
  const trailing = (DAYS_A_WEEK - (cells.length % DAYS_A_WEEK)) % DAYS_A_WEEK
  const filled: readonly Cell[] = [...cells, ...Array.from({ length: trailing }, (): Cell => undefined)]
  return Array.from({ length: filled.length / DAYS_A_WEEK }, (_, week) => filled.slice(week * DAYS_A_WEEK, (week + 1) * DAYS_A_WEEK))
}

/** A daily breakdown's groups by the day each is of. */
export const byDay = (groups: readonly Group[]): ReadonlyMap<string, Group> => new Map(groups.map((group) => [group.key, group]))
