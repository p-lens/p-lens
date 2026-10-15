import { describe, expect, test } from "bun:test"

import type { SettingDistributionId } from "../../../src/core/pachislot/formula"
import {
  averageSettingLevelText,
  bonusTitle,
  EVEN_PRIOR_NAME,
  medalsPerGameText,
  observedOneInText,
  oddsText,
  payoutRateText,
  priorName,
  shareText,
} from "../../../src/ui/wording/pachislot/formula"

describe("pachislot wording", () => {
  test("a payout rate and a share read as percentages to one place", () => {
    expect(payoutRateText(1.055)).toBe("105.5%")
    expect(payoutRateText(0.98033)).toBe("98.0%")
    expect(shareText(0.3724)).toBe("37.2%")
  })

  test("odds read to one place, and to two below 1/10 so a 小役 is not rounded away", () => {
    expect(oddsText(273.14)).toBe("1/273.1")
    expect(oddsText(6.25)).toBe("1/6.25")
    expect(oddsText(Number.POSITIVE_INFINITY)).toBe("--")
  })

  test("an average setting level reads to two places", () => {
    expect(averageSettingLevelText(3.2249)).toBe("設定3.22")
  })

  test("theoretical medals a game are always signed", () => {
    expect(medalsPerGameText(0.0704)).toBe("+0.070枚")
    expect(medalsPerGameText(-0.059)).toBe("-0.059枚")
  })

  test("a prior is named by its 設定配分, or as even", () => {
    expect(priorName({ type: "even" })).toBe(EVEN_PRIOR_NAME)
    expect(priorName({ type: "distribution", id: "d" as SettingDistributionId, label: "平日", shares: [] })).toBe("平日")
  })

  test("what came up reads as one in so many games, or not yet", () => {
    expect(observedOneInText(600, 101)).toBe("1/5.94")
    expect(observedOneInText(3000, 12)).toBe("1/250.0")
    expect(observedOneInText(300, 0)).toBe("1/--")
  })
})

describe("a bonus in a list of bonuses", () => {
  test("goes by its name, and until it has one by its place among the bonuses", () => {
    expect(bonusTitle(" BIG ", 1)).toBe("BIG")
    expect(bonusTitle("", 2)).toBe("ボーナス2")
  })
})
