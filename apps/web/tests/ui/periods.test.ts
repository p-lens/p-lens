import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../src/core/calendar/calendar"
import { EVERY_DAY, openingQueryOn, queryFor, queryOf, rangeOf, sameRange, shortcutsOn, widened, widenedFor, type DateRange } from "../../src/ui/features/period/periods"

const day = (text: string): IsoDate => text as IsoDate

const range = (from?: string, to?: string): DateRange => ({ from: from === undefined ? undefined : day(from), to: to === undefined ? undefined : day(to) })

describe("a period, as two days", () => {
  test("is written as hledger's query for them, the last day included, either end left open", () => {
    expect(queryOf(range("2026-10-01", "2026-10-31"))).toBe("date:2026-10-01..2026-11-01")
    expect(queryOf(range("2026-10-12", "2026-10-12"))).toBe("date:2026-10-12..2026-10-13")
    expect(queryOf(range("2026-12-31", "2026-12-31"))).toBe("date:2026-12-31..2027-01-01")
    expect(queryOf(range("2026-10-01"))).toBe("date:2026-10-01..")
    expect(queryOf(range(undefined, "2026-10-31"))).toBe("date:..2026-11-01")
    expect(queryOf(range())).toBe("")
  })

  test("is read back from the query it was written as", () => {
    const ranges = [range("2026-10-01", "2026-10-31"), range("2026-10-12", "2026-10-12"), range("2026-10-01"), range(undefined, "2026-10-31"), range(), range("2026-02-28", "2028-02-29")]
    expect(ranges.map((each) => rangeOf(queryOf(each)))).toEqual(ranges)
  })

  test("is not read from a query written some other way, or from days that are not days", () => {
    expect(rangeOf("date:2026-10")).toBeUndefined()
    expect(rangeOf("date:2026-10-12")).toBeUndefined()
    expect(rangeOf("tag:machine=流星")).toBeUndefined()
    expect(rangeOf("date:..")).toBeUndefined()
    expect(rangeOf("date:2026-13-01..2026-13-02")).toBeUndefined()
    expect(rangeOf("date:2026-10-01..2026-10-32")).toBeUndefined()
  })
})

describe("the periods offered by name", () => {
  const shortcuts = shortcutsOn(day("2026-10-12"))
  const named = (id: string): DateRange | undefined => shortcuts.find((shortcut) => shortcut.id === id)?.range

  test("are the business day, its month and its year, under those words, and every day there is has no name", () => {
    expect(shortcuts.map((shortcut) => shortcut.label)).toEqual(["本日", "今月", "今年"])
    expect(named("today")).toEqual(range("2026-10-12", "2026-10-12"))
    expect(named("month")).toEqual(range("2026-10-01", "2026-10-31"))
    expect(named("year")).toEqual(range("2026-01-01", "2026-12-31"))
    expect(shortcuts.filter((shortcut) => sameRange(shortcut.range, EVERY_DAY))).toEqual([])
    expect(queryOf(EVERY_DAY)).toBe("")
  })

  test("end a month on its last day, a leap February's included", () => {
    const monthOn = (today: string): DateRange | undefined => shortcutsOn(day(today)).find((shortcut) => shortcut.id === "month")?.range
    expect(monthOn("2028-02-10")).toEqual(range("2028-02-01", "2028-02-29"))
    expect(monthOn("2026-02-10")).toEqual(range("2026-02-01", "2026-02-28"))
    expect(monthOn("2026-12-31")).toEqual(range("2026-12-01", "2026-12-31"))
  })

  test("are each told from the others by their days, so that one is marked only while the fields say it", () => {
    expect(shortcuts.filter((shortcut) => sameRange(shortcut.range, range("2026-10-01", "2026-10-31"))).map((shortcut) => shortcut.id)).toEqual(["month"])
    expect(shortcuts.filter((shortcut) => sameRange(shortcut.range, range("2026-10-02", "2026-10-31")))).toEqual([])
  })
  test("open 集計 on the business day's year, which its shortcut then marks", () => {
    expect(openingQueryOn(day("2026-10-12"))).toBe("date:2026-01-01..2027-01-01")
    expect(rangeOf(openingQueryOn(day("2026-10-12")))).toEqual(named("year"))
  })
})

describe("a period, for a grouping by month or by year", () => {
  test("is widened to whole months, back to the first day of the one it begins in and on to the last of the one it ends in", () => {
    expect(widened(range("2026-10-05", "2026-11-20"), "month")).toEqual(range("2026-10-01", "2026-11-30"))
    expect(widened(range("2028-02-10", "2028-02-10"), "month")).toEqual(range("2028-02-01", "2028-02-29"))
    expect(widened(range("2026-10-01", "2026-10-31"), "month")).toEqual(range("2026-10-01", "2026-10-31"))
  })

  test("is widened to whole years, the first of January to the last of December", () => {
    expect(widened(range("2026-10-05", "2027-03-20"), "year")).toEqual(range("2026-01-01", "2027-12-31"))
    expect(widened(range("2026-10-12", "2026-10-12"), "year")).toEqual(range("2026-01-01", "2026-12-31"))
  })

  test("keeps an end left open as open as it was", () => {
    expect(widened(range("2026-10-05"), "month")).toEqual(range("2026-10-01"))
    expect(widened(range(undefined, "2026-10-05"), "year")).toEqual(range(undefined, "2026-12-31"))
    expect(widened(range(), "year")).toEqual(range())
  })

  test("is what the grouping is asked with, every other grouping taking the days as typed", () => {
    const typed = queryOf(range("2026-10-05", "2026-11-20"))
    expect(queryFor("month", typed)).toBe("date:2026-10-01..2026-12-01")
    expect(queryFor("year", typed)).toBe("date:2026-01-01..2027-01-01")
    expect(["day", "weekday", "machine", "parlor", "game", "book"].map((by) => queryFor(by, typed))).toEqual(Array.from({ length: 6 }, () => typed))
    expect(queryFor("month", "")).toBe("")
    expect(queryFor("month", "tag:machine=流星")).toBe("tag:machine=流星")
  })

  test("is said apart only where it is more days than were typed", () => {
    expect(widenedFor("month", queryOf(range("2026-10-05", "2026-11-20")))).toEqual({ span: "month", range: range("2026-10-01", "2026-11-30") })
    expect(widenedFor("month", queryOf(range("2026-10-01", "2026-10-31")))).toBeUndefined()
    expect(widenedFor("day", queryOf(range("2026-10-05", "2026-11-20")))).toBeUndefined()
    expect(widenedFor("year", "")).toBeUndefined()
  })
})
