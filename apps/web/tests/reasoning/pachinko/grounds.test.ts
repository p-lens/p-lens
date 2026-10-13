import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"

import type { AnalysisDto, Envelope, SpecDto } from "@p-lens/contracts/pachinko"
import { analyze, initSync } from "@p-lens/pachinko-engine/pachinko.js"
import { load, Prolog } from "trealla"

import { figuresFromAnalysis, type Figures } from "../../../src/core/pachinko/figures"
import type { Basis } from "../../../src/core/pachinko/formula"
import { groundsFacts, type SampledFigure } from "../../../src/core/pachinko/grounds/facts"
import { everyStep, findingsIn, proofOf, type Proof } from "../../../src/core/grounds/proof"
import { termOf } from "../../../src/core/grounds/term"
import { readBasisForm, STARTING_BASIS } from "../../../src/ui/features/pachinko/formulas/formula-form"
import { groundsLines, groundsStanding } from "../../../src/ui/wording/pachinko/grounds"

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

/** What the reasoner is told of a formula: its basis, what the engine solved of it, and the figures it stores. */
interface Told {
  readonly basis: Basis
  readonly analysis: AnalysisDto
  readonly figures: Figures
}

const same = (told: Told): Told => told

/** A spec solved and reasoned, with what the reasoner is told altered on the way where a test says how. */
const reasoned = async (spec: SpecDto, sampled?: SampledFigure, altered: (told: Told) => Told = same): Promise<{ readonly proof: Proof; readonly analysis: AnalysisDto; readonly basis: Basis }> => {
  const { basis, analysis } = solved(spec)
  const told = altered({ basis, analysis, figures: figuresFromAnalysis(analysis, undefined) })
  const prolog = new Prolog()
  await prolog.consultText(await readFile(RULES, "utf8"))
  await prolog.consultText(groundsFacts(told.basis, told.analysis, told.figures, sampled))
  const answer = await prolog.queryOnce("prove(grounds, Proof).", { format: "json" })
  if (answer.status !== "success") throw new Error(JSON.stringify(answer))
  const term = termOf((answer.answer as Record<string, unknown>)["Proof"])
  if (term === undefined) throw new Error("no proof")
  const proof = proofOf(term)
  if (!proof.ok) throw new Error(JSON.stringify(proof.error))
  return { proof: proof.value, analysis, basis }
}

/** What a proof found that did not simply hold, as the rule and how it stands. */
const amiss = (proof: Proof): readonly (readonly [string | undefined, string])[] =>
  findingsIn(proof).filter((finding) => finding.standing !== "holds").map((finding) => [finding.rule, finding.standing] as const)

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
    expect(lines.filter((line) => line.tone !== "plain" && line.tone !== "holds")).toEqual([])
    expect(lines[0]?.depth).toBe(0)
  })

  test("reach the engine's 1R chance from the spec sheet, and say so", async () => {
    const { proof, analysis } = await reasoned(specOf(STARTING_BASIS))
    expect(claimed(proof, "round_chance")).toBeCloseTo(analysis.roundChanceOneIn, 9)
    expect(claimed(proof, "rounds_per_first_hit")).toBeCloseTo(analysis.averageRounds, 9)
    expect(everyStep(proof).filter((step) => step.rule === "allotted" && step.claim.args[0] !== undefined && typeof step.claim.args[0] === "object")).toHaveLength(2)
    expect(findingsIn(proof).filter((finding) => finding.rule === "check_engine").map((finding) => finding.standing)).toEqual(["holds", "holds"])
    expect(findingsIn(proof).filter((finding) => finding.standing !== "holds")).toEqual([])
  })

  test("cut a cycle at the 遊タイム when the machine has one", async () => {
    const reliefDriveMode = { ...STARTING_BASIS.modes[0]!, key: "m2", label: "遊タイム", kind: "rapid" as const, spins: "379" }
    const { proof, analysis } = await reasoned(specOf({ ...STARTING_BASIS, modes: [...STARTING_BASIS.modes, reliefDriveMode], reliefDriveGauge: "950", reliefDriveTo: "m2" }))
    expect(everyStep(proof).filter((step) => step.rule === "weighted_cycle").length).toBeGreaterThanOrEqual(2)
    expect(everyStep(proof).find((step) => step.rule === "cycle_spent")).toBeDefined()
    expect(claimed(proof, "round_chance_with_relief_drive")).toBeCloseTo(analysis.roundChanceOneIn, 9)
    expect(amiss(proof)).toEqual([])
    expect(groundsStanding(proof).tone).toBe("holds")
  })

  test("check a sampled formula's stored estimate against the exact figure, and show it when it is off", async () => {
    const exact = solved(specOf(STARTING_BASIS)).analysis.roundChanceOneIn
    const near = await reasoned(specOf(STARTING_BASIS), { oneIn: exact + 0.01, margin: 0.02 })
    expect(findingsIn(near.proof).map((finding) => [finding.rule, finding.standing])).toContainEqual(["check_sample", "holds"])
    const tampered = await reasoned(specOf(STARTING_BASIS), { oneIn: exact + 1, margin: 0.02 })
    expect(findingsIn(tampered.proof).map((finding) => [finding.rule, finding.standing])).toContainEqual(["check_sample", "fails"])
  })

  test("a machine whose shares pay each their own comes to one payout a round, every round's gain over every round, and checks", async () => {
    const twoAttackers = { ...STARTING_BASIS, regularOneIn: "100", firstHit: [{ share: "50", rounds: "4", next: "m1", prize: "10", count: "", others: [], jackpots: "" }, { share: "50", rounds: "4", next: "regular", prize: "10", count: "", others: [], jackpots: "" }] }
    const { proof, analysis, basis } = await reasoned(specOf(twoAttackers))
    const rounds = 4 + 0.5 * 40
    const balls = 4 * 90 + 0.5 * 40 * 140
    expect(analysis.ballsPerRound).toBeCloseTo(balls / rounds, 9)
    expect(claimed(proof, "payout_by_share")).toBeCloseTo(balls / rounds, 9)
    expect(claimed(proof, "balls_per_first_hit")).toBeCloseTo(balls, 9)
    expect(findingsIn(proof).filter((finding) => finding.standing !== "holds")).toEqual([])
    const lines = groundsLines(proof, basis.normalized, new Map([["m1", "RUSH"]])).map((line) => line.text)
    expect(lines).toContain("50.0%・360玉・RUSH：（360玉 ＋ その後 5600玉）× 50.0% ＝ 2980玉")
    expect(lines.some((line) => line.startsWith("1R平均出玉 131.7玉 ＝ 出玉 3160玉 ÷ ラウンド 24R"))).toBe(true)
  })

  test("a jackpot through two attackers counts every round and gains each by its own attacker, and checks", async () => {
    const vRound = { share: "50", rounds: "1", prize: "1", count: "", others: [{ rounds: "3", prize: "", count: "" }], jackpots: "" }
    const twoInOne = { ...STARTING_BASIS, regularOneIn: "100", firstHit: [{ ...vRound, next: "m1" }, { ...vRound, next: "regular" }] }
    const { proof, analysis } = await reasoned(specOf(twoInOne))
    const rounds = 4 + 0.5 * 40
    const balls = 3 * 140 + 0.5 * 40 * 140
    expect(analysis.roundChanceOneIn).toBeCloseTo(100 / rounds, 9)
    expect(claimed(proof, "payout_by_share")).toBeCloseTo(balls / rounds, 9)
    expect(claimed(proof, "balls_per_first_hit")).toBeCloseTo(balls, 9)
    expect(findingsIn(proof).filter((finding) => finding.standing !== "holds")).toEqual([])
  })

  test("what the engine solved of a state is put into the state's own equation, and a value that is not the solution fails it", async () => {
    const { proof, basis } = await reasoned(specOf(STARTING_BASIS), undefined, (told) => ({
      ...told,
      analysis: { ...told.analysis, derivation: told.analysis.derivation.map((state) => ({ ...state, averageRounds: state.averageRounds + 1 })) },
    }))
    expect(amiss(proof)).toEqual([
      ["check_engine", "fails"],
      ["check_stored", "fails"],
      ["check_state_rounds", "fails"],
    ])
    expect(groundsStanding(proof).tone).toBe("fails")
    expect(groundsLines(proof, basis.normalized, new Map([["m1", "RUSH"]])).map((line) => line.text)).toContain(
      "検算：RUSH以降の期待ラウンド 41R は、振分ごとの合計 40.8R と食い違っています（式を満たしません）",
    )
  })

  test("a stored figure that is not what the basis comes to is shown as one", async () => {
    const { proof } = await reasoned(specOf(STARTING_BASIS), undefined, (told) => ({ ...told, figures: { ...told.figures, roundChanceOneIn: told.figures.roundChanceOneIn - 2, payoutPerRound: 150 } }))
    expect(amiss(proof)).toEqual([
      ["check_stored", "fails"],
      ["check_stored", "fails"],
    ])
  })

  test("a chain that is not what the spec sheet makes is shown as one, mode by mode", async () => {
    const kinder = { ...STARTING_BASIS, modes: [{ ...STARTING_BASIS.modes[0]!, continuationRate: "90" }] }
    const { proof } = await reasoned(specOf(STARTING_BASIS), undefined, (told) => ({ ...told, basis: { ...told.basis, spec: specOf(kinder) } }))
    expect(amiss(proof)).toEqual([["check_made", "fails"]])
    const sooner = await reasoned(specOf(STARTING_BASIS), undefined, (told) => ({ ...told, basis: { ...told.basis, spec: specOf({ ...STARTING_BASIS, regularOneIn: "199.8" }) } }))
    expect(amiss(sooner.proof)).toEqual([["check_regular", "fails"]])
  })

  test("the chain a lucky trigger, an ST and a leftover queue make is the engine's, state by state", async () => {
    const mode = STARTING_BASIS.modes[0]!
    const share = mode.allotment[0]!
    const machine = {
      ...STARTING_BASIS,
      modes: [
        { ...mode, triggerCombo: "3", triggerTo: "m2" },
        { ...mode, key: "m2", label: "LT", kind: "special-time" as const, spins: "163", chance: "99.9", allotment: [{ ...share, next: "m2" }], onMiss: "m3" },
        { ...mode, key: "m3", label: "残保留", kind: "leftover-queue" as const, draws: "4", allotment: [{ ...share, next: "m1" }] },
      ],
    }
    const { proof, basis } = await reasoned(specOf(machine))
    expect(basis.normalized.states).toHaveLength(4)
    expect(amiss(proof)).toEqual([])
    expect(findingsIn(proof).filter((finding) => finding.rule === "check_made")).toHaveLength(5)
    const lines = groundsLines(proof, basis.normalized, new Map([["m1", "RUSH"], ["m2", "LT"], ["m3", "残保留"]])).map((line) => line.text)
    expect(lines).toContain("LT：次の大当りまで続く確率 80.6% ＝ 1 −（1 − 1/99.9）の 163乗（ST）")
    expect(lines).toContain("検算：RUSH（2連目）の振分と行き先は期待値基礎値どおり")
  })

  test("the 遊タイム's long run is put into its own equations: each way of starting weighed by what flows into it, each point of a combo by where its outcomes lead", async () => {
    const drive = { ...STARTING_BASIS.modes[0]!, key: "m2", label: "遊タイム", kind: "rapid" as const, spins: "379" }
    const rapid = { ...STARTING_BASIS.modes[0]!, key: "m3", label: "時短", kind: "rapid" as const, spins: "100" }
    const machine = { ...STARTING_BASIS, modes: [{ ...STARTING_BASIS.modes[0]!, onMiss: "m3" }, drive, rapid], reliefDriveGauge: "950", reliefDriveTo: "m2" }
    const sound = await reasoned(specOf(machine))
    expect(amiss(sound.proof)).toEqual([])
    const kinds = sound.analysis.reliefDrive?.restarts.length ?? 0
    expect(kinds).toBeGreaterThanOrEqual(3)
    expect(findingsIn(sound.proof).filter((finding) => finding.rule === "check_weight")).toHaveLength(kinds)
    const lines = groundsLines(sound.proof, sound.basis.normalized, new Map([["m1", "RUSH"], ["m2", "遊タイム"], ["m3", "時短"]])).map((line) => line.text)
    expect(lines.some((line) => line.startsWith("検算：通常時が時短・残保留の分 100回転たまって始まる割合"))).toBe(true)
    expect(lines).toContain("検算：時短が遊タイムまでの回転数に数える 100回転は期待値基礎値どおり")

    const shifted = await reasoned(specOf(machine), undefined, (told) => {
      const relief = told.analysis.reliefDrive
      if (relief === undefined) return told
      const moved = relief.restarts.map((restart, index) => ({ ...restart, weight: restart.weight + (index === 0 ? 0.01 : index === 1 ? -0.01 : 0) }))
      return { ...told, analysis: { ...told.analysis, reliefDrive: { ...relief, restarts: moved } } }
    })
    expect(amiss(shifted.proof).filter(([rule]) => rule === "check_weight").length).toBeGreaterThanOrEqual(2)
    expect(amiss(shifted.proof)).not.toContainEqual(["check_weights", "fails"])

    const bent = await reasoned(specOf(machine), undefined, (told) => {
      const relief = told.analysis.reliefDrive
      if (relief === undefined) return told
      const endings = relief.endings.map((ending, index) => (index === 0 ? { ...ending, chances: ending.chances.map((each) => ({ ...each, chance: each.chance / 2 })) } : ending))
      return { ...told, analysis: { ...told.analysis, reliefDrive: { ...relief, endings } } }
    })
    expect(amiss(bent.proof)).toContainEqual(["check_endings", "fails"])
  })

  test("a state nothing leads out of, and shares that are not a whole, are denied rather than solved", async () => {
    const { proof, basis } = await reasoned(specOf(STARTING_BASIS), undefined, (told) => ({
      ...told,
      basis: { ...told.basis, normalized: { ...told.basis.normalized, states: told.basis.normalized.states.map((state) => ({ ...state, outcomes: state.outcomes.filter((outcome) => outcome.next.type !== "end") })) } },
    }))
    expect(amiss(proof)).toContainEqual(["check_ends", "fails"])
    expect(amiss(proof)).toContainEqual(["check_shares", "fails"])
    expect(amiss(proof)).toContainEqual(["check_made", "fails"])
    expect(groundsLines(proof, basis.normalized, new Map([["m1", "RUSH"]])).map((line) => line.text)).toContain("検算：通常時に戻れない状態があります（RUSH）。連チャンが終わらないので、数字は決まりません")
  })

  test("a part that cannot be proved is said so beside the parts that can", async () => {
    const { proof, basis } = await reasoned(specOf(STARTING_BASIS), undefined, (told) => ({
      ...told,
      basis: { ...told.basis, normalized: { ...told.basis.normalized, entry: told.basis.normalized.entry.map((outcome) => ({ ...outcome, rounds: 0, next: { type: "end" as const } })) } },
    }))
    expect(amiss(proof)).toContainEqual([undefined, "unproved"])
    const lines = groundsLines(proof, basis.normalized, new Map([["m1", "RUSH"]]))
    expect(lines.map((line) => line.text)).toContain("1Rトータル確率を、期待値基礎値から導けませんでした")
    expect(lines.map((line) => line.text)).toContain("1R平均出玉 140玉 ＝ 賞球 15 × カウント 10 − カウント 10")
    expect(groundsStanding(proof).tone).toBe("fails")
  })

  test("what holds but no real machine would show is remarked on, and a margin too wide to check by is said to check nothing", async () => {
    const drive = { ...STARTING_BASIS.modes[0]!, key: "m2", label: "遊タイム", kind: "rapid" as const, spins: "100" }
    const eager = await reasoned(specOf({ ...STARTING_BASIS, modes: [...STARTING_BASIS.modes, drive], reliefDriveGauge: "100", reliefDriveTo: "m2" }))
    expect(amiss(eager.proof)).toEqual([["odd_relief_drive_likely", "odd"]])
    expect(groundsStanding(eager.proof).tone).toBe("odd")
    const exact = solved(specOf(STARTING_BASIS)).analysis.roundChanceOneIn
    const loose = await reasoned(specOf(STARTING_BASIS), { oneIn: exact + 3, margin: 5 })
    expect(amiss(loose.proof)).toEqual([["unverified_wide_margin", "unverified"]])
  })
})
