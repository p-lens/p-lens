import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"

import type { AnalysisDto, Envelope, SpecDto } from "@p-lens/contracts/pachinko"
import { analyze, initSync } from "@p-lens/pachinko-engine/pachinko.js"
import { load, Prolog } from "trealla"

import type { Basis } from "../../../src/core/pachinko/formula"
import { groundsFacts, type SampledFigure } from "../../../src/core/pachinko/grounds/facts"
import { checksIn, everyStep, proofOf, type Proof } from "../../../src/core/grounds/proof"
import { termOf } from "../../../src/core/grounds/term"
import { readBasisForm, STARTING_BASIS } from "../../../src/ui/features/pachinko/formulas/formula-form"
import { groundsLines } from "../../../src/ui/wording/pachinko/grounds"

const ENGINE = new URL("../../../../../packages/pachinko-engine/pachinko_bg.wasm", import.meta.url).pathname
const RULES = new URL("../../../src/reasoning/pachinko/grounds.pl", import.meta.url).pathname

initSync({ module: await readFile(ENGINE) })
await load()

const solved = (spec: SpecDto): { readonly basis: Basis; readonly analysis: AnalysisDto } => {
  const conditions = { roundPayout: { type: "from-spec" } } as const
  const reply = JSON.parse(analyze(JSON.stringify({ source: { type: "spec", spec }, conditions }))) as Envelope<AnalysisDto>
  if (!reply.ok) throw new Error(JSON.stringify(reply.error))
  return { basis: { spec, conditions, normalized: reply.value.normalized, engineSchemaVersion: reply.value.schemaVersion }, analysis: reply.value }
}

const specOf = (form: typeof STARTING_BASIS): SpecDto => {
  const read = readBasisForm(form)
  if (!read.ok) throw new Error(JSON.stringify(read.error))
  return read.value.spec
}

const reasoned = async (spec: SpecDto, sampled?: SampledFigure): Promise<{ readonly proof: Proof; readonly analysis: AnalysisDto; readonly basis: Basis }> => {
  const { basis, analysis } = solved(spec)
  const prolog = new Prolog()
  await prolog.consultText(await readFile(RULES, "utf8"))
  await prolog.consultText(groundsFacts(basis, analysis, sampled))
  const answer = await prolog.queryOnce("prove(grounds(OneIn, Balls), Proof).", { format: "json" })
  if (answer.status !== "success") throw new Error(JSON.stringify(answer))
  const term = termOf((answer.answer as Record<string, unknown>)["Proof"])
  if (term === undefined) throw new Error("no proof")
  const proof = proofOf(term)
  if (!proof.ok) throw new Error(JSON.stringify(proof.error))
  return { proof: proof.value, analysis, basis }
}

const claimed = (proof: Proof, rule: string): number | undefined => {
  const step = everyStep(proof).find((candidate) => candidate.rule === rule)
  const value = step?.claim.args[0]
  return typeof value === "number" ? value : undefined
}

describe("a formula's grounds, reasoned", () => {
  test("read as lines from the figure down to each share, with the checks marked", async () => {
    const { proof, basis } = await reasoned(specOf(STARTING_BASIS))
    const lines = groundsLines(proof, basis.normalized, new Map([["m1", "RUSH"]]))
    expect(lines.map((line) => line.text)).toContain("1Rトータル確率 1/13.9 ＝ 通常時の大当り確率 1/319.7 ÷ 初当り1回あたりの平均ラウンド 23R")
    expect(lines.map((line) => line.text)).toContain("50.0%・3R・RUSH：（3R ＋ その後 40R）× 50.0% ＝ 21.5R")
    expect(lines.filter((line) => line.tone === "holds")).toHaveLength(2)
    expect(lines[0]?.depth).toBe(0)
  })

  test("reach the engine's 1R chance from the spec sheet, and say so", async () => {
    const { proof, analysis } = await reasoned(specOf(STARTING_BASIS))
    expect(claimed(proof, "round_chance")).toBeCloseTo(analysis.roundChanceOneIn, 9)
    expect(claimed(proof, "rounds_per_first_hit")).toBeCloseTo(analysis.averageRounds, 9)
    expect(everyStep(proof).filter((step) => step.rule === "allotted")).toHaveLength(2)
    expect(checksIn(proof).map((check) => [check.rule, check.holds])).toEqual([
      ["check_engine", true],
      ["check_engine", true],
    ])
  })

  test("cut a cycle at the 遊タイム when the machine has one", async () => {
    const reliefDriveMode = { ...STARTING_BASIS.modes[0]!, key: "m2", label: "遊タイム", kind: "rapid" as const, spins: "379" }
    const { proof, analysis } = await reasoned(specOf({ ...STARTING_BASIS, modes: [...STARTING_BASIS.modes, reliefDriveMode], reliefDriveGauge: "950", reliefDriveTo: "m2" }))
    expect(everyStep(proof).filter((step) => step.rule === "weighted_cycle").length).toBeGreaterThanOrEqual(2)
    expect(everyStep(proof).find((step) => step.rule === "cycle_spent")).toBeDefined()
    expect(claimed(proof, "round_chance_with_relief_drive")).toBeCloseTo(analysis.roundChanceOneIn, 9)
    expect(checksIn(proof).every((check) => check.holds)).toBe(true)
  })

  test("check a sampled formula's stored estimate against the exact figure, and show it when it is off", async () => {
    const exact = solved(specOf(STARTING_BASIS)).analysis.roundChanceOneIn
    const near = await reasoned(specOf(STARTING_BASIS), { oneIn: exact + 0.01, margin: 0.02 })
    expect(checksIn(near.proof).map((check) => [check.rule, check.holds])).toContainEqual(["check_sample", true])
    const tampered = await reasoned(specOf(STARTING_BASIS), { oneIn: exact + 1, margin: 0.02 })
    expect(checksIn(tampered.proof).map((check) => [check.rule, check.holds])).toContainEqual(["check_sample", false])
  })

  test("a machine whose shares pay each their own comes to one payout a round, every round's gain over every round, and checks", async () => {
    const twoAttackers = { ...STARTING_BASIS, regularOneIn: "100", firstHit: [{ share: "50", rounds: "4", next: "m1", prize: "10", count: "", others: [] }, { share: "50", rounds: "4", next: "regular", prize: "10", count: "", others: [] }] }
    const { proof, analysis, basis } = await reasoned(specOf(twoAttackers))
    const rounds = 4 + 0.5 * 40
    const balls = 4 * 90 + 0.5 * 40 * 140
    expect(analysis.ballsPerRound).toBeCloseTo(balls / rounds, 9)
    expect(claimed(proof, "payout_by_share")).toBeCloseTo(balls / rounds, 9)
    expect(claimed(proof, "balls_per_first_hit")).toBeCloseTo(balls, 9)
    expect(checksIn(proof).every((check) => check.holds)).toBe(true)
    const lines = groundsLines(proof, basis.normalized, new Map([["m1", "RUSH"]])).map((line) => line.text)
    expect(lines).toContain("50.0%・360玉・RUSH：（360玉 ＋ その後 5600玉）× 50.0% ＝ 2980玉")
    expect(lines.some((line) => line.startsWith("1R平均出玉 131.7玉 ＝ 出玉 3160玉 ÷ ラウンド 24R"))).toBe(true)
  })

  test("a jackpot through two attackers counts every round and gains each by its own attacker, and checks", async () => {
    const vRound = { share: "50", rounds: "1", prize: "1", count: "", others: [{ rounds: "3", prize: "", count: "" }] }
    const twoInOne = { ...STARTING_BASIS, regularOneIn: "100", firstHit: [{ ...vRound, next: "m1" }, { ...vRound, next: "regular" }] }
    const { proof, analysis } = await reasoned(specOf(twoInOne))
    const rounds = 4 + 0.5 * 40
    const balls = 3 * 140 + 0.5 * 40 * 140
    expect(analysis.roundChanceOneIn).toBeCloseTo(100 / rounds, 9)
    expect(claimed(proof, "payout_by_share")).toBeCloseTo(balls / rounds, 9)
    expect(claimed(proof, "balls_per_first_hit")).toBeCloseTo(balls, 9)
    expect(checksIn(proof).every((check) => check.holds)).toBe(true)
  })

})
