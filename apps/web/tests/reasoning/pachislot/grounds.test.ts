import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"

import type { AnalysisDto, Envelope, SpecDto } from "@p-lens/contracts/pachislot"
import atSpec from "@p-lens/contracts/fixtures/pachislot/made-up-at/spec.json"
import rateSpec from "@p-lens/contracts/fixtures/pachislot/made-up-rate/spec.json"
import { analyze, initSync } from "@p-lens/pachislot-engine/pachislot.js"
import { load, Prolog } from "trealla"

import type { Basis } from "../../../src/core/pachislot/formula"
import { groundsFacts, reasonsGrounds } from "../../../src/core/pachislot/grounds/facts"
import { checksIn, everyStep, proofOf, type Proof } from "../../../src/core/grounds/proof"
import { termOf } from "../../../src/core/grounds/term"
import { groundsLines } from "../../../src/ui/wording/pachislot/grounds"

const ENGINE = new URL("../../../../../packages/pachislot-engine/pachislot_bg.wasm", import.meta.url).pathname
const RULES = new URL("../../../src/reasoning/pachislot/grounds.pl", import.meta.url).pathname

initSync({ module: await readFile(ENGINE) })
await load()

const solved = (spec: SpecDto): { readonly basis: Basis; readonly analysis: AnalysisDto } => {
  const conditions = { payoutRate: { type: "from-spec" } } as const
  const reply = JSON.parse(analyze(JSON.stringify({ source: { type: "spec", spec }, conditions }))) as Envelope<AnalysisDto>
  if (!reply.ok) throw new Error(JSON.stringify(reply.error))
  return { basis: { spec, conditions, normalized: reply.value.normalized, engineSchemaVersion: reply.value.schemaVersion }, analysis: reply.value }
}

const proved = async (basis: Basis, analysis: AnalysisDto): Promise<Proof> => {
  const prolog = new Prolog()
  await prolog.consultText(await readFile(RULES, "utf8"))
  await prolog.consultText(groundsFacts(basis, analysis))
  const answer = await prolog.queryOnce("prove(grounds(Levels), Proof).", { format: "json" })
  if (answer.status !== "success") throw new Error(JSON.stringify(answer))
  const term = termOf((answer.answer as Record<string, unknown>)["Proof"])
  if (term === undefined) throw new Error("no proof")
  const proof = proofOf(term)
  if (!proof.ok) throw new Error(JSON.stringify(proof.error))
  return proof.value
}

/** The made-up AT machine with a 純増 of 4 medals a game beside its payout of 600. */
const withNet: SpecDto = { ...(atSpec as SpecDto), components: { ...(atSpec as SpecDto).components, netPerGame: { at: 4 } } }

describe("an AT machine's grounds, reasoned", () => {
  test("an AT's medals follow from the stated 機械割, and the 機械割 comes back from them", async () => {
    const { basis, analysis } = solved(rateSpec as SpecDto)
    const proof = await proved(basis, analysis)
    const lines = groundsLines(proof).map((line) => line.text)
    expect(lines).toContain("設定1")
    expect(lines).toContain("通常時1Gあたりの減り 1.25枚 ＝ 50枚 ÷ ベース 40G")
    expect(lines).toContain("ATの平均獲得枚数 576.7枚 ＝ 通常 500G ×（1G 3枚 ×（機械割 97.5% − 1）＋ 1Gの減り 1.25枚）÷（1 ＋ 3枚 ×（1 − 機械割 97.5%）÷ 純増 4枚）")
    expect(lines).toContain("検算：入力された機械割 110% に戻る")
    const checks = checksIn(proof)
    expect(checks).toHaveLength(6)
    expect(checks.every((check) => check.holds)).toBe(true)
  })

  test("a 機械割 is reasoned from an AT's own medals where its 純増 is given", async () => {
    const { basis, analysis } = solved(withNet)
    const proof = await proved(basis, analysis)
    expect(everyStep(proof).filter((step) => step.rule === "gain_solved")).toHaveLength(4)
    const lines = groundsLines(proof).map((line) => line.text)
    expect(lines).toContain("ATの平均獲得枚数 600枚（解析値から計算エンジンが解いた値）")
    expect(lines).toContain("機械割 98.72% ＝ 払い出し 1925枚 ÷ 投入 1950枚（ATからATまで：通常 500G ＋ AT 150G、どちらも1G 3枚）")
    expect(checksIn(proof).every((check) => check.holds)).toBe(true)
    expect(checksIn(proof)).toHaveLength(4)
  })

  test("an AT with medals won at another 純増 is reasoned at its 純増 over all, checked against the engine's", async () => {
    const spec = rateSpec as SpecDto
    const shared: SpecDto = { ...spec, components: { ...spec.components, netPerGame: { at: 2 }, otherNet: { at: [{ net: 8, shareBasisPoints: 5000 }] } } }
    const single: SpecDto = { ...spec, components: { ...spec.components, netPerGame: { at: 3.2 } } }
    const { basis, analysis } = solved(shared)
    expect(analysis.settingLevels.map((figures) => figures.at?.gain)).toEqual(solved(single).analysis.settingLevels.map((figures) => figures.at?.gain))
    const proof = await proved(basis, analysis)
    const lines = groundsLines(proof).map((line) => line.text)
    expect(lines).toContain("AT全体の純増 3.2枚 ＝ 1 ÷（50% ÷ 2枚 ＋ 50% ÷ 8枚）（獲得枚数の割合ごとに、同じ枚数にかかるゲーム数を合わせる）")
    expect(lines).toContain("検算：計算エンジンのAT全体の純増 3.2枚 と一致")
    expect(lines.some((line) => line.endsWith("÷ 純増 3.2枚）"))).toBe(true)
    expect(checksIn(proof).every((check) => check.holds)).toBe(true)
  })

  test("a figure tampered with shows as a failed check", async () => {
    const { basis, analysis } = solved(rateSpec as SpecDto)
    const tampered = { ...analysis, settingLevels: analysis.settingLevels.map((figures) => ({ ...figures, payoutRate: figures.payoutRate + 0.01 })) }
    const failed = checksIn(await proved(basis, tampered)).filter((check) => !check.holds)
    expect(failed.map((check) => check.rule)).toEqual(["check_engine", "check_engine"])
  })

  test("a machine without its 純増 has nothing to reason", () => {
    const measured = { payoutRate: { type: "measured", bySettingLevel: [{ settingLevel: 1, value: 9700 }, { settingLevel: 6, value: 11000 }] } } as const
    const reply = JSON.parse(analyze(JSON.stringify({ source: { type: "spec", spec: atSpec }, conditions: measured }))) as Envelope<AnalysisDto>
    if (!reply.ok) throw new Error(JSON.stringify(reply.error))
    const basis: Basis = { spec: atSpec as SpecDto, conditions: measured, normalized: reply.value.normalized, engineSchemaVersion: reply.value.schemaVersion }
    expect(reasonsGrounds(basis)).toBe(false)
    expect(groundsFacts(basis, reply.value)).toBe("")
  })
})
