import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"

import type { AnalysisDto, Envelope, SpecDto } from "@p-lens/contracts/pachislot"
import atSpec from "@p-lens/contracts/fixtures/pachislot/made-up-at/spec.json"
import capSpec from "@p-lens/contracts/fixtures/pachislot/made-up-cap/spec.json"
import czSpec from "@p-lens/contracts/fixtures/pachislot/made-up-cz/spec.json"
import modesSpec from "@p-lens/contracts/fixtures/pachislot/made-up-modes/spec.json"
import rateSpec from "@p-lens/contracts/fixtures/pachislot/made-up-rate/spec.json"
import { analyze, initSync } from "@p-lens/pachislot-engine/pachislot.js"
import { load, Prolog } from "trealla"

import { figuresFromAnalysis, type SettingLevelFigures } from "../../../src/core/pachislot/figures"
import type { Basis } from "../../../src/core/pachislot/formula"
import { groundsFacts, reasonsGrounds } from "../../../src/core/pachislot/grounds/facts"
import { everyStep, findingsIn, proofOf, type Proof } from "../../../src/core/grounds/proof"
import { termOf } from "../../../src/core/grounds/term"
import { groundsLines, groundsStanding } from "../../../src/ui/wording/pachislot/grounds"

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

/** A basis reasoned against what the engine solved of it, and against the figures a formula of it stores: the engine's own unless a test says otherwise. */
const proved = async (basis: Basis, analysis: AnalysisDto, figures: readonly SettingLevelFigures[] = figuresFromAnalysis(analysis, basis.spec)): Promise<Proof> => {
  const prolog = new Prolog()
  await prolog.consultText(await readFile(RULES, "utf8"))
  await prolog.consultText(groundsFacts(basis, analysis, figures, undefined))
  const answer = await prolog.queryOnce("prove(grounds, Proof).", { format: "json" })
  if (answer.status !== "success") throw new Error(JSON.stringify(answer))
  const term = termOf((answer.answer as Record<string, unknown>)["Proof"])
  if (term === undefined) throw new Error("no proof")
  const proof = proofOf(term)
  if (!proof.ok) throw new Error(JSON.stringify(proof.error))
  return proof.value
}

/** What a proof found that did not simply hold, as the rule and how it stands. */
const amiss = (proof: Proof): readonly (readonly [string | undefined, string])[] =>
  findingsIn(proof).filter((finding) => finding.standing !== "holds").map((finding) => [finding.rule, finding.standing] as const)

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
    expect(lines).toContain("1周期の通常ゲーム数 500G ＝ 1 ÷ 初当たり 1/500")
    expect(lines).toContain("検算：計算エンジンが逆算したトリガー確率を戻すと、解析値の初当たり 1/500 になる")
    expect(findingsIn(proof).filter((finding) => finding.standing === "holds")).toHaveLength(12)
    expect(amiss(proof)).toEqual([])
    expect(groundsStanding(proof).tone).toBe("holds")
  })

  test("a 機械割 is reasoned from an AT's own medals where its 純増 is given", async () => {
    const { basis, analysis } = solved(withNet)
    const proof = await proved(basis, analysis)
    expect(everyStep(proof).filter((step) => step.rule === "gain_fixed").length).toBeGreaterThanOrEqual(2)
    const lines = groundsLines(proof).map((line) => line.text)
    expect(lines).toContain("ATの平均獲得枚数 600枚（解析値のまま）")
    expect(lines).toContain("検算：計算エンジンの平均獲得枚数 600枚 と一致")
    expect(lines).toContain("機械割 98.72% ＝ 払い出し 1925枚 ÷ 投入 1950枚（ATからATまで：通常 500G ＋ AT 150G、どちらも1G 3枚）")
    expect(findingsIn(proof).filter((finding) => finding.standing === "holds")).toHaveLength(10)
    expect(amiss(proof)).toEqual([])
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
    expect(amiss(proof)).toEqual([])
  })

  test("a figure tampered with shows as a failed check", async () => {
    const { basis, analysis } = solved(rateSpec as SpecDto)
    const tampered = { ...analysis, settingLevels: analysis.settingLevels.map((figures) => ({ ...figures, payoutRate: figures.payoutRate + 0.01 })) }
    const proof = await proved(basis, tampered, figuresFromAnalysis(analysis, basis.spec))
    expect(amiss(proof).filter(([, standing]) => standing === "fails")).toEqual([
      ["check_engine", "fails"],
      ["check_engine", "fails"],
    ])
    expect(groundsStanding(proof).tone).toBe("fails")
  })

  test("a stored 機械割 that is not what the basis comes to is shown as one", async () => {
    const { basis, analysis } = solved(rateSpec as SpecDto)
    const stored = figuresFromAnalysis(analysis, basis.spec).map((figures) => ({ ...figures, payoutRate: figures.payoutRate + 0.02 }))
    const proof = await proved(basis, analysis, stored)
    expect(amiss(proof).filter(([, standing]) => standing === "fails")).toEqual([
      ["check_stored", "fails"],
      ["check_stored", "fails"],
    ])
    expect(groundsLines(proof).map((line) => line.text)).toContain("検算：保存されている機械割 99.5% と食い違っています。古い計算エンジンで作られたか、数字が書き換えられています")
  })

  test("a setting level that cannot be proved is said so beside the ones that can", async () => {
    const { basis, analysis } = solved(rateSpec as SpecDto)
    const figures = figuresFromAnalysis(analysis, basis.spec)
    const proof = await proved(basis, analysis, figures.slice(1))
    expect(amiss(proof)).toContainEqual([undefined, "unproved"])
    const lines = groundsLines(proof).map((line) => line.text)
    expect(lines).toContain("設定1の機械割を、解析値から導けませんでした")
    expect(lines).toContain("検算：入力された機械割 110% に戻る")
  })

  test("a cycle a CZ brings is the CZs it takes over the CZ's published 初当たり, within a スルー天井 or without one", async () => {
    const cz = czSpec as SpecDto
    const { ceiling, misses, ...rest } = cz.components
    const within: SpecDto = { ...cz, components: { ...rest, ceiling: { cz: 600 }, ...(misses === undefined ? {} : { misses }), netPerGame: { at: 4 } } }
    const sound = solved(within)
    const proof = await proved(sound.basis, sound.analysis)
    expect(amiss(proof)).toEqual([])
    const lines = groundsLines(proof).map((line) => line.text)
    expect(lines).toContain("ATまでのCZ 2.533回 ＝（1 −（1 − CZ成功率 30%）の 4乗）÷ CZ成功率 30%（3回スルーで次は当選）")
    expect(lines).toContain("1周期の通常ゲーム数 380G ＝ ATまでのCZ 2.533回 ÷ CZの初当たり 1/150")
    expect(lines).toContain("検算：計算エンジンの1周期の通常ゲーム数 379.9G と一致")

    const without = solved({ ...cz, components: { ...rest, ceiling: { cz: 600 }, netPerGame: { at: 4 } } })
    const free = await proved(without.basis, without.analysis)
    expect(amiss(free)).toEqual([])
    expect(groundsLines(free).map((line) => line.text)).toContain("ATまでのCZ 3.333回 ＝ 1 ÷ CZ成功率 30%")
    expect(ceiling?.["at"]).toBe(1000)
  })

  test("a cycle an AT間天井 cuts short is played out game by game, and comes to the engine's", async () => {
    const cz = czSpec as SpecDto
    const cut = solved({ ...cz, components: { ...cz.components, netPerGame: { at: 4 } } })
    const proof = await proved(cut.basis, cut.analysis)
    expect(amiss(proof)).toEqual([])
    expect(findingsIn(proof).filter((finding) => finding.rule === "check_chance").map((finding) => finding.standing)).toEqual(["holds", "holds"])
    expect(everyStep(proof).filter((step) => step.rule === "cycle_cut").length).toBeGreaterThanOrEqual(2)

    const { misses, ...rest } = cz.components
    const unbounded = solved({ ...cz, components: { ...rest, netPerGame: { at: 4 } } })
    expect(amiss(await proved(unbounded.basis, unbounded.analysis))).toEqual([])
    expect(misses?.["cz"]).toBe(3)

    const wrong = { ...cut.basis, normalized: { ...cut.basis.normalized, tables: cut.basis.normalized.tables.map((table) => (table.at === undefined ? table : { ...table, at: { ...table.at, chance: table.at.chance * 1.01 } })) } }
    expect(amiss(await proved(wrong, cut.analysis)).map(([rule]) => rule)).toContain("check_chance")
  })

  test("an AT's medals under a cap are averaged over what each AT starts from, and come to the engine's", async () => {
    const cap = capSpec as SpecDto
    const capped = solved({ ...cap, components: { ...cap.components, netPerGame: { at: 4 } } })
    const proof = await proved(capped.basis, capped.analysis)
    expect(amiss(proof)).toEqual([])
    expect(findingsIn(proof).filter((finding) => JSON.stringify(finding.claim).includes("completion")).map((finding) => finding.standing)).toEqual(["holds", "holds"])

    const { window, resetOnCap, ...rest } = cap.components
    const alone = solved({ ...cap, components: { ...rest, netPerGame: { at: 4 } } })
    expect(amiss(await proved(alone.basis, alone.analysis))).toEqual([])
    expect([window?.["at"], resetOnCap]).toEqual([32, ["at"]])

    const lines = groundsLines(proof).map((line) => line.text)
    expect(lines).toContain("検算：計算エンジンの上限到達率 1.21% と一致")
    expect(lines.some((line) => line.startsWith("ATの平均獲得枚数 694.9枚（有利区間の上限あり"))).toBe(true)

    const bent = { ...capped.analysis, settingLevels: capped.analysis.settingLevels.map((level) => (level.at === undefined ? level : { ...level, at: { ...level.at, gain: level.at.gain + 1 } })) }
    expect(amiss(await proved(capped.basis, bent)).map(([rule, standing]) => [rule, standing])).toContainEqual(["check_engine", "fails"])
  })

  test("an AT that gains less than a window's games can lose is not worked upward: the engine's figure is taken and said to be unchecked", async () => {
    const cap = capSpec as SpecDto
    const { sets, continuationRate, ...rest } = cap.components
    const slight = solved({ ...cap, components: { ...rest, payout: { at: 20 }, netPerGame: { at: 4 } } })
    expect(amiss(await proved(slight.basis, slight.analysis))).toEqual([["unverified_capped_gain", "unverified"]])
    expect([sets?.["at"]?.first, continuationRate?.["at"]?.length]).toEqual([300, 2])
  })

  test("a machine as large as a real one is reasoned in the time a screen can wait", async () => {
    const cz = czSpec as SpecDto
    const levels = [1, 2, 3, 4, 5, 6]
    const each = <T,>(value: (level: number) => T) => levels.map((settingLevel) => ({ settingLevel, value: value(settingLevel) }))
    const large: SpecDto = {
      ...cz,
      components: {
        label: cz.components.label ?? {},
        at: ["at"],
        cz: ["cz"],
        firstHit: { cz: each((level) => ({ type: "ratio" as const, numerator: 1, denominatorHundredths: 26000 - level * 1000 })) },
        success: { cz: each((level) => 2500 + level * 200) },
        ceiling: { cz: 800, at: 1500 },
        misses: { cz: 5 },
        sets: { at: { first: 250, set: 80 } },
        continuationRate: { at: each((level) => 7800 + level * 100) },
        window: { at: 100 },
        resetOnCap: ["at"],
        netPerGame: { at: 4 },
      },
      resources: { settingLevels: levels, bet: 3, base: 35, cap: 2400 },
    }
    const { basis, analysis } = solved(large)
    const started = performance.now()
    const proof = await proved(basis, analysis)
    expect(amiss(proof)).toEqual([])
    expect(performance.now() - started).toBeLessThan(10_000)
  })

  test("an AT's medals in sets, without a cap, are the first set and each further one at the 継続率", async () => {
    const cap = capSpec as SpecDto
    const { window, resetOnCap, ...rest } = cap.components
    const { cap: limit, ...resources } = cap.resources
    const { basis, analysis } = solved({ ...cap, components: { ...rest, netPerGame: { at: 4 } }, resources })
    const proof = await proved(basis, analysis)
    expect(amiss(proof)).toEqual([])
    expect(groundsLines(proof).map((line) => line.text)).toContain("ATの平均獲得枚数 700枚 ＝ 初回 300枚 ＋ 1セット 100枚 × 継続率 80% ÷（1 − 継続率 80%）")
    expect([window?.["at"], resetOnCap, limit]).toEqual([32, ["at"], 2400])
  })

  test("a machine of modes is reasoned by its published 初当たり, whatever its modes' ceilings", async () => {
    const modes = modesSpec as SpecDto
    const { basis, analysis } = solved({ ...modes, components: { ...modes.components, netPerGame: { at: 4 } } })
    expect(amiss(await proved(basis, analysis))).toEqual([])
  })

  test("a machine without its 純増 has nothing to reason", () => {
    const measured = { payoutRate: { type: "measured", bySettingLevel: [{ settingLevel: 1, value: 9700 }, { settingLevel: 6, value: 11000 }] } } as const
    const reply = JSON.parse(analyze(JSON.stringify({ source: { type: "spec", spec: atSpec }, conditions: measured }))) as Envelope<AnalysisDto>
    if (!reply.ok) throw new Error(JSON.stringify(reply.error))
    const basis: Basis = { spec: atSpec as SpecDto, conditions: measured, normalized: reply.value.normalized, engineSchemaVersion: reply.value.schemaVersion }
    expect(reasonsGrounds(basis)).toBe(false)
    expect(groundsFacts(basis, reply.value, [], undefined)).toBe("")
  })
})
