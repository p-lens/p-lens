import { describe, expect, test } from "bun:test"

import { measuredSpinRangeOf, spinDeviationOf, spinRangeOf, spreadAfterYen } from "../../../../src/core/pachinko/spin-spread/spin-spread"
import { spinRangeText, spreadText } from "../../../../src/ui/wording/pachinko/spin-spread"

const FOUR_YEN = { rental: { yen: 1000, tokens: 250 }, exchange: { yen: 100, tokens: 28 }, replay: { paidOut: 125, deducted: 125 } }

describe("how far a measured spin performance may stand from the cabinet's own", () => {
  test("is a binomial's standard deviation, in spins for the balls ¥1,000 rents", () => {
    expect(spinDeviationOf(18, 250, 2500)).toBeCloseTo(Math.sqrt((18 * 232) / 2500), 10)
    expect(spinDeviationOf(18, 250, 0)).toBeUndefined()
    expect(spinDeviationOf(300, 250, 2500)).toBeUndefined()
  })

  test("halves as four times the balls are played", () => {
    const at = (balls: number): number => spinDeviationOf(18, 250, balls) ?? Number.NaN
    expect(at(10_000) / at(2500)).toBeCloseTo(0.5, 10)
  })

  test("reaches nine chances in ten either side, never below nought", () => {
    const range = spinRangeOf(18.4, 250, 2500)
    expect(range?.low).toBeCloseTo(16.25, 2)
    expect(range?.high).toBeCloseTo(20.55, 2)
    expect(spinRangeOf(1, 250, 10)?.low).toBe(0)
  })

  test("after so many yen at a 4円 corner, as the app's notes tabulate it", () => {
    expect(spreadText(spreadAfterYen(18, 250, 10_000))).toBe("±2.1")
    expect(spreadText(spreadAfterYen(18, 250, 20_000))).toBe("±1.5")
    expect(spreadText(spreadAfterYen(18, 250, 1000))).toBe("±6.7")
  })

  test("is said of a live play from what it has measured, and dashed until a ball is", () => {
    const range = measuredSpinRangeOf({ spins: 184, balls: 2500, rentedBalls: 2500, replayedBalls: 0 }, FOUR_YEN)
    expect(spinRangeText(range)).toBe("本当の回転率は90%の確率で16.3〜20.5の範囲内")
    expect(spinRangeText(measuredSpinRangeOf(undefined, FOUR_YEN))).toBe("本当の回転率は90%の確率で--〜--の範囲内")
    expect(measuredSpinRangeOf({ spins: 0, balls: 0, rentedBalls: 0, replayedBalls: 0 }, FOUR_YEN)).toBeUndefined()
  })
})
