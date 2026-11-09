import { describe, expect, test } from "bun:test"

import { DEFAULT_WEEK_START, readWeekStart } from "../../src/ui/theme/week-start"

describe("the day the calendars' weeks begin on", () => {
  test("is Sunday, until a person says Monday, and a stored choice is kept as it was", () => {
    expect(DEFAULT_WEEK_START).toBe("sunday")
    expect([readWeekStart(undefined), readWeekStart("tuesday"), readWeekStart("")]).toEqual(["sunday", "sunday", "sunday"])
    expect([readWeekStart("sunday"), readWeekStart("monday")]).toEqual(["sunday", "monday"])
  })
})
