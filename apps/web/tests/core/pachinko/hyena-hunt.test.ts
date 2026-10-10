import { describe, expect, test } from "bun:test"

import { huntBorderOf, huntCurve, huntOf, huntYenAt } from "../../../src/core/pachinko/hyena-hunt"

/** A hunt of 250 spins on average whose rounds are worth ¥20,000, as the engine prices it at 20 spins per ¥1,000. */
const ROW = { initialSpins: 700, yen: 20_000 - (250 * 1000) / 20, spins: 250, rounds: 35, reliefDriveProbability: 0.457 }

describe("a 遊タイム狙い apart from the spin rate", () => {
  const hunt = huntOf(ROW, { spinPerformance: 20, ballValue: 3.57 })

  test("is what the engine's row says with the rate it was asked at taken back out", () => {
    expect(hunt).toEqual({ gain: 20_000, spins: 250 })
    expect(huntYenAt(hunt, 20)).toBe(ROW.yen)
    expect(huntYenAt(hunt, 10)).toBe(-5000)
  })

  test("breaks even where its spins cost what its rounds are worth", () => {
    expect(huntBorderOf(hunt)).toBe(12.5)
    expect(huntYenAt(hunt, 12.5)).toBe(0)
    expect(huntBorderOf({ gain: 0, spins: 250 })).toBeUndefined()
  })

  test("is drawn at evenly spaced rates, both ends included", () => {
    expect(huntCurve(hunt, 10, 20, 3)).toEqual([
      { spinPerformance: 10, yen: -5000 },
      { spinPerformance: 15, yen: 20_000 - 250_000 / 15 },
      { spinPerformance: 20, yen: 7500 },
    ])
  })
})
