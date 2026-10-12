import { describe, expect, test } from "bun:test"

import type { AnalysisDto, SpecDto } from "@p-lens/contracts/pachislot"
import expected from "@p-lens/contracts/fixtures/pachislot/made-up/expected.json"
import normalized from "@p-lens/contracts/fixtures/pachislot/made-up/normalized.json"
import spec from "@p-lens/contracts/fixtures/pachislot/made-up/spec.json"

import { figuresFromAnalysis } from "../../../src/core/pachislot/figures"
import { readSettingLevels } from "../../../src/core/pachislot/setting-level-reading"

const analysis = { engineVersion: 1, schemaVersion: 1, normalized, settingLevels: expected.settingLevels.map((each) => ({ ...each, derivation: [] })) } as AnalysisDto

describe("a pachislot formula's figures", () => {
  test("are each setting level's 機械割 and bonus odds, labelled by the spec", () => {
    const [low, high] = figuresFromAnalysis(analysis, spec as SpecDto)
    expect(low?.payoutRate).toBeCloseTo(0.98033, 5)
    expect(low?.bonuses).toEqual([
      { id: "big", label: "BIG", oneIn: 250 },
      { id: "reg", label: "REG", oneIn: 400 },
    ])
    expect(high?.combinedOneIn).toBeCloseTo(1 / 0.009, 9)
  })
})

describe("reading a posterior over setting levels", () => {
  const posterior = [
    { settingLevel: 1, probability: 0.6 },
    { settingLevel: 2, probability: 0.3 },
    { settingLevel: 6, probability: 0.1 },
  ]

  test("weighs the setting levels into an average one, as players read it", () => {
    expect(readSettingLevels(posterior).averageSettingLevel).toBeCloseTo(1.8, 12)
  })

  test("sums the chance of a high setting level from the threshold up", () => {
    expect(readSettingLevels(posterior).highShare).toBeCloseTo(0.1, 12)
    expect(readSettingLevels(posterior, 2).highShare).toBeCloseTo(0.4, 12)
  })

  test("names the most likely setting level, the higher on a tie", () => {
    expect(readSettingLevels(posterior).mostLikely).toBe(1)
    expect(readSettingLevels([{ settingLevel: 5, probability: 0.5 }, { settingLevel: 6, probability: 0.5 }]).mostLikely).toBe(5)
    expect(readSettingLevels([1, 2, 3, 4, 5, 6].map((settingLevel) => ({ settingLevel, probability: 1 / 6 }))).mostLikely).toBe(3)
    expect(readSettingLevels([1, 2, 5, 6].map((settingLevel) => ({ settingLevel, probability: 0.25 }))).mostLikely).toBe(2)
    expect(readSettingLevels([{ settingLevel: 1, probability: 0.2 }, { settingLevel: 4, probability: 0.3 }, { settingLevel: 5, probability: 0.2 }, { settingLevel: 6, probability: 0.3 }]).mostLikely).toBe(4)
    expect(readSettingLevels([]).mostLikely).toBeUndefined()
  })
})
