import { describe, expect, test } from "bun:test"

import { BUSINESS_DAY_TURNS, businessDayOf, DEFAULT_BUSINESS_DAY_TURN, localDayOf, monthOf, nextDay, parseIsoDate, previousDay, readBusinessDayTurn, type IsoDate } from "../../src/core/calendar/calendar"

describe("calendar", () => {
  test("accepts only days that exist", () => {
    expect(parseIsoDate("2026-10-03").ok).toBe(true)
    expect(parseIsoDate("2026-02-30")).toEqual({ ok: false, error: { type: "not-a-date", text: "2026-02-30" } })
    expect(parseIsoDate("2026/10/03").ok).toBe(false)
  })

  test("steps across month and year ends", () => {
    expect(nextDay("2026-12-31" as IsoDate)).toBe("2027-01-01" as IsoDate)
    expect(previousDay("2026-03-01" as IsoDate)).toBe("2026-02-28" as IsoDate)
    expect(monthOf("2026-10-03" as IsoDate)).toBe("2026-10" as never)
  })

  test("the local day is read from local fields, not UTC", () => {
    expect(localDayOf(new Date(2026, 9, 3, 0, 30))).toBe("2026-10-03" as IsoDate)
  })

  test("the business day turns over at five in the morning by default, not at midnight", () => {
    expect(DEFAULT_BUSINESS_DAY_TURN).toBe(5)
    expect(businessDayOf(new Date(2026, 9, 3, 23, 59), 5)).toBe("2026-10-03" as IsoDate)
    expect(businessDayOf(new Date(2026, 9, 4, 0, 30), 5)).toBe("2026-10-03" as IsoDate)
    expect(businessDayOf(new Date(2026, 9, 4, 4, 59), 5)).toBe("2026-10-03" as IsoDate)
    expect(businessDayOf(new Date(2026, 9, 4, 5, 0), 5)).toBe("2026-10-04" as IsoDate)
  })

  test("the business day before the first of a month, and of a year, is the last of the one before", () => {
    expect(businessDayOf(new Date(2026, 10, 1, 2, 0), 5)).toBe("2026-10-31" as IsoDate)
    expect(businessDayOf(new Date(2027, 0, 1, 3, 0), 5)).toBe("2026-12-31" as IsoDate)
  })

  test("it turns over at whatever hour is set: at midnight it is the calendar's day, at nine it runs to nine", () => {
    expect(businessDayOf(new Date(2026, 9, 4, 0, 0), 0)).toBe("2026-10-04" as IsoDate)
    expect(businessDayOf(new Date(2026, 9, 4, 8, 59), 9)).toBe("2026-10-03" as IsoDate)
    expect(businessDayOf(new Date(2026, 9, 4, 9, 0), 9)).toBe("2026-10-04" as IsoDate)
    expect(BUSINESS_DAY_TURNS).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  test("the hour a person set is read back as kept, and anything else kept there is five", () => {
    expect(["0", "7", "9"].map(readBusinessDayTurn)).toEqual([0, 7, 9])
    expect([undefined, "", "10", "-1", "5.5", "five"].map(readBusinessDayTurn)).toEqual([5, 5, 5, 5, 5, 5])
  })
})
