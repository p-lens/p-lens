import { describe, expect, test } from "bun:test"

import { toPlainString } from "../../src/core/decimal/decimal"
import { exactStagesOf, oddPrizeReckoningOf, readStageStep, type StageStep } from "../../src/core/savings/odd-prize-reckoning"

const RENTAL = { yen: 1000, tokens: 250 }

const stages = (tokens: number, exchange: { readonly yen: number; readonly tokens: number }, step: StageStep = 1000) =>
  exactStagesOf(tokens, exchange, step).map((stage) => [stage.kept, toPlainString(stage.specialPrizes), stage.toPlay])

describe("the odd-prize reckoning", () => {
  test("says what balls are worth exchanged and played again", () => {
    const reckoning = oddPrizeReckoningOf(1405, { rental: RENTAL, exchange: { yen: 1000, tokens: 280 } })
    expect([toPlainString(reckoning.rented), toPlainString(reckoning.exchanged)]).toEqual(["5620", "5017"])
  })

  test("sets out every count to stop at that exchange exactly, ¥1,000 apart, the nearest first and none left last", () => {
    expect(stages(1405, { yen: 1000, tokens: 280 })).toEqual([
      [1400, "5000", 5],
      [1120, "4000", 285],
      [840, "3000", 565],
      [560, "2000", 845],
      [280, "1000", 1125],
      [0, "0", 1405],
    ])
    expect(stages(1400, { yen: 1000, tokens: 280 })[0]).toEqual([1400, "5000", 0])
  })

  test("leaves only playing them all where the balls come short of ¥1,000", () => {
    expect(stages(600, { yen: 1000, tokens: 275 })).toEqual([
      [550, "2000", 50],
      [275, "1000", 325],
      [0, "0", 600],
    ])
    expect(stages(274, { yen: 1000, tokens: 275 })).toEqual([[0, "0", 274]])
  })

  test("steps by as many thousands as it takes to be whole medals", () => {
    expect(stages(523, { yen: 10000, tokens: 515 })).toEqual([
      [515, "10000", 8],
      [412, "8000", 111],
      [309, "6000", 214],
      [206, "4000", 317],
      [103, "2000", 420],
      [0, "0", 523],
    ])
    expect(stages(120, { yen: 10000, tokens: 510 })).toEqual([
      [102, "2000", 18],
      [51, "1000", 69],
      [0, "0", 120],
    ])
  })

  test("steps by a smaller special prize where one is chosen, twenty at most", () => {
    expect(stages(1405, { yen: 1000, tokens: 280 }, 500).slice(0, 3)).toEqual([
      [1400, "5000", 5],
      [1260, "4500", 145],
      [1120, "4000", 285],
    ])
    expect(stages(1405, { yen: 1000, tokens: 280 }, 100)).toHaveLength(20)
    expect(stages(1405, { yen: 1000, tokens: 280 }, 100).slice(0, 2)).toEqual([
      [1400, "5000", 5],
      [1372, "4900", 33],
    ])
    expect(stages(1405, { yen: 1000, tokens: 280 }, 100).at(-1)).toEqual([868, "3100", 537])
    expect(stages(250, { yen: 10000, tokens: 515 }, 100)).toEqual([
      [206, "4000", 44],
      [103, "2000", 147],
      [0, "0", 250],
    ])
  })

  test("starts at ¥500 until a step is chosen, and keeps no step it has no stages by", () => {
    expect([readStageStep(undefined), readStageStep("100"), readStageStep("1000"), readStageStep("250")]).toEqual([500, 100, 1000, 500])
  })
})
