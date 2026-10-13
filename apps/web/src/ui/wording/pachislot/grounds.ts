import { findingsIn, givenIn, partsUnder, standingOf, stepsUnder, tallyOf, type Proof } from "../../../core/grounds/proof"
import { atomOf, compoundOf, numberOf, type Term } from "../../../core/grounds/term"

/** How a line of reasoned grounds is to be taken: said plainly, a check that held or failed, a figure taken unchecked, or something guessed to be out of the ordinary. */
export type GroundsTone = "plain" | "holds" | "fails" | "unverified" | "odd"

/** One line of reasoned grounds: what it says, how deep under the line above, and how it is to be taken. */
export interface GroundsLine {
  readonly text: string
  readonly depth: number
  readonly tone: GroundsTone
}

type Step = Proof & { readonly type: "step" }

const trimmed = (value: number, digits: number): string => value.toFixed(digits).replace(/\.?0+$/, "")

const medals = (value: number | undefined): string => (value === undefined ? "--" : `${trimmed(value, 1)}枚`)

const perGame = (value: number | undefined): string => (value === undefined ? "--" : `${trimmed(value, 3)}枚`)

const games = (value: number | undefined): string => (value === undefined ? "--" : `${trimmed(value, 1)}G`)

const rate = (value: number | undefined): string => (value === undefined ? "--" : `${trimmed(value * 100, 2)}%`)

const arg = (step: Step | undefined, index: number): number | undefined => numberOf(step?.claim.args[index])

const givenNumber = (step: Step, functor: string, index: number): number | undefined => numberOf(givenIn(step, functor)?.args[index])

/** The numbers a step worked out, in the order it did. */
const computedIn = (step: Step): readonly number[] => step.premises.flatMap((premise) => (premise.type === "computed" ? [premise.value] : []))

/** The AT's 純増 a step reasoned from: its own, or over all its medals. */
const netIn = (step: Step): number | undefined => arg(stepsUnder(step).find((inner) => inner.rule === "net_single" || inner.rule === "net_over_all"), 0)

const lossIn = (step: Step): number | undefined => arg(stepsUnder(step).find((inner) => inner.rule === "loss_per_game"), 0)

const oneIn = (chance: number | undefined): string => (chance === undefined || chance <= 0 ? "--" : `1/${trimmed(1 / chance, 1)}`)

/** The regular games a cycle lasts, as a step reasoned them or took them. */
const cycleIn = (step: Step): number | undefined => arg(stepsUnder(step).find((inner) => inner.rule === "cycle_from_first_hit" || inner.rule === "cycle_to_at_ceiling"), 1)

/** What a check against the engine was of, and the engine's figure as it is said. */
const engineFigure = (step: Step): string => {
  const figure = step.claim.args[0]
  const engine = numberOf(step.claim.args[2])
  if (atomOf(figure) === "net") return `AT全体の純増 ${perGame(engine)}`
  if (compoundOf(figure, "cycle_games", 1) !== undefined) return `1周期の通常ゲーム数 ${games(engine)}`
  if (compoundOf(figure, "completion", 1) !== undefined) return `上限到達率 ${rate(engine)}`
  return compoundOf(figure, "gain", 1) !== undefined ? `平均獲得枚数 ${medals(engine)}` : `機械割 ${rate(engine)}`
}

/** A check's line: what it found where it held, and what is wrong where it did not. */
const checked = (step: Step, held: string, failed: string): Omit<GroundsLine, "depth"> => {
  const holds = standingOf(step) === "holds"
  return { text: `検算：${holds ? held : failed}`, tone: holds ? "holds" : "fails" }
}

/** What one step of the proof says, in the words of an analysis sheet; none for steps the line above already says. */
const lineOf = (step: Step): Omit<GroundsLine, "depth"> | undefined => {
  switch (step.rule) {
    case "grounds":
      return { text: "この算出条件の数字は、設定ごとに次のように導かれます。", tone: "plain" }
    case "level":
      return { text: `設定${arg(step, 0) ?? "--"}`, tone: "plain" }
    case "gain_from_rate": {
      const bet = givenNumber(step, "bet", 0)
      const stated = rate(givenNumber(step, "stated_rate", 1))
      return {
        text: `ATの平均獲得枚数 ${medals(arg(step, 1))} ＝ 通常 ${games(cycleIn(step))} ×（1G ${bet ?? "--"}枚 ×（機械割 ${stated} − 1）＋ 1Gの減り ${perGame(lossIn(step))}）÷（1 ＋ ${bet ?? "--"}枚 ×（1 − 機械割 ${stated}）÷ 純増 ${perGame(netIn(step))}）`,
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
      return { text: `ATの平均獲得枚数 ${medals(arg(step, 1))}（計算エンジンが有利区間の上限を入れて解いた値）`, tone: "plain" }
    case "gain_under_cap":
      return { text: `ATの平均獲得枚数 ${medals(arg(step, 1))}（有利区間の上限あり：持ち越した枚数ごとにATが始まる頻度を0枚から順に積み上げ、上限までの残りで頭打ちにして平均）`, tone: "plain" }
    case "capped":
      return { text: `上限 ${numberOf(givenIn(step, "cap")?.args[0]) ?? "--"}枚に届くATの割合 ${rate(arg(step, 2))}`, tone: "plain" }
    case "gain_fixed":
      return { text: `ATの平均獲得枚数 ${medals(arg(step, 1))}（解析値のまま）`, tone: "plain" }
    case "gain_in_sets": {
      const sets = compoundOf(givenIn(step, "law")?.args[1], "sets", 3)
      const carry = rate(numberOf(sets?.args[2]))
      return { text: `ATの平均獲得枚数 ${medals(arg(step, 1))} ＝ 初回 ${medals(numberOf(sets?.args[0]))} ＋ 1セット ${medals(numberOf(sets?.args[1]))} × 継続率 ${carry} ÷（1 − 継続率 ${carry}）`, tone: "plain" }
    }
    case "gain_by_table":
      return { text: `ATの平均獲得枚数 ${medals(arg(step, 1))} ＝ 獲得枚数 × その割合 の合計`, tone: "plain" }
    case "table_part": {
      const row = givenIn(step, "payout_row")
      return { text: `${medals(numberOf(row?.args[1]))} × ${rate(numberOf(row?.args[2]))} ＝ ${medals(arg(step, 1))}`, tone: "plain" }
    }
    case "cycle_from_first_hit": {
      const triggers = arg(stepsUnder(step).find((inner) => inner.rule.startsWith("won_")), 1)
      return {
        text:
          triggers === 1
            ? `1周期の通常ゲーム数 ${games(arg(step, 1))} ＝ 1 ÷ 初当たり ${oneIn(givenNumber(step, "first_hit", 1))}`
            : `1周期の通常ゲーム数 ${games(arg(step, 1))} ＝ ATまでのCZ ${trimmed(triggers ?? 0, 3)}回 ÷ CZの初当たり ${oneIn(givenNumber(step, "first_hit", 1))}`,
        tone: "plain",
      }
    }
    case "cycle_to_at_ceiling":
      return { text: `1周期の通常ゲーム数 ${games(arg(step, 1))}（AT間天井で打ち切られる周期）`, tone: "plain" }
    case "cycle_cut":
      return {
        text: `トリガー確率 ${oneIn(givenNumber(step, "chance", 1))} で1ゲームずつ追うと、1周期は通常 ${games(arg(step, 1))}・トリガー ${trimmed(arg(step, 2) ?? 0, 3)}回（AT間天井 ${givenNumber(step, "at_ceiling", 0) ?? "--"}G まで、各ゲームでまだATに当たっていない確率を足し上げ）`,
        tone: "plain",
      }
    case "cycle_free": {
      const [between] = computedIn(step).slice(-1)
      return { text: `トリガー確率 ${oneIn(givenNumber(step, "chance", 1))} で、1周期は通常 ${games(between)}・トリガー ${trimmed(arg(step, 2) ?? 0, 3)}回（天井込みのトリガー間ゲーム数 × トリガー回数）`, tone: "plain" }
    }
    case "won_by_success":
      return { text: `ATまでのCZ ${trimmed(arg(step, 1) ?? 0, 3)}回 ＝ 1 ÷ CZ成功率 ${rate(givenNumber(step, "success", 1))}`, tone: "plain" }
    case "won_within_misses": {
      const success = rate(givenNumber(step, "success", 1))
      const misses = givenNumber(step, "misses", 0)
      return { text: `ATまでのCZ ${trimmed(arg(step, 1) ?? 0, 3)}回 ＝（1 −（1 − CZ成功率 ${success}）の ${(misses ?? 0) + 1}乗）÷ CZ成功率 ${success}（${misses ?? "--"}回スルーで次は当選）`, tone: "plain" }
    }
    case "won_on_the_last_miss":
      return { text: `ATまでのCZ ${trimmed(arg(step, 1) ?? 0, 3)}回（CZ成功率 0%：スルー天井でだけ当選）`, tone: "plain" }
    case "loss_per_game":
      return { text: `通常時1Gあたりの減り ${perGame(arg(step, 0))} ＝ 50枚 ÷ ベース ${games(givenNumber(step, "base", 0))}`, tone: "plain" }
    case "rate": {
      const [atGames, staked, out] = computedIn(step)
      return {
        text: `機械割 ${rate(arg(step, 1))} ＝ 払い出し ${medals(out)} ÷ 投入 ${medals(staked)}（ATからATまで：通常 ${games(cycleIn(step))} ＋ AT ${games(atGames)}、どちらも1G ${givenNumber(step, "bet", 0) ?? "--"}枚）`,
        tone: "plain",
      }
    }
    case "check_engine":
      return checked(step, `計算エンジンの${engineFigure(step)} と一致`, `計算エンジンの${engineFigure(step)} と食い違っています`)
    case "check_chance": {
      const published = oneIn(numberOf(step.claim.args[2]))
      return checked(step, `計算エンジンが逆算したトリガー確率を戻すと、解析値の初当たり ${published} になる`, `計算エンジンが逆算したトリガー確率を戻すと初当たり ${oneIn(numberOf(step.claim.args[1]))} になり、解析値の ${published} になりません`)
    }
    case "check_stored": {
      const stored = rate(numberOf(step.claim.args[2]))
      return checked(step, `保存されている機械割 ${stored} と一致`, `保存されている機械割 ${stored} と食い違っています。古い計算エンジンで作られたか、数字が書き換えられています`)
    }
    case "check_sample": {
      const sampled = `${rate(numberOf(step.claim.args[2]))}（±${trimmed((numberOf(step.claim.args[3]) ?? 0) * 100, 2)}%）`
      return checked(step, `保存された推定の機械割 ${sampled}は厳密解の範囲内`, `保存された推定の機械割 ${sampled}は厳密解から外れています。数字が書き換えられているかもしれません`)
    }
    case "check_stated": {
      const stated = rate(numberOf(step.claim.args[2]))
      return checked(step, `入力された機械割 ${stated} に戻る`, `入力された機械割 ${stated} に戻りません。有利区間の上限で獲得が削られているかもしれません`)
    }
    case "unverified_capped_gain":
      return { text: `未確認：有利区間の上限（${numberOf(compoundOf(step.claim.args[0], "capped_gain", 1)?.args[0]) ?? "--"}枚）のもとでのATの平均獲得枚数は、計算エンジンが解いた値をそのまま使っています。ATの獲得が引き戻し中の減りより小さいことがあり、ここでは積み上げられません`, tone: "unverified" }
    case "unverified_completion":
      return { text: "未確認：上限に届くATの割合は、計算エンジンが解いた値をそのまま使っています。ATの獲得枚数を機械割から導く機種では、ここでは確かめられません", tone: "unverified" }
    case "odd_loss_beyond_bet": {
      const beyond = compoundOf(step.claim.args[0], "loss_beyond_bet", 2)
      return { text: `気になる点：通常時1Gで、賭けた ${numberOf(beyond?.args[1]) ?? "--"}枚より多い ${perGame(numberOf(beyond?.args[0]))} が減る計算です`, tone: "odd" }
    }
    case "odd_no_gain": {
      const none = compoundOf(step.claim.args[0], "no_gain", 2)
      return { text: `気になる点：設定${numberOf(none?.args[0]) ?? "--"}のATで、メダルが増えません（平均獲得 ${medals(numberOf(none?.args[1]))}）`, tone: "odd" }
    }
    default:
      return undefined
  }
}

/** What could not be proved: a setting level's figures; none for the remarks, which only add to what is said. */
const unprovedLine = (goal: Term): Omit<GroundsLine, "depth"> | undefined => {
  const level = numberOf(compoundOf(goal, "level", 3)?.args[0])
  return level === undefined ? undefined : { text: `設定${level}の機械割を、解析値から導けませんでした`, tone: "fails" }
}

/**
 * A proof of an AT machine's figures as lines to read, each step under the
 * one it supports: under each setting level, what the AT gains and from
 * what, how the 機械割 comes of it, the checks with whether they held, what
 * was taken unchecked and what is guessed to be out of the ordinary. A setting level
 * that could not be proved is said so in its place. A conclusion reached
 * twice is said once.
 */
export const groundsLines = (proof: Proof): readonly GroundsLine[] => {
  type Walked = { readonly lines: readonly GroundsLine[]; readonly said: ReadonlySet<string> }
  const walk = (part: Step | (Proof & { readonly type: "unproved" }), depth: number, said: ReadonlySet<string>): Walked => {
    if (part.type === "unproved") {
      const line = unprovedLine(part.goal)
      return { lines: line === undefined ? [] : [{ ...line, depth }], said }
    }
    const key = `${part.rule}:${JSON.stringify(part.claim)}`
    if (said.has(key)) return { lines: [], said }
    const line = lineOf(part)
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
 * What an AT machine's grounds come to, in a sentence: the worst of what
 * was found — a disagreement or a setting level unproved, then something
 * guessed to be out of the ordinary, then something taken unchecked — or that every
 * check held.
 */
export const groundsStanding = (proof: Proof): Omit<GroundsLine, "depth"> => {
  const tally = tallyOf(findingsIn(proof))
  if (tally.fails + tally.unproved > 0) {
    const parts = [...(tally.fails === 0 ? [] : [`食い違いが ${tally.fails}件`]), ...(tally.unproved === 0 ? [] : [`証明できなかった箇所が ${tally.unproved}件`])]
    return { text: `${parts.join("、")}あります。この算出条件の数字は、解析値から導ける数字ではありません。`, tone: "fails" }
  }
  const checks = `検算 ${tally.holds}件はすべて一致しました`
  if (tally.odd > 0) return { text: `${checks}が、珍しいとみている点が ${tally.odd}件あります。珍しいかどうかは推測で、確かめたものではありません。解析値を見直してください。`, tone: "odd" }
  if (tally.unverified > 0) return { text: `${checks}。ただし、確かめていない点が ${tally.unverified}件あります。`, tone: "unverified" }
  return { text: `${checks}。`, tone: "holds" }
}
