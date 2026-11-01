import { describe, expect, test } from "bun:test"

import { UNSAID } from "../../src/core/report/breakdown"
import { drilledFrom } from "../../src/ui/features/breakdown/drill"

describe("a group's row pressed", () => {
  test("looks into a game by parlor, a parlor by machine and a machine by parlor, narrowed to it on top of what was narrowed", () => {
    expect(drilledFrom("game", "pachislot", {}, "date:2026-10-01..2026-11-01")).toEqual({ by: "parlor", narrowing: { game: ["pachislot"] }, query: "date:2026-10-01..2026-11-01" })
    expect(drilledFrom("parlor", "店A", { game: ["pachislot"] }, "")).toEqual({ by: "machine", narrowing: { game: ["pachislot"], parlor: ["店A"] }, query: "" })
    expect(drilledFrom("machine", "台X", { machine: ["台Y", "台X"] }, "")).toEqual({ by: "parlor", narrowing: { machine: ["台X"] }, query: "" })
  })

  test("opens a year by month and a month by day over its own days, keeping what was narrowed", () => {
    expect(drilledFrom("year", "2025", { parlor: ["店A"] }, "")).toEqual({ by: "month", narrowing: { parlor: ["店A"] }, query: "date:2025-01-01..2026-01-01" })
    expect(drilledFrom("month", "2026-02", {}, "date:2026-01-01..2027-01-01")).toEqual({ by: "day", narrowing: {}, query: "date:2026-02-01..2026-03-01" })
  })

  test("goes nowhere from a day, a day of the week, or the tallies that do not say what is asked", () => {
    expect(drilledFrom("day", "2026-10-01", {}, "")).toBeUndefined()
    expect(drilledFrom("weekday", "3", {}, "")).toBeUndefined()
    expect(drilledFrom("parlor", UNSAID, {}, "")).toBeUndefined()
  })
})
