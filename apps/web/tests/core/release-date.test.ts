import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../src/core/calendar/calendar"
import { readReleaseDate } from "../../src/core/catalog/release"

const TODAY = "2026-10-05" as IsoDate

describe("a machine's release date as typed", () => {
  test("is a day no earlier than machines and at most a year ahead", () => {
    expect(readReleaseDate("2026-09-01", TODAY)).toEqual({ ok: true, value: "2026-09-01" as IsoDate })
    expect(readReleaseDate("2027-10-06", TODAY).ok).toBe(true)
    expect(readReleaseDate("2027-10-07", TODAY)).toEqual({ ok: false, error: { type: "too-far-ahead" } })
    expect(readReleaseDate("1969-12-31", TODAY)).toEqual({ ok: false, error: { type: "too-early" } })
  })

  test("tells none typed apart from one that is not a day", () => {
    expect(readReleaseDate(" ", TODAY)).toEqual({ ok: false, error: { type: "missing" } })
    expect(readReleaseDate("2026-02-30", TODAY)).toEqual({ ok: false, error: { type: "not-a-date" } })
  })
})
