import { describe, expect, test } from "bun:test"

import type { NormalizedSpecDto, SpecDto } from "@p-lens/contracts/pachislot"
import czSpec from "@p-lens/contracts/fixtures/pachislot/made-up-cz/spec.json"
import normalized from "@p-lens/contracts/fixtures/pachislot/made-up/normalized.json"

import { inferSettingLevels } from "../../../src/application/pachislot/setting-inference"
import type { MachineId } from "../../../src/core/machine/machine"
import type { FormulaId } from "../../../src/core/pachislot/formula"
import type { FormulaSnapshot } from "../../../src/core/pachislot/snapshot"
import { MEDAL_TERMS_BY_DEFAULT } from "../../../src/core/pachislot/told"
import { inProcessEngine } from "../../support/pachislot/engine"

const formula: FormulaSnapshot = {
  id: "f" as FormulaId,
  machineId: "m" as MachineId,
  kind: "simulated",
  figures: [],
  normalized: normalized as NormalizedSpecDto,
  conditions: { payoutRate: { type: "from-spec" } },
  labels: {},
}

const bonusId = (normalized as NormalizedSpecDto).tables.at(0)?.events.find((event) => event.kind.type === "bonus")?.id ?? ""

describe("reading a told pachislot play's setting level by Bayes", () => {
  test("from an even prior, by the counter's games and bonuses, and weighs the games its hours come to", async () => {
    const few = await inferSettingLevels(inProcessEngine, formula, { type: "counter", told: { games: 3000, bonuses: { [bonusId]: 1 }, hours: 4, outlay: 20_000 } }, MEDAL_TERMS_BY_DEFAULT)
    const many = await inferSettingLevels(inProcessEngine, formula, { type: "counter", told: { games: 3000, bonuses: { [bonusId]: 40 }, hours: 4, outlay: 20_000 } }, MEDAL_TERMS_BY_DEFAULT)
    if (!few.ok || !many.ok) throw new Error(JSON.stringify([few, many]))
    const sum = (weights: readonly { readonly probability: number }[]) => weights.reduce((total, weight) => total + weight.probability, 0)
    expect(sum(few.value.settingLevels)).toBeCloseTo(1, 9)
    expect(few.value.formulaId).toBe("f")
    expect(few.value.settingLevels.map((weight) => weight.probability)).not.toEqual(many.value.settingLevels.map((weight) => weight.probability))
    expect(Number.isFinite(few.value.theoreticalValue)).toBe(true)
  })

  test("takes the bonuses as the data counter shows them, a REG told apart by its parts counted as the one REG", async () => {
    const found = await inferSettingLevels(inProcessEngine, formula, { type: "counter", told: { games: 4000, bonuses: { big: 20, reg: 12 }, hours: 5, outlay: 10_000 } }, MEDAL_TERMS_BY_DEFAULT)
    expect(found.ok && found.value.settingLevels.length).toBe(2)
  })

  test("at an AT machine, from its history: ATs that come early read higher, and the games walked along it are weighed", async () => {
    const conditions = {
      payoutRate: {
        type: "measured" as const,
        bySettingLevel: [
          { settingLevel: 1, value: 9_700 },
          { settingLevel: 6, value: 11_000 },
        ],
      },
    }
    const analysed = await inProcessEngine.call("analyze", { source: { type: "spec", spec: czSpec as SpecDto }, conditions })
    if (!analysed.ok) throw new Error(JSON.stringify(analysed.error))
    const machine: FormulaSnapshot = { ...formula, normalized: analysed.value.normalized, conditions }
    const history = (games: number, misses: number | undefined) => ({
      type: "history" as const,
      told: { sinceAt: 100, afterReset: false, ats: [{ games, misses }, { games, misses }], since: 150, outlay: 15_000 },
    })
    const early = await inferSettingLevels(inProcessEngine, machine, history(120, undefined), MEDAL_TERMS_BY_DEFAULT)
    const late = await inferSettingLevels(inProcessEngine, machine, history(900, undefined), MEDAL_TERMS_BY_DEFAULT)
    const counted = await inferSettingLevels(inProcessEngine, machine, history(120, 0), MEDAL_TERMS_BY_DEFAULT)
    if (!early.ok || !late.ok || !counted.ok) throw new Error(JSON.stringify([early, late, counted]))
    const high = (found: typeof early) => (found.ok ? (found.value.settingLevels.at(-1)?.probability ?? 0) : 0)
    expect(high(early)).toBeGreaterThan(high(late))
    expect(counted.value.settingLevels).not.toEqual(early.value.settingLevels)
    expect(Number.isFinite(early.value.theoreticalValue)).toBe(true)
  })
})
