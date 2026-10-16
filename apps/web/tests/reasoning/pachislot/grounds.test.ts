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
import { groundsFacts, reasonsGrounds, type SampledMargin } from "../../../src/core/pachislot/grounds/facts"
import { groundsNamingOf } from "../../../src/core/pachislot/grounds/naming"
import { everyStep, findingsIn, proofOf, type Proof } from "../../../src/core/grounds/proof"
import { compoundOf, numberOf, termOf } from "../../../src/core/grounds/term"
import { groundsLines, groundsStanding, plainOf, type GroundsLine, type GroundsPart } from "../../../src/ui/wording/pachislot/grounds"

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

/** A basis reasoned against what the engine solved of it, and against the figures a formula of it stores: the engine's own unless a test says otherwise, sampled where margins are given. */
const proved = async (
  basis: Basis,
  analysis: AnalysisDto,
  figures: readonly SettingLevelFigures[] = figuresFromAnalysis(analysis, basis.spec),
  margins: readonly SampledMargin[] | undefined = undefined,
): Promise<Proof> => {
  const prolog = new Prolog()
  await prolog.consultText(await readFile(RULES, "utf8"))
  await prolog.consultText(groundsFacts(basis, analysis, figures, margins))
  const answer = await prolog.queryOnce("prove(grounds, Proof).", { format: "json" })
  if (answer.status !== "success") throw new Error(JSON.stringify(answer))
  const term = termOf((answer.answer as Record<string, unknown>)["Proof"])
  if (term === undefined) throw new Error("no proof")
  const proof = proofOf(term)
  if (!proof.ok) throw new Error(JSON.stringify(proof.error))
  return proof.value
}


/** A piece of a line's working as read back: a number with how far its shown digits may be from it, a sign of arithmetic, words, a sign of equality, or the end of a chain. */
type Token =
  | { readonly kind: "number"; readonly value: number; readonly half: number }
  | { readonly kind: "op"; readonly op: string }
  | { readonly kind: "label" }
  | { readonly kind: "link"; readonly exact: boolean }
  | { readonly kind: "end" }

type Arithmetic = Extract<Token, { readonly kind: "number" | "op" }>

/** A number as a line writes it, with or without its unit, and half the last digit it shows. */
const numberRead = (text: string, rounded: boolean): Token | undefined => {
  const match = /^(\d+(?:\.(\d+))?)(枚\/G|G\/枚|枚|G|回|%)?$/u.exec(text)
  if (match === null) return undefined
  const scale = match[3] === "%" ? 0.01 : 1
  return { kind: "number", value: Number(match[1]) * scale, half: rounded ? 0.5 * 10 ** -(match[2]?.length ?? 0) * scale : 0 }
}

const tokensOf = (part: GroundsPart): readonly Token[] => {
  if (part.type === "figure") {
    const whole = numberRead(part.text, true)
    if (whole !== undefined) return [whole]
    const under = part.text.startsWith("1/") ? numberRead(part.text.slice(2), true) : undefined
    return under === undefined ? [{ kind: "label" }] : [{ kind: "number", value: 1, half: 0 }, { kind: "op", op: "÷" }, under]
  }
  return (part.text.match(/[＝≈；]|[×÷＋−（）^/]|[^\s＝≈；×÷＋−（）^/]+/gu) ?? []).map((chunk): Token => {
    if (chunk === "＝" || chunk === "≈") return { kind: "link", exact: chunk === "＝" }
    if (chunk === "；") return { kind: "end" }
    if ("×÷＋−（）^/".includes(chunk)) return { kind: "op", op: chunk === "/" ? "÷" : chunk }
    return numberRead(chunk, false) ?? { kind: "label" }
  })
}

/** The value of a run of arithmetic, or none where it does not read as one whole sum. */
const evaluated = (tokens: readonly Arithmetic[]): number | undefined => {
  const at = { index: 0 }
  const peek = (): Arithmetic | undefined => tokens[at.index]
  const isOp = (op: string): boolean => {
    const next = peek()
    return next?.kind === "op" && next.op === op
  }
  const primary = (): number | undefined => {
    const next = peek()
    if (next?.kind === "number") {
      at.index += 1
      return next.value
    }
    if (!isOp("（")) return undefined
    at.index += 1
    const inner = sum()
    if (inner === undefined || !isOp("）")) return undefined
    at.index += 1
    return inner
  }
  const power = (): number | undefined => {
    const base = primary()
    if (base === undefined || !isOp("^")) return base
    at.index += 1
    const exponent = power()
    return exponent === undefined ? undefined : base ** exponent
  }
  const product = (): number | undefined => {
    const first = power()
    if (first === undefined) return undefined
    const more = (sofar: number): number | undefined => {
      const multiplying = isOp("×")
      if (!multiplying && !isOp("÷")) return sofar
      at.index += 1
      const next = power()
      return next === undefined ? undefined : more(multiplying ? sofar * next : sofar / next)
    }
    return more(first)
  }
  const sum = (): number | undefined => {
    const first = product()
    if (first === undefined) return undefined
    const more = (sofar: number): number | undefined => {
      const adding = isOp("＋")
      if (!adding && !isOp("−")) return sofar
      at.index += 1
      const next = product()
      return next === undefined ? undefined : more(adding ? sofar + next : sofar - next)
    }
    return more(first)
  }
  const value = sum()
  return value !== undefined && at.index === tokens.length ? value : undefined
}

/** A run of arithmetic's value, and how far it could move with each number its digits round. */
const reckoned = (tokens: readonly Arithmetic[]): { readonly value: number; readonly spread: number } | undefined => {
  const value = evaluated(tokens)
  if (value === undefined) return undefined
  const spread = tokens.reduce((total, token, index) => {
    if (token.kind !== "number" || token.half === 0) return total
    const moved = evaluated(tokens.map((each, other) => (other === index ? { ...token, value: token.value + token.half } : each)))
    return total + Math.abs((moved ?? value) - value)
  }, 0)
  return { value, spread }
}

const arithmeticIn = (tokens: readonly Token[]): readonly Arithmetic[] => tokens.flatMap((token) => (token.kind === "number" || token.kind === "op" ? [token] : []))

/** The longest run of arithmetic a side of an equality ends with, or starts with. */
const ending = (tokens: readonly Token[]): ReturnType<typeof reckoned> => {
  const sum = arithmeticIn(tokens)
  return sum.map((_, start) => reckoned(sum.slice(start))).find((found) => found !== undefined)
}
const starting = (tokens: readonly Token[]): ReturnType<typeof reckoned> => {
  const sum = arithmeticIn(tokens)
  return sum.map((_, cut) => reckoned(sum.slice(0, sum.length - cut))).find((found) => found !== undefined)
}

/** Every equality a line states that has arithmetic on both sides, with what each side comes to. */
const equalities = (line: GroundsLine): readonly { readonly left: number; readonly right: number; readonly spread: number; readonly text: string }[] => {
  const tokens = line.parts.flatMap(tokensOf)
  const chains = tokens.reduce<readonly (readonly Token[])[]>((sofar, token) => (token.kind === "end" ? [...sofar, []] : [...sofar.slice(0, -1), [...(sofar.at(-1) ?? []), token]]), [[]])
  return chains.flatMap((chain) => {
    const segments = chain.reduce<readonly { readonly tokens: readonly Token[]; readonly exact: boolean }[]>(
      (sofar, token) => (token.kind === "link" ? [...sofar, { tokens: [], exact: token.exact }] : [...sofar.slice(0, -1), { ...(sofar.at(-1) ?? { exact: true }), tokens: [...(sofar.at(-1)?.tokens ?? []), token] }]),
      [{ tokens: [], exact: true }],
    )
    return segments.slice(1).flatMap((segment, index) => {
      const before = segments[index]
      const left = before === undefined || !segment.exact ? undefined : ending(before.tokens)
      const right = left === undefined ? undefined : starting(segment.tokens)
      return left === undefined || right === undefined ? [] : [{ left: left.value, right: right.value, spread: right.spread, text: plainOf(line.parts) }]
    })
  })
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
    const lines = groundsLines(proof, groundsNamingOf(basis)).map((line) => plainOf(line.parts))
    expect(lines).toContain("設定1")
    expect(lines).toContain("通常時1Gあたりの減り ＝ 50枚 ÷ ベース 40G ＝ 1.25枚/G")
    expect(lines).toContain("ATの平均獲得枚数 ＝ 通常 500G ×（3枚 ×（機械割 0.975 − 1）＋ 減り 1.25枚/G）÷（1 ＋ 3枚 ×（1 − 機械割 0.975）÷ 純増 4枚/G）＝ 500 × 1.175 ÷ 1.01875 ＝ 587.5枚 ÷ 1.01875 ＝ 576.7枚")
    expect(lines).toContain("検算：獲得枚数から戻した機械割 110% ＝ 入力された 110%")
    expect(lines).toContain("1周期の通常ゲーム数 ＝ AT 1回 × 初当たり分母 500 ＝ 500G")
    expect(lines).toContain("検算：AT 1回 ÷ 通常 500G ＝ 1/500、解析値の初当たり 1/500 と一致")
    expect(findingsIn(proof).filter((finding) => finding.standing === "holds")).toHaveLength(12)
    expect(amiss(proof)).toEqual([])
    expect(groundsStanding(proof).tone).toBe("holds")
  })

  test("a 機械割 is reasoned from an AT's own medals where its 純増 is given", async () => {
    const { basis, analysis } = solved(withNet)
    const proof = await proved(basis, analysis)
    expect(everyStep(proof).filter((step) => step.rule === "gain_fixed").length).toBeGreaterThanOrEqual(2)
    const lines = groundsLines(proof, groundsNamingOf(basis)).map((line) => plainOf(line.parts))
    expect(lines).toContain("ATの平均獲得枚数 600枚（解析値のまま）")
    expect(lines).toContain("検算：ここで導いた平均獲得枚数 600枚 ＝ 計算エンジンの 600枚")
    expect(lines).toContain("ATのゲーム数 ＝ 獲得 600枚 ÷ 純増 4枚/G ＝ 150G")
    expect(lines).toContain("1周期の投入 ＝ 3枚 ×（通常 500G ＋ AT 150G）＝ 1950枚")
    expect(lines).toContain("1周期の払い出し ＝ 投入 1950枚 − 減り 1.25枚/G × 通常 500G ＋ 獲得 600枚 ＝ 1925枚")
    expect(lines).toContain("機械割 ＝ 払い出し 1925枚 ÷ 投入 1950枚 ＝ 98.72%")
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
    const lines = groundsLines(proof, groundsNamingOf(basis)).map((line) => plainOf(line.parts))
    expect(lines).toContain("AT全体の純増 ＝ 1 ÷（0.5 ÷ 2枚/G ＋ 0.5 ÷ 8枚/G）＝ 1 ÷（0.25G/枚 ＋ 0.0625G/枚）＝ 1 ÷ 0.3125G/枚 ＝ 3.2枚/G（1枚あたりのATゲーム数を、獲得枚数の割合で合わせる）")
    expect(lines).toContain("検算：ここで導いたAT全体の純増 3.2枚/G ＝ 計算エンジンの 3.2枚/G")
    expect(lines.some((line) => line.includes("÷ 純増 3.2枚/G）＝ 500 × 1.175 ÷ 1.02344"))).toBe(true)
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
    expect(groundsLines(proof, groundsNamingOf(basis)).map((line) => plainOf(line.parts))).toContain("検算：保存されている機械割 99.5% と、ここで導いた 97.5% が食い違っています（差 2%）。古い計算エンジンで作られたか、数字が書き換えられています")
  })

  test("a setting level that cannot be proved is said so beside the ones that can", async () => {
    const { basis, analysis } = solved(rateSpec as SpecDto)
    const figures = figuresFromAnalysis(analysis, basis.spec)
    const proof = await proved(basis, analysis, figures.slice(1))
    expect(amiss(proof)).toContainEqual([undefined, "unproved"])
    const lines = groundsLines(proof, groundsNamingOf(basis)).map((line) => plainOf(line.parts))
    expect(lines).toContain("設定1の機械割を、解析値から導けませんでした")
    expect(lines).toContain("検算：獲得枚数から戻した機械割 110% ＝ 入力された 110%")
  })

  test("a cycle a CZ brings is the CZs it takes over the CZ's published 初当たり, within a スルー天井 or without one", async () => {
    const cz = czSpec as SpecDto
    const { ceiling, misses, ...rest } = cz.components
    const within: SpecDto = { ...cz, components: { ...rest, ceiling: { cz: 600 }, ...(misses === undefined ? {} : { misses }), netPerGame: { at: 4 } } }
    const sound = solved(within)
    const proof = await proved(sound.basis, sound.analysis)
    expect(amiss(proof)).toEqual([])
    const lines = groundsLines(proof, groundsNamingOf(sound.basis)).map((line) => plainOf(line.parts))
    expect(lines).toContain("ATまでのCZ ＝（1 −（1 − CZ成功率 0.3）^4）÷ 0.3 ＝（1 − 0.7^4）÷ 0.3 ＝（1 − 0.2401）÷ 0.3 ＝ 0.7599 ÷ 0.3 ＝ 2.533回（3回スルーで次は当選）")
    expect(lines).toContain("1周期の通常ゲーム数 ＝ ATまでのCZ 2.533回 × CZの初当たり分母 150 ＝ 380G")
    expect(lines).toContain("検算：ここで導いた1周期の通常ゲーム数 380G ＝ 計算エンジンの 380G")

    const without = solved({ ...cz, components: { ...rest, ceiling: { cz: 600 }, netPerGame: { at: 4 } } })
    const free = await proved(without.basis, without.analysis)
    expect(amiss(free)).toEqual([])
    expect(groundsLines(free, groundsNamingOf(without.basis)).map((line) => plainOf(line.parts))).toContain("ATまでのCZ ＝ 1 ÷ CZ成功率 0.3 ＝ 3.333回")
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

  test("a cycle names the CZ and its ceilings, and a setting change's shorter AT間天井 leaves an AT's cycle as it was", async () => {
    const cz = czSpec as SpecDto
    const cut = solved({ ...cz, components: { ...cz.components, netPerGame: { at: 4 } } })
    const lines = groundsLines(await proved(cut.basis, cut.analysis), groundsNamingOf(cut.basis)).map((line) => plainOf(line.parts))
    expect(lines).toContain("天井を除いたCZ確率 1/152.57（CZ成功率 0.3・スルー天井 3回）、CZ天井 600G・AT間天井 1000G まで1Gずつ追うと 1周期は通常 373G・CZ 2.487回（各ゲームでまだATに当たっていない確率を足し上げ）")
    expect(lines).toContain("CZ天井 600G")
    expect(lines).toContain("設定変更後のCZ天井 300G")
    expect(lines.some((line) => /モード\d|トリガー/u.test(line))).toBe(false)

    const shortened = solved({ ...cz, components: { ...cz.components, resetCeiling: { ...cz.components.resetCeiling, at: 500 }, netPerGame: { at: 4 } } })
    const proof = await proved(shortened.basis, shortened.analysis)
    expect(amiss(proof)).toEqual([])
    expect(shortened.analysis.settingLevels.map((figures) => figures.payoutRate)).toEqual(cut.analysis.settingLevels.map((figures) => figures.payoutRate))
  })

  test("a bonus that is the trigger pays each time it comes, and the AT's medals are what the 機械割 leaves after the bonuses", async () => {
    const cz = czSpec as SpecDto
    const { payout, ceiling, ...rest } = cz.components
    const rates = [
      { settingLevel: 1, value: 9750 },
      { settingLevel: 6, value: 11000 },
    ]
    const bonus: SpecDto = { ...cz, components: { ...rest, ceiling: { cz: 600 }, label: { at: "AT", cz: "ボーナス" }, payout: { cz: 100 }, netPerGame: { at: 4, cz: 5 }, rate: { at: rates } } }
    const cut: SpecDto = { ...bonus, components: { ...bonus.components, ceiling: { cz: 600, at: 1000 } } }
    const reasoned = await Promise.all(
      [bonus, cut].map(async (spec) => {
        const { basis, analysis } = solved(spec)
        const proof = await proved(basis, analysis)
        return { proof, lines: groundsLines(proof, groundsNamingOf(basis)) }
      }),
    )
    reasoned.forEach(({ proof }) => expect(amiss(proof)).toEqual([]))
    const [free, ceiled] = reasoned.map(({ lines }) => lines.map((line) => plainOf(line.parts)))
    expect(free).toContain("1周期のボーナスの獲得 ＝ ボーナス 2.533回 × 100枚 ＝ 253.3枚；ボーナス中 ＝ 253.3枚 ÷ 純増 5枚/G ＝ 50.7G")
    expect(free?.some((line) => line.startsWith("ATの平均獲得枚数 ＝（3枚 ×（機械割 0.975 − 1）×（通常 380G ＋ ボーナス中 50.7G）＋ 減り 1.25枚/G × 通常 380G − ボーナスの獲得 253.3枚）"))).toBe(true)
    expect(free?.some((line) => line.startsWith("1周期の投入 ＝ 3枚 ×（通常 380G ＋ ボーナス中 50.7G ＋ AT "))).toBe(true)
    expect(free).toContain("ATまでのボーナス ＝（1 −（1 − ボーナスのAT当選率 0.3）^4）÷ 0.3 ＝（1 − 0.7^4）÷ 0.3 ＝（1 − 0.2401）÷ 0.3 ＝ 0.7599 ÷ 0.3 ＝ 2.533回（3回スルーで次は当選）")
    expect(free).toContain("ボーナス間天井 600G")
    expect(ceiled?.some((line) => line.startsWith("天井を除いたボーナス確率 "))).toBe(true)
    const links = reasoned.flatMap(({ lines }) => lines.flatMap(equalities))
    expect(links.length).toBeGreaterThan(20)
    expect(links.filter((each) => Math.abs(each.left - each.right) > each.spread * 1.01 + 1e-9 * Math.max(1, Math.abs(each.left)))).toEqual([])
    expect([payout?.["at"], ceiling?.["at"]]).toEqual([600, 1000])
  })

  test("a スルー天井 drawn after each AT is a mode for each, played out mode by mode and come to the engine's", async () => {
    const cz = czSpec as SpecDto
    const { ceiling, resetCeiling, misses, ...rest } = cz.components
    const share = (points: number) => [1, 6].map((settingLevel) => ({ settingLevel, value: points }))
    const drawn: SpecDto = {
      ...cz,
      entities: [...cz.entities, "m2", "m4", "m6"],
      components: {
        ...rest,
        label: { ...rest.label, m2: "スルー2回", m4: "スルー4回", m6: "スルー6回" },
        mode: ["m2", "m4", "m6"],
        ceiling: { m2: 600, m4: 600, m6: 600 },
        misses: { m2: 2, m4: 4, m6: 6 },
        allotment: { m2: share(3400), m4: share(3300), m6: share(3300) },
        netPerGame: { at: 4 },
      },
    }
    const { basis, analysis } = solved(drawn)
    const proof = await proved(basis, analysis)
    expect(amiss(proof)).toEqual([])
    const lines = groundsLines(proof, groundsNamingOf(basis))
    const plain = lines.map((line) => plainOf(line.parts))
    expect(plain.some((line) => line.includes("スルー2回（スルー2回のCZ天井 600G・AT間天井 なし・スルー天井 2回）を 34%"))).toBe(true)
    expect(lines.flatMap(equalities).filter((each) => Math.abs(each.left - each.right) > each.spread * 1.01 + 1e-9 * Math.max(1, Math.abs(each.left)))).toEqual([])
    expect([ceiling?.["cz"], resetCeiling?.["cz"], misses?.["cz"]]).toEqual([600, 300, 3])
  })

  test("a trigger forced once on a game counted from the AT takes the engine's cycle, said to be unchecked, and comes back to the 初当たり", async () => {
    const cz = czSpec as SpecDto
    const forced: SpecDto = { ...cz, components: { ...cz.components, sinceAtCeiling: { cz: 800 }, netPerGame: { at: 4 } } }
    const { basis, analysis } = solved(forced)
    const proof = await proved(basis, analysis)
    expect(amiss(proof)).toEqual([["unverified_forced_cycle", "unverified"]])
    const lines = groundsLines(proof, groundsNamingOf(basis)).map((line) => plainOf(line.parts))
    expect(lines.some((line) => line.startsWith("1周期の通常ゲーム数 ") && line.endsWith("（計算エンジンの値）"))).toBe(true)
    expect(lines.filter((line) => line.startsWith("検算：CZ ") && line.includes("と一致")).length).toBe(2)
  })

  test("a machine of modes names each by its label", async () => {
    const modes = modesSpec as SpecDto
    const moded = solved({ ...modes, components: { ...modes.components, netPerGame: { at: 4 } } })
    const lines = groundsLines(await proved(moded.basis, moded.analysis), groundsNamingOf(moded.basis)).map((line) => plainOf(line.parts))
    expect(lines).toContain("天国の天井 ＝ 液晶 100G ÷ 液晶倍率 1.25 ＝ 80、切り上げて通常 80G")
    expect(lines).toContain("通常の天井 ＝ 液晶 1000G ÷ 液晶倍率 1.25 ＝ 800、切り上げて通常 800G")
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

    const lines = groundsLines(proof, groundsNamingOf(capped.basis)).map((line) => plainOf(line.parts))
    expect(lines).toContain("検算：ここで導いた上限到達率 1.21% ＝ 計算エンジンの 1.21%")
    expect(lines.some((line) => line.startsWith("ATの平均獲得枚数 694.9枚（上限なしなら 初回 300枚 ＋ 1セット 100枚 × 0.8 ÷（1 − 0.8）＝ 700枚。"))).toBe(true)
    expect(lines).toContain("上限 2400枚 に届くATの割合 1.21%（次のATが 32G 以内なら持ち越した枚数から積み上げ、来なければ0枚から）")
    expect(lines).toContain("設定変更後の振り分け ＝（1 − 上限到達率 0.0121）× AT後 0 ＋ 0.0121 × 設定変更後 1 ＝ 1.21%")

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
    expect(groundsLines(proof, groundsNamingOf(basis)).map((line) => plainOf(line.parts))).toContain("ATの平均獲得枚数 ＝ 初回 300枚 ＋ 1セット 100枚 × 継続率 0.8 ÷（1 − 0.8）＝ 300 ＋ 100 × 4 ＝ 300 ＋ 400 ＝ 700枚")
    expect([window?.["at"], resetOnCap, limit]).toEqual([32, ["at"], 2400])
  })

  test("an AT's medals by table are each row's medals at its share, summed, rows of the same product each said", async () => {
    const { payout, ...rest } = withNet.components
    const rows = [
      { medals: 300, share: 5000 },
      { medals: 600, share: 2500 },
      { medals: 900, share: 2500 },
    ]
    const table = { at: [1, 6].map((settingLevel) => ({ settingLevel, value: rows })) }
    const { basis, analysis } = solved({ ...withNet, components: { ...rest, payoutTable: table } })
    const proof = await proved(basis, analysis)
    expect(amiss(proof)).toEqual([])
    expect(payout?.["at"]).toBe(600)
    const lines = groundsLines(proof, groundsNamingOf(basis)).map((line) => plainOf(line.parts))
    expect(lines.filter((line) => line === "ATの平均獲得枚数 ＝ 150枚 ＋ 150枚 ＋ 225枚 ＝ 525枚").length).toBe(2)
    expect(lines.filter((line) => line === "300枚 × 0.5 ＝ 150枚").length).toBe(2)
    expect(lines.filter((line) => line === "600枚 × 0.25 ＝ 150枚").length).toBe(2)
    expect(lines.filter((line) => line === "900枚 × 0.25 ＝ 225枚").length).toBe(2)
  })

  test("a line puts in every figure it knows, set apart from its words", async () => {
    const { basis, analysis } = solved(rateSpec as SpecDto)
    const line = groundsLines(await proved(basis, analysis), groundsNamingOf(basis)).find((each) => plainOf(each.parts).startsWith("ATの平均獲得枚数 ＝ 通常 500G"))
    const figures = line?.parts.filter((part) => part.type === "figure").map((part) => part.text) ?? []
    const words = line?.parts.filter((part) => part.type === "words").map((part) => part.text).join("") ?? ""
    expect(figures).toEqual(["500G", "3枚", "0.975", "1.25枚/G", "3枚", "0.975", "4枚/G", "500", "1.175", "1.01875", "587.5枚", "1.01875", "576.7枚"])
    expect(words).toContain("機械割")
    expect(words).toContain("純増")
    expect(words).not.toContain("576.7")
  })

  test("every working a line writes out comes to the figure after it, within the digits shown", async () => {
    const rate = solved(rateSpec as SpecDto)
    const spec = rateSpec as SpecDto
    const shared = solved({ ...spec, components: { ...spec.components, netPerGame: { at: 2 }, otherNet: { at: [{ net: 8, shareBasisPoints: 5000 }] } } })
    const net = solved(withNet)
    const cz = czSpec as SpecDto
    const { ceiling, misses, ...czRest } = cz.components
    const within = solved({ ...cz, components: { ...czRest, ceiling: { cz: 600 }, ...(misses === undefined ? {} : { misses }), netPerGame: { at: 4 } } })
    const cut = solved({ ...cz, components: { ...cz.components, netPerGame: { at: 4 } } })
    const cap = capSpec as SpecDto
    const capped = solved({ ...cap, components: { ...cap.components, netPerGame: { at: 4 } } })
    const { window, resetOnCap, ...setsRest } = cap.components
    const { cap: limit, ...resources } = cap.resources
    const sets = solved({ ...cap, components: { ...setsRest, netPerGame: { at: 4 } }, resources })
    const { payout, ...tableRest } = withNet.components
    const rows = [
      { medals: 300, share: 5000 },
      { medals: 600, share: 2500 },
      { medals: 900, share: 2500 },
    ]
    const table = solved({ ...withNet, components: { ...tableRest, payoutTable: { at: [1, 6].map((settingLevel) => ({ settingLevel, value: rows })) } } })
    const modes = modesSpec as SpecDto
    const moded = solved({ ...modes, components: { ...modes.components, netPerGame: { at: 4 } } })
    const proofs = await Promise.all([rate, shared, net, within, cut, capped, sets, table, moded].map(async (each) => ({ proof: await proved(each.basis, each.analysis), naming: groundsNamingOf(each.basis) })))
    const links = proofs.flatMap(({ proof, naming }) => groundsLines(proof, naming).flatMap(equalities))
    expect(links.length).toBeGreaterThan(150)
    expect(links.filter((each) => Math.abs(each.left - each.right) > each.spread * 1.01 + 1e-9 * Math.max(1, Math.abs(each.left)))).toEqual([])
    expect([ceiling?.["at"], window?.["at"], resetOnCap, limit, payout?.["at"]]).toEqual([1000, 32, ["at"], 2400, 600])
  })

  test("a check that fails shows both figures, told apart, and how far apart they are", async () => {
    const { basis, analysis } = solved(rateSpec as SpecDto)
    const tampered = { ...analysis, settingLevels: analysis.settingLevels.map((figures) => ({ ...figures, payoutRate: figures.payoutRate + 0.01 })) }
    const failed = groundsLines(await proved(basis, tampered, figuresFromAnalysis(analysis, basis.spec)), groundsNamingOf(basis)).filter((line) => line.tone === "fails")
    expect(failed.map((line) => plainOf(line.parts))).toEqual(["検算：ここで導いた機械割 97.5% が計算エンジンの 98.5% と食い違っています（差 1%）", "検算：ここで導いた機械割 110% が計算エンジンの 111% と食い違っています（差 1%）"])
    const slight = { ...analysis, settingLevels: analysis.settingLevels.map((figures) => ({ ...figures, payoutRate: figures.payoutRate + 1e-6 })) }
    const close = groundsLines(await proved(basis, slight, figuresFromAnalysis(analysis, basis.spec)), groundsNamingOf(basis)).find((line) => line.tone === "fails")
    const [mine, engine, gap] = close?.parts.filter((part) => part.type === "figure").map((part) => part.text) ?? []
    expect(mine).not.toBe(engine)
    expect(gap).toBe("0.0001%")
  })

  test("a cycle without an AT間天井 is the games between triggers times the triggers", async () => {
    const cz = czSpec as SpecDto
    const { ceiling, misses, ...rest } = cz.components
    const { basis, analysis } = solved({ ...cz, components: { ...rest, ceiling: { cz: 600 }, ...(misses === undefined ? {} : { misses }), netPerGame: { at: 4 } } })
    const proof = await proved(basis, analysis)
    const free = everyStep(proof).filter((step) => step.rule === "cycle_free")
    expect(free.length).toBeGreaterThanOrEqual(2)
    free.forEach((step) => {
      const product = step.premises.flatMap((premise) => (premise.type === "computed" ? [premise.expression] : [])).at(-1)
      const between = numberOf(compoundOf(product, "*", 2)?.args[1]) ?? Number.NaN
      const [games, triggers] = [numberOf(step.claim.args[1]) ?? Number.NaN, numberOf(step.claim.args[2]) ?? Number.NaN]
      expect(Math.abs(between - games)).toBeGreaterThan(1)
      expect(between * triggers).toBeCloseTo(games, 6)
    })
    const lines = groundsLines(proof, groundsNamingOf(basis)).map((line) => plainOf(line.parts))
    expect(lines).toContain("CZ間 ＝（1 −（1 − 1/152.99）^600）× 152.99 ＝ 150G")
    expect(lines).toContain("1周期の通常ゲーム数 ＝ CZ間 150G × CZ 2.533回 ＝ 380G")
    expect(ceiling?.["at"]).toBe(1000)
  })

  test("a sampled 機械割 is checked against the exact one within twice its margin, both said", async () => {
    const { basis, analysis } = solved(rateSpec as SpecDto)
    const exact = figuresFromAnalysis(analysis, basis.spec)
    const margins = exact.map((figures) => ({ settingLevel: figures.settingLevel, payoutRateMargin: 0.001 }))
    const off = (margin: number) => exact.map((figures) => ({ ...figures, payoutRate: figures.payoutRate + margin * 0.001 }))
    const within = groundsLines(await proved(basis, analysis, off(1.5), margins), groundsNamingOf(basis)).map((line) => plainOf(line.parts))
    expect(within).toContain("検算：推定の機械割 97.65% と厳密解 97.5% の差 0.15% は、誤差 ±0.1% の2倍 0.2% 以内")
    const beyond = await proved(basis, analysis, off(2.5), margins)
    expect(groundsLines(beyond, groundsNamingOf(basis)).map((line) => plainOf(line.parts))).toContain("検算：推定の機械割 97.75% と厳密解 97.5% の差 0.25% は、誤差 ±0.1% の2倍 0.2% を超えています。数字が書き換えられているかもしれません")
    expect(amiss(beyond).filter(([, standing]) => standing === "fails")).toEqual([
      ["check_sample", "fails"],
      ["check_sample", "fails"],
    ])
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
