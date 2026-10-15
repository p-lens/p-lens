import { describe, expect, test } from "bun:test"
import type { EventDto, SettingLevelFiguresDto, SpecDto } from "@p-lens/contracts/pachislot"

import type { Basis } from "../../../src/core/pachislot/formula"
import { plainOf, type GroundsPart } from "../../../src/ui/wording/pachislot/grounds"
import {
  chanceParts,
  contributionParts,
  expectedPerGameParts,
  gainParts,
  headerParts,
  leadParts,
  outcomeGain,
  rateFromContributionsParts,
  rateSourceOf,
  roundingNoteParts,
} from "../../../src/ui/wording/pachislot/grounds-sheet"

const figuresIn = (parts: readonly GroundsPart[]): readonly string[] => parts.filter((part) => part.type === "figure").map((part) => part.text)

const SPEC: SpecDto = { v: 1, entities: ["at"], components: { at: ["at"], netPerGame: { at: 4 } }, resources: { settingLevels: [1, 6], bet: 3, base: 40 } }

const basisOf = (spec: SpecDto, measured: boolean): Basis => ({
  spec,
  conditions: { payoutRate: measured ? { type: "measured", bySettingLevel: [{ settingLevel: 1, value: 9750 }] } : { type: "from-spec" } },
  normalized: { schemaVersion: 1, bet: 3, tables: [], atRules: { base: 40, at: "at", modes: [{ id: "at" }], netPerGame: 4 } },
  engineSchemaVersion: 1,
})

const LEVEL_1: SettingLevelFiguresDto = { settingLevel: 1, netPerGame: -0.075, payoutRate: 0.975, bonuses: [], combined: 0.002, derivation: [], at: { gain: 576.7, completion: 0 } }

describe("a pachislot formula's 計算根拠 sheet", () => {
  test("the head gives the 機械割 to two places of a percent and the medals a game comes to", () => {
    const parts = headerParts(1.05533, 0.16599)
    expect(plainOf(parts)).toBe("機械割 105.53%　1Gあたりの期待差枚 +0.1660枚")
    expect(figuresIn(parts)).toEqual(["105.53%", "+0.1660枚"])
  })

  test("the medals a game comes to are worked from the 機械割 with every number put in", () => {
    const parts = expectedPerGameParts(3, 1.0553, 0.1659)
    expect(plainOf(parts)).toBe("1Gあたりの期待差枚 ＝ 3枚 ×（機械割 1.0553 − 1）＝ 3 × 0.0553 ＝ +0.1659枚")
    expect(figuresIn(parts)).toEqual(["3枚", "1.0553", "3", "0.0553", "+0.1659枚"])
    expect(parts.filter((part) => part.type === "words").map((part) => part.text)).toContain(" ×（機械割 ")
  })

  test("a 機械割 below one is worked with its shortfall bracketed, to no more places than it has", () => {
    expect(plainOf(expectedPerGameParts(3, 0.975, -0.075))).toBe("1Gあたりの期待差枚 ＝ 3枚 ×（機械割 0.975 − 1）＝ 3 ×（−0.025）＝ −0.0750枚")
  })

  test("the medals a game comes to are nearly so where the rounded 機械割 does not give them", () => {
    expect(plainOf(expectedPerGameParts(3, 1.05533, 0.16599))).toBe("1Gあたりの期待差枚 ＝ 3枚 ×（機械割 1.0553 − 1）＝ 3 × 0.0553 ≈ +0.1660枚")
  })

  test("the 機械割 is worked from the outcomes' medals with every number put in", () => {
    const parts = rateFromContributionsParts(0.1659, 3, 1.0553)
    expect(plainOf(parts)).toBe("機械割 ＝ 1 ＋ 期待差枚 0.1659枚 ÷ 3枚 ＝ 1 ＋ 0.0553 ＝ 1.0553（105.53%）")
    expect(figuresIn(parts)).toEqual(["0.1659枚", "3枚", "0.0553", "1.0553", "105.53%"])
    expect(plainOf(rateFromContributionsParts(-0.075, 3, 0.975))).toBe("機械割 ＝ 1 ＋ 期待差枚 −0.0750枚 ÷ 3枚 ＝ 1 ＋（−0.025）＝ 0.975（97.5%）")
  })

  test("the 機械割 is rounded once, so that its ratio and its percent read alike on a half", () => {
    expect(plainOf(headerParts(1.07345, 0.22035))).toBe("機械割 107.35%　1Gあたりの期待差枚 +0.2204枚")
    expect(plainOf(rateFromContributionsParts(0.22035, 3, 1.07345))).toBe("機械割 ＝ 1 ＋ 期待差枚 0.2204枚 ÷ 3枚 ＝ 1 ＋ 0.0735 ＝ 1.0735（107.35%）")
  })

  test("each step of a 機械割 from its outcomes is worked from the figure shown before it", () => {
    expect(plainOf(rateFromContributionsParts(0.11895, 3, 1 + 0.11895 / 3))).toBe("機械割 ＝ 1 ＋ 期待差枚 0.1190枚 ÷ 3枚 ＝ 1 ＋ 0.0397 ＝ 1.0397（103.97%）")
  })

  test("an outcome's share is nearly so only where its chance and medals as shown do not give it", () => {
    expect(plainOf(contributionParts(1 / 7.49, 5, 5 / 7.49))).toBe("+0.6676枚")
    expect(plainOf(contributionParts(1 / 1.8797, -3, -3 / 1.8797))).toBe("−1.5960枚")
    expect(plainOf(contributionParts(1 / 1.88, -3, -1.596))).toBe("≈ −1.5960枚")
    expect(plainOf(contributionParts(0, 5, 0))).toBe("≈ +0.0000枚")
  })

  test("an outcome's chance reads to five significant figures and its medals with their sign", () => {
    expect(plainOf(chanceParts(1 / 7.49))).toBe("1/7.4900")
    expect(plainOf(chanceParts(1 / 312.45))).toBe("1/312.45")
    expect(plainOf(chanceParts(0))).toBe("--")
    expect([5, 0, -3, Number.NaN].map((gain) => plainOf(gainParts(gain)))).toEqual(["+5枚", "0枚", "−3枚", "--"])
  })

  test("an outcome gains its payout less the bet, nothing as a replay, and loses the bet where it pays nothing", () => {
    const events: readonly EventDto[] = [
      { id: "bell", kind: { type: "role", payout: 8 }, chance: 0.1 },
      { id: "replay", kind: { type: "replay" }, chance: 0.1 },
      { id: "big", kind: { type: "bonus", payout: 252 }, chance: 0.003 },
      { id: "measured", kind: { type: "bonus" }, chance: 0.003 },
    ]
    expect(["bell", "replay", "big", undefined].map((id) => outcomeGain(id, events, 3))).toEqual([5, 0, 249, -3])
    expect(outcomeGain("measured", events, 3)).toBeNaN()
    expect(outcomeGain("unknown", events, 3)).toBeNaN()
  })

  test("the shares are said to be rounded only where those shown do not add up to the total", () => {
    expect(roundingNoteParts([0.66754, -1.59601], -0.92847)).toEqual([])
    expect(plainOf(roundingNoteParts([0.00004, 0.00004, 0.00004], 0.00012))).toBe("各寄与は小数4桁に丸めています。")
  })

  test("a 機械割 no table traces says where it comes from", () => {
    const stated: SpecDto = { ...SPEC, components: { ...SPEC.components, rate: { at: [{ settingLevel: 1, value: 9750 }] } } }
    expect(rateSourceOf(basisOf(SPEC, true), LEVEL_1)).toEqual({ type: "measured" })
    expect(rateSourceOf(basisOf(stated, false), LEVEL_1)).toEqual({ type: "stated", gain: 576.7, net: 4 })
    expect(rateSourceOf(basisOf(SPEC, false), LEVEL_1)).toEqual({ type: "gained", gain: 576.7, net: 4 })
    expect(plainOf(leadParts({ type: "measured" }))).toBe("機械割は入力された値です。")
    expect(plainOf(leadParts({ type: "stated", gain: 576.66, net: 4 }))).toBe("機械割は解析値のとおりで、ATの平均獲得枚数 576.7枚 は、それと純増 4枚/G から導いた値です（下の計算根拠）。")
    const gained = leadParts({ type: "gained", gain: 600, net: 3.2 })
    expect(plainOf(gained)).toBe("機械割は、ATの平均獲得枚数 600枚 と純増 3.2枚/G から導いた値です（下の計算根拠）。")
    expect(figuresIn(gained)).toEqual(["600枚", "3.2枚/G"])
  })
})
