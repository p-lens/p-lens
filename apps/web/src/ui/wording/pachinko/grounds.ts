import type { NormalizedSpecDto } from "@p-lens/contracts/pachinko"

import { givenIn, stepsUnder, type Proof } from "../../../core/grounds/proof"
import { atomOf, compoundOf, numberOf, type Term } from "../../../core/grounds/term"
import { oneInText } from "./formula"

/** One line of reasoned grounds: what it says, how deep under the line above, and whether it is a check that held or failed. */
export interface GroundsLine {
  readonly text: string
  readonly depth: number
  readonly tone: "plain" | "holds" | "fails"
}

type Step = Proof & { readonly type: "step" }

const rounds = (value: number | undefined): string => (value === undefined ? "—" : `${value.toFixed(2).replace(/\.?0+$/, "")}R`)

const balls = (value: number | undefined): string => (value === undefined ? "—" : `${value.toFixed(1).replace(/\.0$/, "")}玉`)

const percent = (value: number | undefined): string => (value === undefined ? "—" : `${(value * 100).toFixed(1)}%`)

const oneIn = (value: number | undefined): string => (value === undefined ? "—" : oneInText(value))

const spins = (value: number | undefined): string => (value === undefined ? "—" : `${value.toFixed(1)}回転`)

const arg = (step: Step | undefined, index: number): number | undefined => numberOf(step?.claim.args[index])

const sub = (step: Step, rule: string): Step | undefined => stepsUnder(step).find((inner) => inner.rule === rule)

const givenNumber = (step: Step, functor: string, index: number): number | undefined => numberOf(givenIn(step, functor)?.args[index])

/** Where a share leads, as the person wrote the spec: back to the regular game, or into a mode by its label. */
const destination = (target: Term | undefined, normalized: NormalizedSpecDto, labels: ReadonlyMap<string, string>): string => {
  if (atomOf(target) === "end") return "通常へ"
  const index = numberOf(compoundOf(target, "state", 1)?.args[0])
  const origin = index === undefined ? undefined : normalized.origins[index]
  if (origin === undefined) return "—"
  const label = labels.get(origin.mode) ?? origin.mode
  return origin.combo === 1 ? label : `${label}（${origin.combo}連目）`
}

/** A way of starting regular play again, as a player would say it. */
const restartText = (kind: Term | undefined): string => {
  if (atomOf(kind) === "spent") return "遊タイム消化済みで始まる（次の大当りまで発動なし）"
  const filled = numberOf(compoundOf(kind, "filled", 1)?.args[0])
  return filled === undefined ? "—" : filled === 0 ? "0回転から始まる" : `時短・残保留の分 ${filled}回転たまって始まる`
}

const checkedFigure = (figure: string | undefined, engine: number | undefined): string =>
  figure === "round_chance" ? oneIn(engine) : figure === "payout_per_round" ? balls(engine) : String(engine ?? "—")

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
        text: `遊タイムまで残り ${computed.at(0) ?? "—"}回転：到達率 ${percent(computed.at(1))}（＝（1 − 1/${givenNumber(step, "regular_one_in", 0)?.toFixed(1) ?? "—"}）の ${computed.at(0) ?? "—"}乗）、通常回転 ${spins(arg(step, 1))}・ラウンド ${rounds(arg(step, 2))}`,
        tone: "plain",
      }
    }
    case "cycle_spent":
      return { text: `遊タイムは次の大当りまで来ない：初当りまで ${spins(arg(step, 1))}・ラウンド ${rounds(arg(step, 2))}`, tone: "plain" }
    case "rounds_per_first_hit":
      return { text: `初当り1回あたりの平均ラウンド ${rounds(arg(step, 0))} ＝ 振分ごとの合計`, tone: "plain" }
    case "allotted": {
      const entry = givenIn(step, "entry")
      const share = numberOf(entry?.args[0])
      const after = arg(sub(step, "into_mode"), 1) ?? 0
      return { text: `${percent(share)}・${numberOf(entry?.args[1]) ?? "—"}R・${destination(entry?.args[2], normalized, labels)}：（${numberOf(entry?.args[1]) ?? "—"}R ＋ その後 ${rounds(after)}）× ${percent(share)} ＝ ${rounds(arg(step, 0))}`, tone: "plain" }
    }
    case "into_mode":
      return { text: `${destination(step.claim.args[0], normalized, labels)}以降の期待ラウンド ${rounds(arg(step, 1))}（計算エンジンが状態遷移を解いた値）`, tone: "plain" }
    case "payout_from_spec": {
      const count = givenNumber(step, "payout", 1)
      return { text: `1R平均出玉 ${arg(step, 0) ?? "—"}玉 ＝ 賞球 ${givenNumber(step, "payout", 0) ?? "—"} × カウント ${count ?? "—"} − カウント ${count ?? "—"}`, tone: "plain" }
    }
    case "payout_measured":
      return { text: `1R平均出玉 ${arg(step, 0) ?? "—"}玉（実測）`, tone: "plain" }
    case "payout_by_share": {
      const scale = givenNumber(step, "payout_scale", 0)
      return {
        text: `1R平均出玉 ${balls(arg(step, 0))} ＝ 出玉 ${balls(arg(sub(step, "balls_per_cycle") ?? sub(step, "balls_per_cycle_with_relief_drive"), 0))} ÷ ラウンド ${rounds(arg(sub(step, "rounds_per_cycle") ?? sub(step, "rounds_per_cycle_with_relief_drive"), 0))}${scale === undefined || scale === 1 ? "" : ` × 実測の比率 ${scale.toFixed(3)}`}（振分ごとに賞球やカウントが違うので、全ラウンドの平均）`,
        tone: "plain",
      }
    }
    case "balls_per_first_hit":
      return { text: `初当り1回あたりの平均出玉 ${balls(arg(step, 0))} ＝ 振分ごとの合計`, tone: "plain" }
    case "paid": {
      const entry = givenIn(step, "entry_pays")
      const share = numberOf(entry?.args[0])
      const after = arg(sub(step, "balls_into_mode"), 1) ?? 0
      return { text: `${percent(share)}・${balls(numberOf(entry?.args[1]))}・${destination(entry?.args[2], normalized, labels)}：（${balls(numberOf(entry?.args[1]))} ＋ その後 ${balls(after)}）× ${percent(share)} ＝ ${balls(arg(step, 0))}`, tone: "plain" }
    }
    case "balls_into_mode":
      return { text: `${destination(step.claim.args[0], normalized, labels)}以降の期待出玉 ${balls(arg(step, 1))}（計算エンジンが状態遷移を解いた値）`, tone: "plain" }
    case "weighted_balls":
      return { text: `通常時が${restartText(step.claim.args[0])}（${percent(arg(step, 1))}）：出玉 ${balls(arg(step, 2))}（割合を掛けた値）`, tone: "plain" }
    case "check_engine": {
      const holds = atomOf(step.claim.args[3]) === "holds"
      const engine = numberOf(step.claim.args[2])
      return { text: holds ? `検算：計算エンジンの答え ${checkedFigure(atomOf(step.claim.args[0]), engine)} と一致` : `検算：計算エンジンの答え ${checkedFigure(atomOf(step.claim.args[0]), engine)} と食い違っています`, tone: holds ? "holds" : "fails" }
    }
    case "check_sample": {
      const holds = atomOf(step.claim.args[3]) === "holds"
      const sampled = `${oneIn(numberOf(step.claim.args[1]))}（±${numberOf(step.claim.args[2])?.toFixed(2) ?? "—"}）`
      return {
        text: holds ? `検算：保存された推定値 ${sampled}は厳密解の範囲内` : `検算：保存された推定値 ${sampled}は厳密解から外れています。数字が書き換えられているかもしれません`,
        tone: holds ? "holds" : "fails",
      }
    }
    default:
      return undefined
  }
}

/**
 * A proof of a formula's figures as lines to read, each step under the one it
 * supports: the figure, how it was worked out, what each share of an
 * allotment adds, and the checks with whether they held. A conclusion
 * reached twice is said once. `labels` names each mode as the spec does.
 */
export const groundsLines = (proof: Proof, normalized: NormalizedSpecDto, labels: ReadonlyMap<string, string>): readonly GroundsLine[] => {
  type Walked = { readonly lines: readonly GroundsLine[]; readonly said: ReadonlySet<string> }
  const walk = (step: Step, depth: number, said: ReadonlySet<string>): Walked => {
    const key = `${step.rule}:${JSON.stringify(step.claim)}`
    if (said.has(key)) return { lines: [], said }
    const line = lineOf(step, normalized, labels)
    const below = stepsUnder(step).reduce<Walked>(
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
