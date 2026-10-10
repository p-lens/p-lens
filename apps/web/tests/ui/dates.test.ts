import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../src/core/calendar/calendar"
import { businessDayNote, formatDay, formatDayOfYear } from "../../src/ui/wording/dates"

describe("a day in words", () => {
  test("is said with its weekday, with its year or within the year in hand", () => {
    expect(formatDay("2026-10-03" as IsoDate)).toBe("2026年10月3日(土)")
    expect(formatDayOfYear("2026-10-10" as IsoDate)).toBe("10月10日(土)")
  })
})

describe("the business day beside today", () => {
  test("is said once the calendar has moved on from it, and not while they are the same day", () => {
    expect(businessDayNote("2026-10-10" as IsoDate, "2026-10-11" as IsoDate)).toBe("10月10日(土)")
    expect(businessDayNote("2026-10-11" as IsoDate, "2026-10-11" as IsoDate)).toBeUndefined()
  })
})
