import { describe, expect, test } from "bun:test"

import { toPlainString } from "../../src/core/decimal/decimal"
import { oddPrizeReckoningOf, readStageStep, stagesOf, type StageStep } from "../../src/core/savings/odd-prize-reckoning"

const RENTAL = { yen: 1000, tokens: 250 }

const BALLS_28 = { yen: 1000, tokens: 280 }
const BALLS_27_5 = { yen: 1000, tokens: 275 }
const MEDALS_5_15 = { yen: 10_000, tokens: 515 }
const MEDALS_5_1 = { yen: 10_000, tokens: 510 }

/** Each stage as the tokens kept, the special prizes, the odd prizes beside them and the tokens to play first. */
const stages = (tokens: number, exchange: { readonly yen: number; readonly tokens: number }, step: StageStep) =>
  stagesOf(tokens, exchange, step).map((stage) => [stage.kept, toPlainString(stage.specialPrizes), toPlainString(stage.oddPrizes), stage.toPlay])

describe("the odd-prize reckoning", () => {
  test("says what balls are worth exchanged and rented, the part of a yen cut off", () => {
    const reckoning = oddPrizeReckoningOf(1405, { rental: RENTAL, exchange: BALLS_28 })
    expect([toPlainString(reckoning.rented), toPlainString(reckoning.exchanged)]).toEqual(["5620", "5017"])
  })

  test("sets out every count to stop at, a step apart, the nearest first and none left last", () => {
    expect(stages(1405, BALLS_28, 1000)).toEqual([
      [1400, "5000", "0", 5],
      [1120, "4000", "0", 285],
      [840, "3000", "0", 565],
      [560, "2000", "0", 845],
      [280, "1000", "0", 1125],
      [0, "0", "0", 1405],
    ])
    expect(stages(1405, BALLS_28, 500).slice(0, 3)).toEqual([
      [1400, "5000", "0", 5],
      [1260, "4500", "0", 145],
      [1120, "4000", "0", 285],
    ])
  })

  test("sets out twenty at most", () => {
    expect(stages(1405, BALLS_28, 100)).toHaveLength(20)
    expect(stages(1405, BALLS_28, 100).at(-1)).toEqual([868, "3100", "0", 537])
  })

  test("leaves only playing them all where the tokens come short of a step", () => {
    expect(stages(600, BALLS_27_5, 1000)).toEqual([
      [550, "2000", "0", 50],
      [275, "1000", "0", 325],
      [0, "0", "0", 600],
    ])
    expect(stages(274, BALLS_27_5, 1000)).toEqual([[0, "0", "0", 274]])
  })

  test("keeps the whole tokens a step that is not whole tokens takes, the odd prizes left under a token's worth", () => {
    expect(stages(523, MEDALS_5_15, 500).slice(0, 4)).toEqual([
      [515, "10000", "0", 8],
      [490, "9500", "15", 33],
      [464, "9000", "10", 59],
      [438, "8500", "5", 85],
    ])
    expect(stages(523, MEDALS_5_15, 500)).toHaveLength(20)
    expect(stages(523, MEDALS_5_15, 500).at(-1)).toEqual([26, "500", "5", 497])
    expect(stages(300, BALLS_27_5, 100)[0]).toEqual([275, "1000", "0", 25])
    expect(stages(300, BALLS_27_5, 100)[1]).toEqual([248, "900", "2", 52])
  })

  test("steps by whole medals where they are", () => {
    expect(stages(120, MEDALS_5_1, 1000)).toEqual([
      [102, "2000", "0", 18],
      [51, "1000", "0", 69],
      [0, "0", "0", 120],
    ])
  })

  test("starts at ¥500 until a step is chosen, and keeps no step it has no stages by", () => {
    expect([readStageStep(undefined), readStageStep("100"), readStageStep("1000"), readStageStep("250")]).toEqual([500, 100, 1000, 500])
  })
})
