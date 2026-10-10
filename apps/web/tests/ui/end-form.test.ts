import { describe, expect, test } from "bun:test"

import { counterStands, endedAt, endFormOf, readEndForm } from "../../src/ui/features/live/end-form"

const at = (year: number, month: number, day: number, hour: number, minute: number): string => new Date(year, month - 1, day, hour, minute).toISOString()

describe("the time a play ended", () => {
  const began = at(2026, 10, 8, 19, 30)

  test("is that time on the day the play began", () => {
    expect(endedAt(began, { hour: 22, minute: 45 })).toBe(at(2026, 10, 8, 22, 45))
    expect(endedAt(began, { hour: 19, minute: 30 })).toBe(at(2026, 10, 8, 19, 30))
  })

  test("is on the day after where the play ran past midnight", () => {
    expect(endedAt(began, { hour: 0, minute: 15 })).toBe(at(2026, 10, 9, 0, 15))
    expect(endedAt(at(2026, 12, 31, 23, 0), { hour: 1, minute: 0 })).toBe(at(2027, 1, 1, 1, 0))
  })

  test("opens on now and the counter as last read, and reads back as typed", () => {
    const form = endFormOf(at(2026, 10, 8, 23, 5), { figure: "spins", count: 420 })
    expect(form).toEqual({ time: { hour: 23, minute: 5 }, counter: "420" })
    expect(readEndForm({ ...form, counter: "４５５" }, began)).toEqual({ at: at(2026, 10, 8, 23, 5), counter: 455 })
    expect(counterStands({ ...form, counter: "10" }, { figure: "spins", count: 420 })).toBe(false)
  })
})
