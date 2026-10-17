import type { AnalysisDto, FormulaSettingLevelFiguresDto, NewFormulaDto, NormalizedSpecDto } from "@p-lens/contracts/pachislot"
import { analyze, normalize } from "@p-lens/pachislot-engine/pachislot.js"
import { describe, expect, test } from "bun:test"

import { api, device, pachislotFixture, realPachislotEngine } from "../support/harness"

const ALICE = device(1_759_000_000_001)

const CONDITIONS = { payoutRate: { type: "from-spec" } } as const

/** What a device makes of a spec, as much work as it takes: its normalised spec and its figures. */
const solvedOnDevice = async (fixture: string): Promise<{ readonly normalized: NormalizedSpecDto; readonly figures: readonly FormulaSettingLevelFiguresDto[] }> => {
  await realPachislotEngine()
  const spec = await pachislotFixture(fixture, "spec.json")
  const normalized = JSON.parse(normalize(JSON.stringify({ spec }))).value as NormalizedSpecDto
  const analysis = JSON.parse(analyze(JSON.stringify({ source: { type: "normalized", normalized }, conditions: CONDITIONS }))).value as AnalysisDto
  return {
    normalized,
    figures: analysis.settingLevels.map((solved) => ({
      settingLevel: solved.settingLevel,
      payoutRate: solved.payoutRate,
      bonuses: solved.bonuses.map((bonus) => ({ id: bonus.id, oneIn: 1 / bonus.chance })),
      combinedOneIn: 1 / solved.combined,
      ...(solved.at === undefined ? {} : { at: { gain: solved.at.gain, completion: solved.at.completion } }),
    })),
  }
}

const formulaOf = async (fixture: string, withNormalized: NormalizedSpecDto | undefined): Promise<NewFormulaDto> => {
  const solved = await solvedOnDevice(fixture)
  return {
    kind: "manual",
    figures: solved.figures,
    basis: { spec: await pachislotFixture(fixture, "spec.json"), conditions: CONDITIONS, ...(withNormalized === undefined ? {} : { normalized: withNormalized }) },
  }
}

const register = async (formula: NewFormulaDto) => {
  const client = await api()
  const made = await client.call("POST", "/machines", { as: ALICE, body: { gameKind: "pachislot", modelName: "型式H1", name: "重いテスト機", releasedOn: "2026-09-01", formula } })
  return { client, made }
}

describe("a formula too heavy to check", () => {
  test("is answered as too heavy, so that the device sends what it solved", async () => {
    const { made } = await register(await formulaOf("made-up-heavy", undefined))
    expect(made.status).toBe(422)
    expect(made.body.error).toEqual({ type: "basis-rejected", error: { type: "too-heavy" } })
  })

  test("sent again with what the device solved, is stored as that, unchecked", async () => {
    const solved = await solvedOnDevice("made-up-heavy")
    const { client, made } = await register(await formulaOf("made-up-heavy", solved.normalized))
    expect(made.status).toBe(201)
    const [formula] = (await client.call("GET", `/machines/${made.body.machineId}`)).body.formulas
    expect(formula.unchecked).toBe(true)
    expect(formula.basis.normalized).toEqual(solved.normalized)
  })

  test("a light formula sent with a normalised spec is checked all the same, and stores the API's own", async () => {
    const solved = await solvedOnDevice("made-up-rate")
    const forged = { ...solved.normalized, bet: solved.normalized.bet + 1 }
    const { client, made } = await register(await formulaOf("made-up-rate", forged))
    expect(made.status).toBe(201)
    const [formula] = (await client.call("GET", `/machines/${made.body.machineId}`)).body.formulas
    expect(formula.unchecked).toBeUndefined()
    expect(formula.basis.normalized).toEqual(solved.normalized)
  })
})
