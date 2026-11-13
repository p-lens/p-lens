import { describe, expect, test } from "bun:test"

import { coveragePercentOf, deviationsAfter, measuredSpinRangeOf, spinRangeOf } from "../../../../src/core/pachinko/spin-spread/spin-spread"
import { coverageText, spinRangeLines, spinRangeText } from "../../../../src/ui/wording/pachinko/spin-spread"

const FOUR_YEN = { rental: { yen: 1000, tokens: 250 }, exchange: { yen: 100, tokens: 28 }, replay: { paidOut: 125, deducted: 125 } }

/** A 4円 range after so many yen at a spin performance of 18.4. */
const after = (yen: number) => ((balls) => spinRangeOf((18.4 * balls) / 250, balls, 250))((yen * 250) / 1000)

const width = (yen: number): number => ((range) => (range === undefined ? Number.NaN : range.high - range.low))(after(yen))

describe("how sure a range by a measured spin performance is", () => {
  test("is a normal distribution's chance within so many deviations", () => {
    expect(coveragePercentOf(1)).toBe(68)
    expect(coveragePercentOf(1.6449)).toBe(90)
    expect(coveragePercentOf(1.96)).toBe(95)
  })

  test("grows as the fourth root of the yen played, to 90% at ¥10,000, and stays there", () => {
    expect(deviationsAfter(10_000)).toBeCloseTo(1.6449, 10)
    expect(deviationsAfter(2500) / deviationsAfter(625)).toBeCloseTo(Math.SQRT2, 10)
    expect(deviationsAfter(30_000)).toBe(deviationsAfter(10_000))
    expect(deviationsAfter(0)).toBe(0)
  })
})

describe("the range a cabinet's own spin performance is likely in", () => {
  test("is surer and narrower at once the more is played, never the one at the other's cost", () => {
    const yen = [250, 500, 1000, 2000, 5000, 9999, 10_000, 20_000, 30_000]
    const coverages = yen.map((each) => after(each)?.coveragePercent ?? Number.NaN)
    const widths = yen.map(width)
    coverages.slice(1).forEach((coverage, at) => expect(coverage).toBeGreaterThanOrEqual(coverages[at] ?? Number.NaN))
    widths.slice(1).forEach((each, at) => expect(each).toBeLessThan(widths[at] ?? Number.NaN))
  })

  test("is the Wilson score interval, as the app's notes tabulate it at a 4円 corner", () => {
    expect([coverageText(after(1000)), spinRangeText(after(1000))]).toEqual(["65%", "14.9〜22.6"])
    expect([coverageText(after(10_000)), spinRangeText(after(10_000))]).toEqual(["90%", "16.4〜20.7"])
    expect([coverageText(after(20_000)), spinRangeText(after(20_000))]).toEqual(["90%", "16.9〜20.0"])
  })

  test("never closes up over a handful of balls none of which entered", () => {
    const range = spinRangeOf(0, 100, 250)
    expect(range?.low).toBe(0)
    expect(range?.high).toBeGreaterThan(1)
  })

  test("is none where no ball was played or the spins cannot be so many", () => {
    expect(spinRangeOf(0, 0, 250)).toBeUndefined()
    expect(spinRangeOf(120, 100, 250)).toBeUndefined()
  })

  test("is said of a live play from what it has measured, and dashed until a ball is", () => {
    expect(spinRangeLines(measuredSpinRangeOf({ spins: 46, balls: 625, rentedBalls: 625, replayedBalls: 0 }, FOUR_YEN))[0]).toBe("回転率は76%の確率で")
    expect(spinRangeLines(measuredSpinRangeOf(undefined, FOUR_YEN))).toEqual(["回転率は--%の確率で", "--〜--の範囲内"])
  })
})
