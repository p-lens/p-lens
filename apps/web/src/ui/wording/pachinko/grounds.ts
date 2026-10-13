import type { NormalizedSpecDto } from "@p-lens/contracts/pachinko"

import { findingsIn, givenIn, partsUnder, standingOf, stepsUnder, tallyOf, type Proof } from "../../../core/grounds/proof"
import { atomOf, compoundOf, numberOf, type Term } from "../../../core/grounds/term"
import { oneInText } from "./formula"

/** How a line of reasoned grounds is to be taken: said plainly, a check that held or failed, a figure taken unchecked, or something no real machine would show. */
export type GroundsTone = "plain" | "holds" | "fails" | "unverified" | "odd"

/** One line of reasoned grounds: what it says, how deep under the line above, and how it is to be taken. */
export interface GroundsLine {
  readonly text: string
  readonly depth: number
  readonly tone: GroundsTone
}

type Step = Proof & { readonly type: "step" }

const rounds = (value: number | undefined): string => (value === undefined ? "--" : `${value.toFixed(2).replace(/\.?0+$/, "")}R`)

const balls = (value: number | undefined): string => (value === undefined ? "--" : `${value.toFixed(1).replace(/\.0$/, "")}玉`)

const percent = (value: number | undefined): string => (value === undefined ? "--" : `${(value * 100).toFixed(1)}%`)

const oneIn = (value: number | undefined): string => (value === undefined ? "--" : oneInText(value))

const spins = (value: number | undefined): string => (value === undefined ? "--" : `${value.toFixed(1)}回転`)

const arg = (step: Step | undefined, index: number): number | undefined => numberOf(step?.claim.args[index])

const sub = (step: Step, rule: string): Step | undefined => stepsUnder(step).find((inner) => inner.rule === rule)

const givenNumber = (step: Step, functor: string, index: number): number | undefined => numberOf(givenIn(step, functor)?.args[index])

/** Where a share leads, as the person wrote the spec: back to the regular game, or into a mode by its label. */
const destination = (target: Term | undefined, normalized: NormalizedSpecDto, labels: ReadonlyMap<string, string>): string => {
  if (atomOf(target) === "end") return "通常へ"
  const index = numberOf(compoundOf(target, "state", 1)?.args[0])
  const origin = index === undefined ? undefined : normalized.origins[index]
  if (origin === undefined) return "--"
  const label = labels.get(origin.mode) ?? origin.mode
  return origin.combo === 1 ? label : `${label}（${origin.combo}連目）`
}

/** A way of starting regular play again, as a player would say it. */
const restartText = (kind: Term | undefined): string => {
  if (atomOf(kind) === "spent") return "遊タイム消化済みで始まる（次の大当りまで発動なし）"
  const filled = numberOf(compoundOf(kind, "filled", 1)?.args[0])
  return filled === undefined ? "--" : filled === 0 ? "0回転から始まる" : `時短・残保留の分 ${filled}回転たまって始まる`
}

/** Where outcomes are allotted from, as a player would say it: a first jackpot, or a state by its mode and combo. */
const from = (where: Term | undefined, normalized: NormalizedSpecDto, labels: ReadonlyMap<string, string>): string => {
  if (atomOf(where) === "first_hit") return "初当り"
  const origin = numberOf(where) === undefined ? undefined : normalized.origins[numberOf(where) ?? -1]
  if (origin === undefined) return "--"
  const label = labels.get(origin.mode) ?? origin.mode
  return origin.combo === 1 ? label : `${label}（${origin.combo}連目）`
}

/** A mode by its place among the spec's modes, which is how the reasoner is told of it. */
const modeAt = (place: Term | undefined, labels: ReadonlyMap<string, string>): string => [...labels.values()][numberOf(place) ?? -1] ?? "--"

const figureName = (figure: string | undefined): string => (figure === "round_chance" ? "1Rトータル確率" : figure === "payout_per_round" ? "1R平均出玉" : "--")

/** A check's line: what it found where it held, and what is wrong where it did not. */
const checked = (step: Step, held: string, failed: string): Omit<GroundsLine, "depth"> => {
  const holds = standingOf(step) === "holds"
  return { text: `検算：${holds ? held : failed}`, tone: holds ? "holds" : "fails" }
}

const checkedFigure = (figure: string | undefined, engine: number | undefined): string =>
  figure === "round_chance" ? oneIn(engine) : figure === "payout_per_round" ? balls(engine) : String(engine ?? "--")

/** What one step of the proof says, in the words of a spec sheet; none for steps the line above already says. */
const lineOf = (step: Step, normalized: NormalizedSpecDto, labels: ReadonlyMap<string, string>): Omit<GroundsLine, "depth"> | undefined => {
  switch (step.rule) {
    case "grounds":
      return { text: "この算出条件の数字は、次のように導かれます。", tone: "plain" }
    case "round_chance":
      return {
        text: `1Rトータル確率 ${oneIn(arg(step, 0))} ＝ 通常時の大当り確率 ${oneIn(givenNumber(step, "regular_one_in", 0))} ÷ 初当り1回あたりの平均ラウンド ${rounds(arg(sub(step, "rounds_per_first_hit"), 0))}`,
        tone: "plain",
      }
    case "round_chance_with_relief_drive": {
      const sums = step.premises.flatMap((premise) => (premise.type === "computed" ? [premise.value] : []))
      return {
        text: `1Rトータル確率 ${oneIn(arg(step, 0))} ＝ 通常回転 ${spins(sums.at(-3))} ÷ ラウンド ${rounds(sums.at(-2))}（通常時の始まり方ごとに重み付け）`,
        tone: "plain",
      }
    }
    case "weighted_cycle":
      return { text: `通常時が${restartText(step.claim.args[0])}（${percent(arg(step, 1))}）：通常回転 ${spins(arg(step, 2))}・ラウンド ${rounds(arg(step, 3))}（割合を掛けた値）`, tone: "plain" }
    case "cycle_filled": {
      const computed = step.premises.flatMap((premise) => (premise.type === "computed" ? [premise.value] : []))
      return {
        text: `遊タイムまで残り ${computed.at(0) ?? "--"}回転：到達率 ${percent(computed.at(1))}（＝（1 − 1/${givenNumber(step, "regular_one_in", 0)?.toFixed(1) ?? "--"}）の ${computed.at(0) ?? "--"}乗）、通常回転 ${spins(arg(step, 1))}・ラウンド ${rounds(arg(step, 2))}`,
        tone: "plain",
      }
    }
    case "cycle_spent":
      return { text: `遊タイムは次の大当りまで来ない：初当りまで ${spins(arg(step, 1))}・ラウンド ${rounds(arg(step, 2))}`, tone: "plain" }
    case "rounds_per_first_hit":
      return { text: `初当り1回あたりの平均ラウンド ${rounds(arg(step, 0))} ＝ 振分ごとの合計`, tone: "plain" }
    case "allotted": {
      const outcome = givenIn(step, "outcome")
      const share = numberOf(outcome?.args[1])
      const own = numberOf(outcome?.args[2])
      const after = arg(sub(step, "into_mode"), 1) ?? 0
      return { text: `${percent(share)}・${own ?? "--"}R・${destination(outcome?.args[4], normalized, labels)}：（${own ?? "--"}R ＋ その後 ${rounds(after)}）× ${percent(share)} ＝ ${rounds(arg(step, 1))}`, tone: "plain" }
    }
    case "into_mode":
      return { text: `${destination(step.claim.args[0], normalized, labels)}以降の期待ラウンド ${rounds(arg(step, 1))}（計算エンジンが状態遷移を解いた値。下で検算します）`, tone: "plain" }
    case "payout_from_spec": {
      const net = sub(step, "net_per_round")
      const count = net === undefined ? undefined : givenNumber(net, "payout", 1)
      return { text: `1R平均出玉 ${arg(step, 0) ?? "--"}玉 ＝ 賞球 ${net === undefined ? "--" : (givenNumber(net, "payout", 0) ?? "--")} × カウント ${count ?? "--"} − カウント ${count ?? "--"}`, tone: "plain" }
    }
    case "payout_measured":
      return { text: `1R平均出玉 ${arg(step, 0) ?? "--"}玉（実測）`, tone: "plain" }
    case "payout_by_share": {
      const scale = arg(sub(step, "scale_measured"), 0)
      return {
        text: `1R平均出玉 ${balls(arg(step, 0))} ＝ 出玉 ${balls(arg(sub(step, "balls_per_cycle") ?? sub(step, "balls_per_cycle_with_relief_drive"), 0))} ÷ ラウンド ${rounds(arg(sub(step, "rounds_per_cycle") ?? sub(step, "rounds_per_cycle_with_relief_drive"), 0))}${scale === undefined || scale === 1 ? "" : ` × 実測の比率 ${scale.toFixed(3)}`}（振分ごとに賞球やカウントが違うので、全ラウンドの平均）`,
        tone: "plain",
      }
    }
    case "scale_measured":
      return { text: `実測の比率 ${arg(step, 0)?.toFixed(3) ?? "--"} ＝ 実測の1R出玉 ${balls(givenNumber(step, "measured", 0))} ÷ 賞球×カウント−カウント ${balls(arg(sub(step, "net_per_round"), 0))}`, tone: "plain" }
    case "balls_per_first_hit":
      return { text: `初当り1回あたりの平均出玉 ${balls(arg(step, 0))} ＝ 振分ごとの合計`, tone: "plain" }
    case "paid": {
      const outcome = givenIn(step, "outcome")
      const share = numberOf(outcome?.args[1])
      const own = numberOf(outcome?.args[3])
      const after = arg(sub(step, "balls_into_mode"), 1) ?? 0
      return { text: `${percent(share)}・${balls(own)}・${destination(outcome?.args[4], normalized, labels)}：（${balls(own)} ＋ その後 ${balls(after)}）× ${percent(share)} ＝ ${balls(arg(step, 1))}`, tone: "plain" }
    }
    case "balls_into_mode":
      return { text: `${destination(step.claim.args[0], normalized, labels)}以降の期待出玉 ${balls(arg(step, 1))}（計算エンジンが状態遷移を解いた値。下で検算します）`, tone: "plain" }
    case "weighted_balls":
      return { text: `通常時が${restartText(step.claim.args[0])}（${percent(arg(step, 1))}）：出玉 ${balls(arg(step, 2))}（割合を掛けた値）`, tone: "plain" }
    case "check_engine": {
      const figure = checkedFigure(atomOf(step.claim.args[0]), numberOf(step.claim.args[2]))
      return checked(step, `計算エンジンの答え ${figure} と一致`, `計算エンジンの答え ${figure} と食い違っています`)
    }
    case "check_stored": {
      const name = atomOf(step.claim.args[0])
      const figure = `${figureName(name)} ${checkedFigure(name, numberOf(step.claim.args[2]))}`
      return checked(step, `保存されている${figure} と一致`, `保存されている${figure} と食い違っています。古い計算エンジンで作られたか、数字が書き換えられています`)
    }
    case "check_sample": {
      const sampled = `${oneIn(numberOf(step.claim.args[1]))}（±${numberOf(step.claim.args[2])?.toFixed(2) ?? "--"}）`
      return checked(step, `保存された推定値 ${sampled}は厳密解の範囲内`, `保存された推定値 ${sampled}は厳密解から外れています。数字が書き換えられているかもしれません`)
    }
    case "solution":
      return { text: "計算エンジンが状態遷移を解いた値を、その状態自身の式に入れて確かめます。", tone: "plain" }
    case "check_state_rounds": {
      const where = from(step.claim.args[0], normalized, labels)
      return checked(
        step,
        `${where}以降の期待ラウンド ${rounds(arg(step, 2))} は、振分ごとの合計と一致（式を満たす）`,
        `${where}以降の期待ラウンド ${rounds(arg(step, 2))} は、振分ごとの合計 ${rounds(arg(step, 1))} と食い違っています（式を満たしません）`,
      )
    }
    case "check_state_balls": {
      const where = from(step.claim.args[0], normalized, labels)
      return checked(
        step,
        `${where}以降の期待出玉 ${balls(arg(step, 2))} は、振分ごとの合計と一致（式を満たす）`,
        `${where}以降の期待出玉 ${balls(arg(step, 2))} は、振分ごとの合計 ${balls(arg(step, 1))} と食い違っています（式を満たしません）`,
      )
    }
    case "long_run":
      return { text: "遊タイムのある機種で、通常時がどう始まるかの長期の割合を確かめます。", tone: "plain" }
    case "check_endings":
      return checked(
        step,
        `連チャンの途中の各地点から、通常時の各始まり方に行き着く確率 ${arg(step, 0) ?? "--"}件は、どれも自身の式を満たす`,
        `連チャンの途中の各地点から、通常時の各始まり方に行き着く確率 ${arg(step, 0) ?? "--"}件のうち ${arg(step, 1) ?? "--"}件が、自身の式を満たしません`,
      )
    case "check_points":
      return checked(step, `その ${arg(step, 0) ?? "--"}地点のどこからも、どれかの始まり方に必ず行き着く（確率の合計 100%）`, `連チャンの途中の ${arg(step, 0) ?? "--"}地点のうち ${arg(step, 1) ?? "--"}地点で、始まり方に行き着く確率の合計が 100% になりません`)
    case "check_weight": {
      const kind = restartText(step.claim.args[0])
      return checked(
        step,
        `通常時が${kind}割合 ${percent(arg(step, 2))} は、各始まり方から流れ込む割合の合計と一致（式を満たす）`,
        `通常時が${kind}割合 ${percent(arg(step, 2))} は、各始まり方から流れ込む割合の合計 ${percent(arg(step, 1))} と食い違っています（式を満たしません）`,
      )
    }
    case "check_fills": {
      const where = from(step.claim.args[0], normalized, labels)
      return checked(step, `${where}が遊タイムまでの回転数に数える ${arg(step, 2) ?? "--"}回転は期待値基礎値どおり`, `${where}が遊タイムまでの回転数に数える ${arg(step, 2) ?? "--"}回転が、期待値基礎値の ${arg(step, 1) ?? "--"}回転と違います`)
    }
    case "check_weights":
      return checked(step, "通常時の始まり方の割合は合計 100%", `通常時の始まり方の割合の合計が ${percent(arg(step, 0))} で、100% になりません`)
    case "chain":
      return { text: "解いた状態遷移そのものを確かめます。", tone: "plain" }
    case "check_shares": {
      const where = from(step.claim.args[0], normalized, labels)
      return checked(step, `${where}の振分は合計 100%`, `${where}の振分の合計が ${percent(arg(step, 1))} で、100% になりません`)
    }
    case "check_ends": {
      const stuck = step.claim.args[0]
      const names = Array.isArray(stuck) ? stuck.map((index) => from(index, normalized, labels)).join("・") : "--"
      return checked(step, "どの状態からも通常時に戻れる（連チャンは必ず終わるので、式を満たす値はひとつに決まる）", `通常時に戻れない状態があります（${names}）。連チャンが終わらないので、数字は決まりません`)
    }
    case "made":
      return { text: "期待値基礎値から状態遷移を組み立て直して、解いた状態遷移と突き合わせます。", tone: "plain" }
    case "check_regular":
      return checked(step, `通常時の大当り確率 ${oneIn(arg(step, 1))} は期待値基礎値どおり`, `通常時の大当り確率 ${oneIn(arg(step, 1))} が、期待値基礎値の ${oneIn(arg(step, 0))} と違います`)
    case "check_made": {
      const where = from(step.claim.args[0], normalized, labels)
      return checked(step, `${where}の振分と行き先は期待値基礎値どおり`, `${where}の振分と行き先が、期待値基礎値から組み立てたものと違います`)
    }
    case "check_relief_drive": {
      const [made, stored] = step.claim.args
      const none = Array.isArray(made) && made.length === 0 && Array.isArray(stored) && stored.length === 0
      return none ? undefined : checked(step, "遊タイムの回転数と行き先は期待値基礎値どおり", "遊タイムの回転数か行き先が、期待値基礎値と違います")
    }
    case "reach_special_time": {
      const kind = compoundOf(givenIn(step, "spec_mode")?.args[1], "special_time", 2)
      const hit = numberOf(kind?.args[1])
      return { text: `${modeAt(step.claim.args[0], labels)}：次の大当りまで続く確率 ${percent(arg(step, 1))} ＝ 1 −（1 − ${oneIn(hit === undefined ? undefined : 1 / hit)}）の ${numberOf(kind?.args[0]) ?? "--"}乗（ST）`, tone: "plain" }
    }
    case "reach_rapid":
    case "reach_leftover_queue": {
      const kind = givenIn(step, "spec_mode")?.args[1]
      const spins = numberOf(compoundOf(kind, "rapid", 1)?.args[0] ?? compoundOf(kind, "leftover_queue", 1)?.args[0])
      const hit = givenNumber(step, "spec_regular", 0)
      return {
        text: `${modeAt(step.claim.args[0], labels)}：大当りを引く確率 ${percent(arg(step, 1))} ＝ 1 −（1 − ${oneIn(hit === undefined ? undefined : 1 / hit)}）の ${spins ?? "--"}乗（${step.rule === "reach_rapid" ? "時短" : "残保留"}）`,
        tone: "plain",
      }
    }
    case "reach_rushing":
      return { text: `${modeAt(step.claim.args[0], labels)}：継続率 ${percent(arg(step, 1))}（期待値基礎値のまま）`, tone: "plain" }
    case "reach_until_hit":
      return { text: `${modeAt(step.claim.args[0], labels)}：次の大当りまで必ず続く`, tone: "plain" }
    case "unverified_wide_margin": {
      const wide = compoundOf(step.claim.args[0], "wide_margin", 2)
      return { text: `未確認：推定値の誤差幅（±${numberOf(wide?.args[1])?.toFixed(2) ?? "--"}）が広く、厳密解との照合ではほとんど何も確かめられません`, tone: "unverified" }
    }
    case "odd_empty_share":
      return { text: `気になる点：${from(compoundOf(step.claim.args[0], "empty_share", 1)?.args[0], normalized, labels)}に 0% の振分があります`, tone: "odd" }
    case "odd_no_gain":
      return { text: `気になる点：1ラウンドで玉が増えません（賞球 × カウント − カウント ＝ ${numberOf(compoundOf(step.claim.args[0], "no_gain", 1)?.args[0]) ?? "--"}玉）`, tone: "odd" }
    case "odd_relief_drive_likely":
      return { text: `気になる点：大当りより先に遊タイムへ届くほうが多い計算です（到達率 ${percent(numberOf(compoundOf(step.claim.args[0], "relief_drive_likely", 1)?.args[0]))}）`, tone: "odd" }
    default:
      return undefined
  }
}

/** What could not be proved, by the part of the grounds that was attempted; none for the remarks, which only add to what is said. */
const unprovedLine = (goal: Term): Omit<GroundsLine, "depth"> | undefined => {
  const figure = atomOf(compoundOf(goal, "figure", 2)?.args[0])
  if (figure !== undefined) return { text: `${figureName(figure)}を、期待値基礎値から導けませんでした`, tone: "fails" }
  switch (atomOf(goal)) {
    case "solution":
      return { text: "計算エンジンが解いた値を、確かめられませんでした", tone: "fails" }
    case "chain":
      return { text: "解いた状態遷移を、確かめられませんでした", tone: "fails" }
    case "made":
      return { text: "期待値基礎値から状態遷移を、組み立て直せませんでした", tone: "fails" }
    default:
      return undefined
  }
}

/**
 * A proof of a formula's figures as lines to read, each step under the one it
 * supports: the figure, how it was worked out, what each share of an
 * allotment adds, the checks with whether they held, what was taken
 * unchecked and what no real machine would show. A part that could not be
 * proved is said so in its place. A conclusion reached twice is said once.
 * `labels` names each mode as the spec does, in the spec's order.
 */
export const groundsLines = (proof: Proof, normalized: NormalizedSpecDto, labels: ReadonlyMap<string, string>): readonly GroundsLine[] => {
  type Walked = { readonly lines: readonly GroundsLine[]; readonly said: ReadonlySet<string> }
  const walk = (part: Step | (Proof & { readonly type: "unproved" }), depth: number, said: ReadonlySet<string>): Walked => {
    if (part.type === "unproved") {
      const line = unprovedLine(part.goal)
      return { lines: line === undefined ? [] : [{ ...line, depth }], said }
    }
    const key = `${part.rule}:${JSON.stringify(part.claim)}`
    if (said.has(key)) return { lines: [], said }
    const line = lineOf(part, normalized, labels)
    const below = partsUnder(part).reduce<Walked>(
      (sofar, inner) => {
        const walked = walk(inner, line === undefined ? depth : depth + 1, sofar.said)
        return { lines: [...sofar.lines, ...walked.lines], said: walked.said }
      },
      { lines: [], said: new Set([...said, key]) },
    )
    return { lines: line === undefined ? below.lines : [{ ...line, depth }, ...below.lines], said: below.said }
  }
  return proof.type === "step" ? walk(proof, 0, new Set()).lines : []
}

/**
 * What a formula's grounds come to, in a sentence: the worst of what was
 * found — a disagreement or a part unproved, then something no real machine
 * would show, then something taken unchecked — or that every check held.
 */
export const groundsStanding = (proof: Proof): Omit<GroundsLine, "depth"> => {
  const tally = tallyOf(findingsIn(proof))
  if (tally.fails + tally.unproved > 0) {
    const parts = [...(tally.fails === 0 ? [] : [`食い違いが ${tally.fails}件`]), ...(tally.unproved === 0 ? [] : [`証明できなかった箇所が ${tally.unproved}件`])]
    return { text: `${parts.join("、")}あります。この算出条件の数字は、期待値基礎値から導ける数字ではありません。`, tone: "fails" }
  }
  const checks = `検算 ${tally.holds}件はすべて一致しました`
  if (tally.odd > 0) return { text: `${checks}が、実機ではまず見ない点が ${tally.odd}件あります。計算は合っていても、期待値基礎値そのものを疑ってください。`, tone: "odd" }
  if (tally.unverified > 0) return { text: `${checks}。ただし、確かめていない点が ${tally.unverified}件あります。`, tone: "unverified" }
  return { text: `${checks}。`, tone: "holds" }
}
