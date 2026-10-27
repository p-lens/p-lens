import { describe, expect, test } from "bun:test"

import type { SettingLevelFigures } from "../../../src/core/pachislot/figures"
import type { SettingDistributionId, SettingLevelShare } from "../../../src/core/pachislot/formula"
import type { Prior } from "../../../src/core/pachislot/prior"
import { priorPayoutRateOf, sheetValueOf } from "../../../src/core/pachislot/theoretical-value"

/** 50 medals for ¥1,000 and 5 for ¥100: a medal rents and exchanges at ¥20. */
const EVEN = { rentedPerThousand: 50, exchangedPerHundred: 5, ownShare: 0 }

const PLAY = { bet: 3, games: 1000, gamesPerHour: 750 }

const levelAt = (settingLevel: number, payoutRate: number): SettingLevelFigures => ({ settingLevel, payoutRate, bonuses: [], combinedOneIn: 100 })

describe("sheetValueOf", () => {
  test("at an even exchange cash and own medals are worth the same: the bet times what the 機械割 adds", () => {
    const value = sheetValueOf(1.1, EVEN, PLAY)
    expect(value.yenPerGame).toBeCloseTo(3 * 0.1 * 20, 9)
    expect(value.medalsGained).toBeCloseTo(300, 9)
    expect(value.theoreticalValue).toBeCloseTo(6000, 6)
    expect(value.yenPerHour).toBeCloseTo(6 * 750, 6)
    expect(sheetValueOf(1.1, { ...EVEN, ownShare: 1 }, PLAY).theoreticalValue).toBeCloseTo(6000, 6)
  })

  test("at 5.6 medals for ¥100 cash loses the spread on every bet, own medals only on what they gain, and the mix lies between by the share", () => {
    const corner = { rentedPerThousand: 46, exchangedPerHundred: 5.6, ownShare: 0 }
    const medal = 100 / 5.6
    const cash = sheetValueOf(1.0, corner, PLAY).yenPerGame
    const own = sheetValueOf(1.0, { ...corner, ownShare: 1 }, PLAY).yenPerGame
    expect(cash).toBeCloseTo(3 * medal - 3000 / 46, 9)
    expect(own).toBeCloseTo(0, 9)
    expect(sheetValueOf(1.0, { ...corner, ownShare: 0.65 }, PLAY).yenPerGame).toBeCloseTo(0.35 * cash, 9)
  })

  test("no hour's value where the games an hour are not said", () => {
    expect(sheetValueOf(1.05, EVEN, { ...PLAY, gamesPerHour: undefined }).yenPerHour).toBeUndefined()
  })
})

describe("priorPayoutRateOf", () => {
  const FIGURES = [levelAt(1, 0.97), levelAt(2, 0.99), levelAt(6, 1.12)]
  const spread = (shares: readonly SettingLevelShare[]): Prior => ({ type: "distribution", id: "d1" as SettingDistributionId, label: "平日", shares })

  test("each level's 機械割 weighed by its share", () => {
    expect(priorPayoutRateOf(FIGURES, spread([{ settingLevel: 1, basisPoints: 7_500 }, { settingLevel: 6, basisPoints: 2_500 }]))).toBeCloseTo(0.75 * 0.97 + 0.25 * 1.12, 12)
  })

  test("shares of levels the formula lacks are left out, and the rest weighed among themselves", () => {
    expect(priorPayoutRateOf(FIGURES, spread([{ settingLevel: 2, basisPoints: 5_000 }, { settingLevel: 4, basisPoints: 5_000 }]))).toBeCloseTo(0.99, 12)
  })

  test("an even spread weighs every level of the formula alike", () => {
    expect(priorPayoutRateOf(FIGURES, { type: "even" })).toBeCloseTo((0.97 + 0.99 + 1.12) / 3, 12)
  })

  test("none where nothing is shared among the formula's levels", () => {
    expect(priorPayoutRateOf(FIGURES, spread([{ settingLevel: 4, basisPoints: 10_000 }]))).toBeUndefined()
    expect(priorPayoutRateOf(FIGURES, spread([]))).toBeUndefined()
  })
})
