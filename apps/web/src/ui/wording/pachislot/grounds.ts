import { givenIn, stepsUnder, type Proof } from "../../../core/grounds/proof"
import { atomOf, compoundOf, numberOf } from "../../../core/grounds/term"

/** One line of reasoned grounds: what it says, how deep under the line above, and whether it is a check that held or failed. */
export interface GroundsLine {
  readonly text: string
  readonly depth: number
  readonly tone: "plain" | "holds" | "fails"
}

type Step = Proof & { readonly type: "step" }

const trimmed = (value: number, digits: number): string => value.toFixed(digits).replace(/\.?0+$/, "")

const medals = (value: number | undefined): string => (value === undefined ? "—" : `${trimmed(value, 1)}枚`)

const perGame = (value: number | undefined): string => (value === undefined ? "—" : `${trimmed(value, 3)}枚`)

const games = (value: number | undefined): string => (value === undefined ? "—" : `${trimmed(value, 1)}G`)

const rate = (value: number | undefined): string => (value === undefined ? "—" : `${trimmed(value * 100, 2)}%`)

const arg = (step: Step | undefined, index: number): number | undefined => numberOf(step?.claim.args[index])

const givenNumber = (step: Step, functor: string, index: number): number | undefined => numberOf(givenIn(step, functor)?.args[index])

/** The numbers a step worked out, in the order it did. */
const computedIn = (step: Step): readonly number[] => step.premises.flatMap((premise) => (premise.type === "computed" ? [premise.value] : []))

/** The AT's 純増 a step reasoned from: its own, or over all its medals. */
const netIn = (step: Step): number | undefined => arg(stepsUnder(step).find((inner) => inner.rule === "net_single" || inner.rule === "net_over_all"), 0)

const lossIn = (step: Step): number | undefined => arg(stepsUnder(step).find((inner) => inner.rule === "loss_per_game"), 0)

/** What a check against the engine was of, and the engine's figure as it is said. */
const engineFigure = (step: Step): string => {
  const figure = step.claim.args[0]
  const engine = numberOf(step.claim.args[2])
  if (atomOf(figure) === "net") return `AT全体の純増 ${perGame(engine)}`
  return compoundOf(figure, "gain", 1) !== undefined ? `平均獲得枚数 ${medals(engine)}` : `機械割 ${rate(engine)}`
}

/** What one step of the proof says, in the words of an analysis sheet; none for steps the line above already says. */
const lineOf = (step: Step): Omit<GroundsLine, "depth"> | undefined => {
  switch (step.rule) {
    case "grounds":
      return { text: "この算出条件の数字は、設定ごとに次のように導かれます。", tone: "plain" }
    case "level":
      return { text: `設定${arg(step, 0) ?? "—"}`, tone: "plain" }
    case "gain_from_rate": {
      const bet = givenNumber(step, "bet", 0)
      const stated = rate(givenNumber(step, "stated_rate", 1))
      return {
        text: `ATの平均獲得枚数 ${medals(arg(step, 1))} ＝ 通常 ${games(givenNumber(step, "cycle_games", 1))} ×（1G ${bet ?? "—"}枚 ×（機械割 ${stated} − 1）＋ 1Gの減り ${perGame(lossIn(step))}）÷（1 ＋ ${bet ?? "—"}枚 ×（1 − 機械割 ${stated}）÷ 純増 ${perGame(netIn(step))}）`,
        tone: "plain",
      }
    }
    case "net_over_all": {
      const [shared] = computedIn(step)
      const own = `${trimmed((1 - (shared ?? 0)) * 100, 2)}% ÷ ${perGame(givenNumber(step, "net_per_game", 0))}`
      const others = stepsUnder(step).filter((inner) => inner.rule === "other_games").map((inner) => `${trimmed((arg(inner, 0) ?? 0) * 100, 2)}% ÷ ${perGame(givenNumber(inner, "other_net", 0))}`)
      return { text: `AT全体の純増 ${perGame(arg(step, 0))} ＝ 1 ÷（${[own, ...others].join(" ＋ ")}）（獲得枚数の割合ごとに、同じ枚数にかかるゲーム数を合わせる）`, tone: "plain" }
    }
    case "gain_solved":
      return { text: `ATの平均獲得枚数 ${medals(arg(step, 1))}（解析値から計算エンジンが解いた値）`, tone: "plain" }
    case "loss_per_game":
      return { text: `通常時1Gあたりの減り ${perGame(arg(step, 0))} ＝ 50枚 ÷ ベース ${games(givenNumber(step, "base", 0))}`, tone: "plain" }
    case "rate": {
      const [atGames, staked, out] = computedIn(step)
      return {
        text: `機械割 ${rate(arg(step, 1))} ＝ 払い出し ${medals(out)} ÷ 投入 ${medals(staked)}（ATからATまで：通常 ${games(givenNumber(step, "cycle_games", 1))} ＋ AT ${games(atGames)}、どちらも1G ${givenNumber(step, "bet", 0) ?? "—"}枚）`,
        tone: "plain",
      }
    }
    case "check_engine": {
      const holds = atomOf(step.claim.args[3]) === "holds"
      return { text: holds ? `検算：計算エンジンの${engineFigure(step)} と一致` : `検算：計算エンジンの${engineFigure(step)} と食い違っています`, tone: holds ? "holds" : "fails" }
    }
    case "check_stated": {
      const holds = atomOf(step.claim.args[3]) === "holds"
      const stated = rate(numberOf(step.claim.args[2]))
      return { text: holds ? `検算：入力された機械割 ${stated} に戻る` : `検算：入力された機械割 ${stated} に戻りません。有利区間の上限で獲得が削られているかもしれません`, tone: holds ? "holds" : "fails" }
    }
    default:
      return undefined
  }
}

/**
 * A proof of an AT machine's figures as lines to read, each step under the
 * one it supports: under each setting level, what the AT gains and from
 * what, how the 機械割 comes of it, and the checks with whether they held.
 * A conclusion reached twice is said once.
 */
export const groundsLines = (proof: Proof): readonly GroundsLine[] => {
  type Walked = { readonly lines: readonly GroundsLine[]; readonly said: ReadonlySet<string> }
  const walk = (step: Step, depth: number, said: ReadonlySet<string>): Walked => {
    const key = `${step.rule}:${JSON.stringify(step.claim)}`
    if (said.has(key)) return { lines: [], said }
    const line = lineOf(step)
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
