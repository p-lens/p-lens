import { findingsIn, givenIn, partsUnder, standingOf, stepsUnder, tallyOf, type Proof } from "../../../core/grounds/proof"
import { atomOf, compoundOf, numberOf, type Term } from "../../../core/grounds/term"
import type { GroundsNaming } from "../../../core/pachislot/grounds/naming"

/** How a line of reasoned grounds is to be taken: said plainly, a check that held or failed, a figure taken unchecked, or something guessed to be out of the ordinary. */
export type GroundsTone = "plain" | "holds" | "fails" | "unverified" | "odd"

/** A piece of a grounds line: words, or a figure substituted into them. */
export type GroundsPart = { readonly type: "words"; readonly text: string } | { readonly type: "figure"; readonly text: string }

/** One line of reasoned grounds: what it says, its figures told apart from its words, how deep under the line above, and how it is to be taken. */
export interface GroundsLine {
  readonly parts: readonly GroundsPart[]
  readonly depth: number
  readonly tone: GroundsTone
}

type Said = Omit<GroundsLine, "depth">

type Step = Proof & { readonly type: "step" }

/** A figure substituted into a line's words, set apart so that it can be shown in bold. */
export const figure = (text: string): GroundsPart => ({ type: "figure", text })

/** Words with no space left between a full-width bracket and the sign of equality beside it. */
const tight = (text: string): string => text.replace(/）\s+(?=[＝≈])/gu, "）").replace(/(?<=[＝≈])\s+（/gu, "（")

/** A line's parts from words and figures in reading order, adjacent words joined and empty ones left out. */
export const said = (...pieces: readonly (string | GroundsPart)[]): readonly GroundsPart[] =>
  pieces
    .map((piece): GroundsPart => (typeof piece === "string" ? { type: "words", text: piece } : piece))
    .filter((part) => part.text !== "")
    .reduce<readonly GroundsPart[]>((joined, part) => {
      const last = joined.at(-1)
      return last?.type === "words" && part.type === "words" ? [...joined.slice(0, -1), { type: "words", text: last.text + part.text }] : [...joined, part]
    }, [])
    .map((part) => (part.type === "words" ? { type: "words", text: tight(part.text) } : part))

/** A line as plain text, for tests and for a reader that cannot see bold. */
export const plainOf = (parts: readonly GroundsPart[]): string => parts.map((part) => part.text).join("")

const plain = (...pieces: readonly (string | GroundsPart)[]): Said => ({ parts: said(...pieces), tone: "plain" })

/** How a kind of figure is written: to so many digits, scaled, and with its unit. */
interface Measure {
  readonly digits: number
  readonly scale: number
  readonly unit: string
}

const MEDALS: Measure = { digits: 1, scale: 1, unit: "枚" }
const PER_GAME: Measure = { digits: 3, scale: 1, unit: "枚/G" }
const GAMES: Measure = { digits: 1, scale: 1, unit: "G" }
const RATE: Measure = { digits: 2, scale: 100, unit: "%" }
const RATIO: Measure = { digits: 4, scale: 1, unit: "" }
const TIMES: Measure = { digits: 3, scale: 1, unit: "回" }
const ODDS: Measure = { digits: 2, scale: 1, unit: "" }
const SPREAD: Measure = { digits: 5, scale: 1, unit: "" }
const GAMES_A_MEDAL: Measure = { digits: 4, scale: 1, unit: "G/枚" }
const WHOLE: Measure = { digits: 3, scale: 1, unit: "" }

/**
 * A value rounded to so many places, a half away from nought: a value
 * worked out to sit on a half, a hair either side of it by the float's
 * error, rounds the same way wherever it is written.
 */
export const rounded = (value: number, digits: number): number => {
  const scale = 10 ** digits
  const magnitude = Math.round(Math.abs(value) * scale * (1 + 1e-12) + 1e-9) / scale
  return value < 0 ? -magnitude : magnitude
}

const trimmed = (value: number, digits: number): string => {
  const text = rounded(value, digits).toFixed(digits)
  return text.includes(".") ? text.replace(/\.?0+$/, "") : text
}

/** A value as a measure writes it, or `--` where there is none to write. */
const told = (value: number | undefined, measure: Measure, digits: number = measure.digits): string =>
  value === undefined || !Number.isFinite(value) ? "--" : `${trimmed(value * measure.scale, digits)}${measure.unit}`

/** A value as a measure writes it, without its unit: a figure said again inside the same working. */
const bare = (value: number, measure: Measure): GroundsPart => figure(Number.isFinite(value) ? trimmed(value * measure.scale, measure.digits) : "--")

/** The value a reader sees where a measure writes it. */
const shownAt = (value: number, measure: Measure): number => rounded(value * measure.scale, measure.digits) / measure.scale

/** Whether working from the figures shown comes to the figure shown next. */
const near = (worked: number, value: number, measure: Measure): boolean =>
  Math.abs(worked - shownAt(value, measure)) <= ((0.5 * 10 ** -measure.digits) / measure.scale) * (1 + 1e-9) + 1e-12 * Math.abs(worked)

/** The sign between two steps of working: equal, or nearly, where rounding the step before would not give the figure after. */
const link = (exact: boolean): string => (exact ? " ＝ " : " ≈ ")

const medals = (value: number | undefined): string => told(value, MEDALS)

const perGame = (value: number | undefined): string => told(value, PER_GAME)

const games = (value: number | undefined): string => told(value, GAMES)

const rate = (value: number | undefined): string => told(value, RATE)

const ratio = (value: number | undefined): string => told(value, RATIO)

const times = (value: number | undefined): string => told(value, TIMES)

/** A chance as one in so many, to the published 初当たり's two decimals. */
const oneIn = (chance: number | undefined, digits: number = ODDS.digits): string =>
  chance === undefined || !Number.isFinite(chance) || chance <= 0 ? "--" : `1/${trimmed(1 / chance, digits)}`

const arg = (step: Step | undefined, index: number): number | undefined => numberOf(step?.claim.args[index])

const givenNumber = (step: Step | undefined, functor: string, index: number): number | undefined => (step === undefined ? undefined : numberOf(givenIn(step, functor)?.args[index]))

/** A number a sum is worked from: NaN where there is none, so that nothing is silently taken as nought. */
const known = (value: number | undefined): number => value ?? Number.NaN

/** The numbers a step worked out, in the order it did. */
const computedIn = (step: Step): readonly number[] => step.premises.flatMap((premise) => (premise.type === "computed" ? [premise.value] : []))

const stepUnder = (step: Step | undefined, ...rules: readonly string[]): Step | undefined => (step === undefined ? undefined : stepsUnder(step).find((inner) => rules.includes(inner.rule)))

/** The AT's 純増 a step reasoned from: its own, or over all its medals. */
const netIn = (step: Step): number | undefined => arg(stepUnder(step, "net_single", "net_over_all"), 0)

const lossIn = (step: Step): number | undefined => arg(stepUnder(step, "loss_per_game"), 0)

/** The regular games a cycle lasts, as a step reasoned them or took them. */
const cycleIn = (step: Step): number | undefined => arg(stepUnder(step, "cycle_from_first_hit", "cycle_to_at_ceiling"), 1)

/** The modes' ceilings in regular games a cycle step reasoned over, `none` where a mode has none. */
const ceilingsIn = (step: Step): readonly (number | "none")[] => {
  const listed = stepUnder(step, "ceilings")?.claim.args[0]
  return Array.isArray(listed) ? listed.map((ceiling: Term) => numberOf(ceiling) ?? "none") : []
}

/** The modes' AT間天井 a cycle step reasoned over, `none` where a mode has none. */
const atCeilingsIn = (step: Step): readonly (number | "none")[] => {
  const listed = stepUnder(step, "at_ceilings")?.claim.args[0]
  return Array.isArray(listed) ? listed.map((ceiling: Term) => numberOf(ceiling) ?? "none") : []
}

/** The shares of the modes a cycle step reasoned over. */
const sharesIn = (step: Step): readonly number[] => {
  const listed = stepsUnder(step).find((inner) => inner.rule.startsWith("shares_"))?.claim.args[1]
  return Array.isArray(listed) ? listed.map((share: Term) => known(numberOf(share))) : []
}

const ceilingText = (ceiling: number | "none"): string => (ceiling === "none" ? "なし" : games(ceiling))

/** The trigger in a word: the CZ, the bonus by its label, or the AT a game wins directly. */
const triggerWord = (naming: GroundsNaming): string => {
  switch (naming.trigger.type) {
    case "cz":
      return "CZ"
    case "bonus":
      return naming.trigger.label
    case "at":
      return "AT"
  }
}

/** How often the trigger wins the AT, in a word: a CZ's success rate, a bonus's share that wins it. */
const successWord = (naming: GroundsNaming): string => (naming.trigger.type === "bonus" ? `${naming.trigger.label}のAT当選率` : "CZ成功率")

/** What play in a mode is called: a mode of the sheet's own by its label, else after an AT or after a setting change. */
const modeName = (naming: GroundsNaming, index: number): string => {
  const mode = naming.modes[index]
  if (mode?.type === "own") return mode.label
  return mode?.type === "after-reset" ? "設定変更後" : "AT後"
}

/** A ceiling under its mode's name, the name left off where it is the ceiling of play after an AT. */
const ofMode = (naming: GroundsNaming, index: number, ceiling: string): string => (naming.modes[index]?.type === "after-at" ? ceiling : `${modeName(naming, index)}の${ceiling}`)

/** A mode's trigger ceiling by name: the CZ天井, or the 天井 of an AT won directly. */
const triggerCeilingName = (naming: GroundsNaming, index: number): string => {
  switch (naming.trigger.type) {
    case "cz":
      return ofMode(naming, index, "CZ天井")
    case "bonus":
      return ofMode(naming, index, `${naming.trigger.label}間天井`)
    case "at":
      return ofMode(naming, index, "天井")
  }
}

/** A mode's AT間天井 by name: set apart only where a setting change shortens it. */
const atCeilingName = (naming: GroundsNaming, index: number): string => (naming.modes[index]?.type === "after-reset" ? "設定変更後のAT間天井" : "AT間天井")

/** Figures joined by words, in the order given. */
const joined = (figures: readonly string[], by: string): readonly (string | GroundsPart)[] => figures.flatMap((text, index) => (index === 0 ? [figure(text)] : [by, figure(text)]))

/** Two figures written to the fewest digits that make them read alike, or to their own where none does. */
const together = (mine: number, other: number, measure: Measure): number =>
  Array.from({ length: 10 }, (_, extra) => measure.digits + extra).find((digits) => told(mine, measure, digits) === told(other, measure, digits)) ?? measure.digits

/** Two figures written to the fewest digits that tell them apart, and how far apart they are. */
const apart = (mine: number, other: number, measure: Measure): { readonly mine: string; readonly other: string; readonly gap: string } => {
  const digits = Array.from({ length: 10 }, (_, extra) => measure.digits + extra).find((each) => told(mine, measure, each) !== told(other, measure, each))
  const gap = Math.abs(mine - other)
  const gapText = digits === undefined || Number(trimmed(gap * measure.scale, digits)) === 0 ? `${(gap * measure.scale).toPrecision(2)}${measure.unit}` : told(gap, measure, digits)
  return { mine: told(mine, measure, digits ?? measure.digits), other: told(other, measure, digits ?? measure.digits), gap: gapText }
}

/** A check's line, marked held or failed by its verdict. */
const checked = (step: Step, line: (holds: boolean) => readonly (string | GroundsPart)[]): Said => {
  const holds = standingOf(step) === "holds"
  return { parts: said("検算：", ...line(holds)), tone: holds ? "holds" : "fails" }
}

/** A check of a figure against another: equal where it held, and both with how far apart where it did not. */
const compared = (step: Step, measure: Measure, held: (mine: string, other: string) => readonly (string | GroundsPart)[], failed: (mine: string, other: string, gap: string) => readonly (string | GroundsPart)[]): Said => {
  const mine = known(arg(step, 1))
  const other = known(arg(step, 2))
  return checked(step, (holds) => {
    if (holds) {
      const digits = together(mine, other, measure)
      return held(told(mine, measure, digits), told(other, measure, digits))
    }
    const shown = apart(mine, other, measure)
    return failed(shown.mine, shown.other, shown.gap)
  })
}

/** What a check against the engine was of, and how that figure is written. */
const engineFigure = (step: Step): { readonly label: string; readonly measure: Measure } => {
  const of = step.claim.args[0]
  if (atomOf(of) === "net") return { label: "AT全体の純増", measure: PER_GAME }
  if (compoundOf(of, "cycle_games", 1) !== undefined) return { label: "1周期の通常ゲーム数", measure: GAMES }
  if (compoundOf(of, "completion", 1) !== undefined) return { label: "上限到達率", measure: RATE }
  return compoundOf(of, "gain", 1) !== undefined ? { label: "平均獲得枚数", measure: MEDALS } : { label: "機械割", measure: RATE }
}

/**
 * The AT's medals a stated 機械割 implies: the cycle's regular games times
 * what each loses beyond the 機械割's share, over the spread the AT's own
 * games add, worked step by step from the figures shown.
 */
const gainFromRate = (step: Step): Said => {
  const bet = known(givenNumber(step, "bet", 0))
  const stated = known(givenNumber(step, "stated_rate", 1))
  const cycle = known(cycleIn(step))
  const loss = known(lossIn(step))
  const net = known(netIn(step))
  const spread = known(computedIn(step)[0])
  const gain = arg(step, 1)
  const numerator = bet * (stated - 1) + loss
  const [shownStated, shownCycle, shownLoss, shownNet] = [shownAt(stated, RATIO), shownAt(cycle, GAMES), shownAt(loss, PER_GAME), shownAt(net, PER_GAME)]
  const [shownNumerator, shownSpread] = [shownAt(numerator, RATIO), shownAt(spread, SPREAD)]
  const product = shownAt(shownCycle * shownNumerator, MEDALS)
  const substituted = near(bet * (shownStated - 1) + shownLoss, numerator, RATIO) && near(1 + (bet * (1 - shownStated)) / shownNet, spread, SPREAD)
  return plain(
    "ATの平均獲得枚数 ＝ 通常 ",
    figure(games(cycle)),
    " ×（",
    figure(medals(bet)),
    " ×（機械割 ",
    figure(ratio(stated)),
    " − 1）＋ 減り ",
    figure(perGame(loss)),
    "）÷（1 ＋ ",
    figure(medals(bet)),
    " ×（1 − 機械割 ",
    figure(ratio(stated)),
    "）÷ 純増 ",
    figure(perGame(net)),
    "）",
    link(substituted),
    bare(shownCycle, GAMES),
    " × ",
    figure(ratio(numerator)),
    " ÷ ",
    figure(told(spread, SPREAD)),
    " ＝ ",
    figure(medals(product)),
    " ÷ ",
    bare(shownSpread, SPREAD),
    link(near(product / shownSpread, known(gain), MEDALS)),
    figure(medals(gain)),
  )
}

/** What a cycle's bonuses come to where the trigger is one: their medals, from how many it brings, and where their 純増 is given the games they take. */
const bonusesIn = (step: Step): { readonly medals: number; readonly games: number } => {
  const bonuses = stepUnder(step, "bonuses")
  return { medals: known(arg(bonuses, 1)), games: known(arg(bonuses, 2)) }
}

/** A cycle's bonuses where the trigger is one: so many a cycle times what each gains, and the games they take where their 純増 is given. */
const bonusesLine = (step: Step, naming: GroundsNaming): Said => {
  const word = triggerWord(naming)
  const triggers = known(arg(stepUnder(step, "cycle_triggers_free", "cycle_triggers_cut"), 1))
  const each = known(givenNumber(step, "trigger_payout", 0))
  const net = givenNumber(stepUnder(step, "bonus_games_counted"), "trigger_net", 0)
  const [total, own] = [known(arg(step, 1)), known(arg(step, 2))]
  return plain(
    `1周期の${word}の獲得 ＝ ${word} `,
    figure(times(triggers)),
    " × ",
    figure(medals(each)),
    link(near(shownAt(triggers, TIMES) * shownAt(each, MEDALS), total, MEDALS)),
    figure(medals(total)),
    ...(net === undefined
      ? [`（${word}中のゲーム数は数えない）`]
      : [`；${word}中 ＝ `, figure(medals(total)), " ÷ 純増 ", figure(perGame(net)), link(near(shownAt(total, MEDALS) / shownAt(net, PER_GAME), own, GAMES)), figure(games(own))]),
  )
}

/** The AT's medals a stated 機械割 implies beside the bonuses a cycle brings, which are taken from what the 機械割 gives before the AT has the rest. */
const gainFromRateBesideBonuses = (step: Step, naming: GroundsNaming): Said => {
  const word = triggerWord(naming)
  const bet = known(givenNumber(step, "bet", 0))
  const stated = known(givenNumber(step, "stated_rate", 1))
  const cycle = known(cycleIn(step))
  const loss = known(lossIn(step))
  const net = known(netIn(step))
  const bonus = bonusesIn(step)
  const [spread = Number.NaN] = computedIn(step)
  const numerator = bet * (stated - 1) * (cycle + bonus.games) + loss * cycle - bonus.medals
  const shown = { stated: shownAt(stated, RATIO), cycle: shownAt(cycle, GAMES), loss: shownAt(loss, PER_GAME), net: shownAt(net, PER_GAME), own: shownAt(bonus.games, GAMES), medals: shownAt(bonus.medals, MEDALS) }
  const shownNumerator = shownAt(numerator, MEDALS)
  const substituted =
    near(bet * (shown.stated - 1) * (shown.cycle + shown.own) + shown.loss * shown.cycle - shown.medals, numerator, MEDALS) && near(1 + (bet * (1 - shown.stated)) / shown.net, spread, SPREAD)
  return plain(
    "ATの平均獲得枚数 ＝（",
    figure(medals(bet)),
    " ×（機械割 ",
    figure(ratio(stated)),
    " − 1）×（通常 ",
    figure(games(cycle)),
    ` ＋ ${word}中 `,
    figure(games(bonus.games)),
    "）＋ 減り ",
    figure(perGame(loss)),
    " × 通常 ",
    figure(games(cycle)),
    ` − ${word}の獲得 `,
    figure(medals(bonus.medals)),
    "）÷（1 ＋ ",
    figure(medals(bet)),
    " ×（1 − 機械割 ",
    figure(ratio(stated)),
    "）÷ 純増 ",
    figure(perGame(net)),
    "）",
    link(substituted),
    figure(medals(numerator)),
    " ÷ ",
    figure(told(spread, SPREAD)),
    link(near(shownNumerator / shownAt(spread, SPREAD), known(arg(step, 1)), MEDALS)),
    figure(medals(arg(step, 1))),
  )
}

/** The AT's 純増 over all its medals: one over the games a medal takes, each share at its own 純増. */
const netOverAll = (step: Step): Said => {
  const [shared = Number.NaN, , gamesAMedal = Number.NaN] = computedIn(step)
  const own = { share: 1 - shared, net: known(givenNumber(step, "net_per_game", 0)) }
  const others = stepsUnder(step)
    .filter((inner) => inner.rule === "other_games")
    .map((inner) => ({ share: known(arg(inner, 0)), net: known(givenNumber(inner, "other_net", 0)) }))
  const terms = [own, ...others].map((each) => ({ ...each, games: shownAt(each.share, RATIO) / shownAt(each.net, PER_GAME) }))
  const sum = terms.reduce((total, each) => total + shownAt(each.games, GAMES_A_MEDAL), 0)
  return plain(
    "AT全体の純増 ＝ 1 ÷（",
    ...terms.flatMap((each, index) => [index === 0 ? "" : " ＋ ", figure(ratio(each.share)), " ÷ ", figure(perGame(each.net))]),
    "）",
    link(true),
    "1 ÷（",
    ...joined(
      terms.map((each) => told(each.games, GAMES_A_MEDAL)),
      " ＋ ",
    ),
    "）",
    link(near(sum, gamesAMedal, GAMES_A_MEDAL)),
    "1 ÷ ",
    figure(told(gamesAMedal, GAMES_A_MEDAL)),
    link(near(1 / shownAt(gamesAMedal, GAMES_A_MEDAL), known(arg(step, 0)), PER_GAME)),
    figure(perGame(arg(step, 0))),
    "（1枚あたりのATゲーム数を、獲得枚数の割合で合わせる）",
  )
}

/** What an AT's law would give it with no cap: its payout, its sets carried on, or its table summed, with the sum worked where there is one. */
const uncapped = (law: Term | undefined): readonly (string | GroundsPart)[] => {
  const fixed = numberOf(compoundOf(law, "fixed", 1)?.args[0])
  if (fixed !== undefined) return [figure(medals(fixed))]
  const sets = compoundOf(law, "sets", 3)
  if (sets !== undefined) {
    const [first, set, carry] = sets.args.map((each) => known(numberOf(each)))
    const total = known(first) + (known(set) * known(carry)) / (1 - known(carry))
    const worked = shownAt(known(first), MEDALS) + (shownAt(known(set), MEDALS) * shownAt(known(carry), RATIO)) / (1 - shownAt(known(carry), RATIO))
    return ["初回 ", figure(medals(first)), " ＋ 1セット ", figure(medals(set)), " × ", figure(ratio(carry)), " ÷（1 − ", figure(ratio(carry)), "）", link(near(worked, total, MEDALS)), figure(medals(total))]
  }
  const listed = compoundOf(law, "table", 1)?.args[0]
  const rows = (Array.isArray(listed) ? listed : []).map((row: Term) => {
    const read = compoundOf(row, "o", 2)
    return { medals: known(numberOf(read?.args[0])), share: known(numberOf(read?.args[1])) }
  })
  const total = rows.reduce((sum, row) => sum + row.medals * row.share, 0)
  const worked = rows.reduce((sum, row) => sum + shownAt(row.medals, MEDALS) * shownAt(row.share, RATIO), 0)
  return [...rows.flatMap((row, index) => [index === 0 ? "" : " ＋ ", figure(medals(row.medals)), " × ", figure(ratio(row.share))]), link(near(worked, total, MEDALS)), figure(medals(total))]
}

/** The AT's medals under a cap, from what its law would give it with none and how the next AT carries on from it. */
const gainUnderCap = (step: Step): Said => {
  const capped = stepUnder(step, "capped")
  const law = stepUnder(capped, "law_as_given", "law_by_table")?.claim.args[1]
  const window = givenNumber(stepUnder(capped, "arrivals_in_window"), "window", 0)
  return plain(
    "ATの平均獲得枚数 ",
    figure(medals(arg(step, 1))),
    "（上限なしなら ",
    ...uncapped(law),
    "。有利区間の上限までの残りで頭打ちにし、",
    ...(window === undefined ? ["次のATは0枚から始まり、"] : ["前のATから ", figure(games(window)), " 以内に次のATが来れば持ち越した枚数から始まり、"]),
    "持ち越した枚数ごとにATが始まる頻度を0枚から積み上げて平均）",
  )
}

const capped = (step: Step): Said => {
  const window = givenNumber(stepUnder(step, "arrivals_in_window"), "window", 0)
  return plain(
    "上限 ",
    figure(medals(givenNumber(step, "cap", 0))),
    " に届くATの割合 ",
    figure(rate(arg(step, 2))),
    ...(window === undefined ? ["（引き戻しの区切りなし：0枚から積み上げ）"] : ["（次のATが ", figure(games(window)), " 以内なら持ち越した枚数から積み上げ、来なければ0枚から）"]),
  )
}

/** The AT's medals in sets: the first set and each further one at the 継続率, worked from the figures shown. */
const gainInSets = (step: Step): Said => {
  const sets = compoundOf(givenIn(step, "law")?.args[1], "sets", 3)
  const [first, set, carry] = [0, 1, 2].map((index) => known(numberOf(sets?.args[index])))
  const [shownFirst, shownSet, shownCarry] = [shownAt(known(first), MEDALS), shownAt(known(set), MEDALS), shownAt(known(carry), RATIO)]
  const odds = shownAt(shownCarry / (1 - shownCarry), WHOLE)
  const further = shownAt(shownSet * odds, WHOLE)
  return plain(
    "ATの平均獲得枚数 ＝ 初回 ",
    figure(medals(first)),
    " ＋ 1セット ",
    figure(medals(set)),
    " × 継続率 ",
    figure(ratio(carry)),
    " ÷（1 − ",
    figure(ratio(carry)),
    "）＝ ",
    bare(shownFirst, MEDALS),
    " ＋ ",
    bare(shownSet, MEDALS),
    " × ",
    figure(told(odds, WHOLE)),
    " ＝ ",
    bare(shownFirst, MEDALS),
    " ＋ ",
    figure(told(further, WHOLE)),
    link(near(shownFirst + further, known(arg(step, 1)), MEDALS)),
    figure(medals(arg(step, 1))),
  )
}

/** The AT's medals by table: each row's part, summed. */
const gainByTable = (step: Step): Said => {
  const parts = stepsUnder(step)
    .filter((inner) => inner.rule === "table_part")
    .map((inner) => known(arg(inner, 3)))
  const sum = parts.reduce((total, part) => total + shownAt(part, MEDALS), 0)
  return plain("ATの平均獲得枚数 ＝ ", ...joined(parts.map(medals), " ＋ "), link(near(sum, known(arg(step, 1)), MEDALS)), figure(medals(arg(step, 1))))
}

const tablePart = (step: Step): Said => {
  const row = givenIn(step, "payout_row")
  const [rowMedals, share] = [known(numberOf(row?.args[1])), known(numberOf(row?.args[2]))]
  return plain(figure(medals(rowMedals)), " × ", figure(ratio(share)), link(near(shownAt(rowMedals, MEDALS) * shownAt(share, RATIO), known(arg(step, 3)), MEDALS)), figure(medals(arg(step, 3))))
}

/** A cycle's regular games: its triggers over the published 初当たり, one trigger where the AT is won directly. */
const cycleFromFirstHit = (step: Step, naming: GroundsNaming): Said => {
  const won = stepsUnder(step).find((inner) => inner.rule.startsWith("won_"))
  const triggers = known(arg(won, 1))
  const odds = 1 / known(givenNumber(step, "first_hit", 1))
  const worked = shownAt(triggers, TIMES) * shownAt(odds, ODDS)
  const close = link(near(worked, known(arg(step, 1)), GAMES))
  return won?.rule === "won_directly"
    ? plain(`1周期の通常ゲーム数 ＝ ${triggerWord(naming)} `, figure(times(1)), " × 初当たり分母 ", figure(told(odds, ODDS)), close, figure(games(arg(step, 1))))
    : plain(`1周期の通常ゲーム数 ＝ ATまでの${triggerWord(naming)} `, figure(times(triggers)), ` × ${triggerWord(naming)}の初当たり分母 `, figure(told(odds, ODDS)), close, figure(games(arg(step, 1))))
}

/** A mode's ceilings as a cycle plays it out: its trigger's and its AT間天井, each by name, and its own スルー天井 where each mode has one. */
const ceilingsOfMode = (naming: GroundsNaming, index: number, ceiling: number | "none", atCeiling: number | "none", misses: number | "none" | undefined): readonly (string | GroundsPart)[] => [
  `${triggerCeilingName(naming, index)} `,
  figure(ceilingText(ceiling)),
  `・${atCeilingName(naming, index)} `,
  figure(ceilingText(atCeiling)),
  ...(misses === undefined ? [] : ["・スルー天井 ", figure(misses === "none" ? "なし" : times(misses))]),
]

/** Each mode's スルー天井 a cycle step reasoned over, where a スルー天井 is drawn after each AT; none where the modes share one. */
const missesByModeIn = (step: Step): readonly (number | "none")[] | undefined => {
  const listed = stepUnder(step, "misses_by_mode")?.claim.args[0]
  return Array.isArray(listed) ? listed.map((misses: Term) => numberOf(misses) ?? "none") : undefined
}

/** A cycle played out game by game up to the AT間天井 of the modes play enters, with what it was played out from. */
const cycleCut = (step: Step, naming: GroundsNaming): Said => {
  const success = arg(stepUnder(step, "success_of_cz"), 1)
  const misses = arg(stepUnder(stepUnder(step, "misses_shared"), "within_misses"), 0)
  const byMode = missesByModeIn(step)
  const trigger = [...(success === undefined ? [] : [`${successWord(naming)} `, figure(ratio(success))]), ...(misses === undefined ? [] : [success === undefined ? "" : "・", "スルー天井 ", figure(times(misses))])]
  const [ceilings, atCeilings, shares] = [ceilingsIn(step), atCeilingsIn(step), sharesIn(step)]
  const entered = shares.flatMap((share, index) => (share > 0 ? [{ index, share, ceiling: ceilings[index] ?? "none", atCeiling: atCeilings[index] ?? "none", misses: byMode?.[index] }] : []))
  const played =
    entered.length === 1 && entered[0] !== undefined
      ? ceilingsOfMode(naming, entered[0].index, entered[0].ceiling, entered[0].atCeiling, entered[0].misses)
      : entered.flatMap((mode, place) => [place === 0 ? "" : "、", `${modeName(naming, mode.index)}（`, ...ceilingsOfMode(naming, mode.index, mode.ceiling, mode.atCeiling, mode.misses), "）を ", figure(rate(mode.share))])
  return plain(
    `天井を除いた${triggerWord(naming)}確率 `,
    figure(oneIn(givenNumber(step, "chance", 1))),
    ...(trigger.length === 0 ? [] : ["（", ...trigger, "）"]),
    "、",
    ...played,
    entered.length === 1 ? " まで1Gずつ追うと 1周期は通常 " : " の振り分けで1Gずつ追うと 1周期は通常 ",
    figure(games(arg(step, 1))),
    `・${triggerWord(naming)} `,
    figure(times(arg(step, 2))),
    entered.length === 1 ? "（各ゲームでまだATに当たっていない確率を足し上げ）" : "（各ゲームでまだATに当たっていない確率を振り分けで重み付けして足し上げ）",
  )
}

/** A mode's games between triggers as worked: its share, where it shares with others, of the chance's denominator or what of it the ceiling leaves. */
const betweenTerm = (mode: { readonly ceiling: number | "none"; readonly share: number }, odds: number, naming: GroundsNaming): readonly (string | GroundsPart)[] => [
  ...(mode.share === 1 ? [] : [figure(ratio(mode.share)), mode.ceiling === "none" ? " × " : " ×"]),
  ...(mode.ceiling === "none"
    ? [...(mode.share === 1 ? [`天井を除いた${triggerWord(naming)}確率の分母 `] : []), figure(told(odds, ODDS))]
    : ["（1 −（1 − ", figure(`1/${told(odds, ODDS)}`), "）^", figure(String(mode.ceiling)), "）× ", figure(told(odds, ODDS))]),
]

/** A cycle without an AT間天井: the games between triggers over the modes, ceilings included, then those times the triggers. */
const cycleFree = (step: Step, naming: GroundsNaming): readonly Said[] => {
  const computed = step.premises.filter((premise) => premise.type === "computed").at(-1)
  const between = known(numberOf(compoundOf(computed?.type === "computed" ? computed.expression : undefined, "*", 2)?.args[1]))
  const odds = shownAt(1 / known(givenNumber(step, "chance", 1)), ODDS)
  const shares = sharesIn(step)
  const modes = ceilingsIn(step)
    .map((ceiling, index) => ({ ceiling, share: shownAt(known(shares[index]), RATIO) }))
    .filter((mode) => mode.share !== 0)
    .map((mode) => ({ ...mode, games: shownAt(mode.share * (mode.ceiling === "none" ? odds : (1 - (1 - 1 / odds) ** mode.ceiling) * odds), GAMES) }))
  const triggers = known(arg(step, 2))
  const summed = link(near(modes.reduce((sum, mode) => sum + mode.games, 0), between, GAMES))
  const perMode = modes.length === 1 ? [summed] : [" ＝ ", ...joined(modes.map((mode) => games(mode.games)), " ＋ "), summed]
  return [
    plain(`${triggerWord(naming)}間 ＝ `, ...modes.flatMap((mode, index) => [index === 0 ? "" : " ＋ ", ...betweenTerm(mode, odds, naming)]), ...perMode, figure(games(between))),
    plain(
      `1周期の通常ゲーム数 ＝ ${triggerWord(naming)}間 `,
      figure(games(between)),
      ` × ${triggerWord(naming)} `,
      figure(times(triggers)),
      link(near(shownAt(between, GAMES) * shownAt(triggers, TIMES), known(arg(step, 1)), GAMES)),
      figure(games(arg(step, 1))),
    ),
  ]
}

/** The CZs tried until one wins within a スルー天井, worked from the figures shown. */
const wonWithinMisses = (step: Step, naming: GroundsNaming): Said => {
  const success = known(givenNumber(step, "success", 1))
  const misses = known(givenNumber(step, "misses", 0))
  const shown = shownAt(success, RATIO)
  const kept = shownAt(1 - shown, RATIO)
  const power = shownAt(kept ** (misses + 1), RATIO)
  const left = shownAt(1 - power, RATIO)
  return plain(
    `ATまでの${triggerWord(naming)} ＝（1 −（1 − ${successWord(naming)} `,
    figure(ratio(success)),
    "）^",
    figure(String(misses + 1)),
    "）÷ ",
    figure(ratio(success)),
    " ＝（1 − ",
    figure(ratio(kept)),
    "^",
    figure(String(misses + 1)),
    "）÷ ",
    bare(shown, RATIO),
    " ＝（1 − ",
    figure(ratio(power)),
    "）÷ ",
    bare(shown, RATIO),
    " ＝ ",
    figure(ratio(left)),
    " ÷ ",
    bare(shown, RATIO),
    link(near(left / shown, known(arg(step, 1)), TIMES)),
    figure(times(arg(step, 1))),
    "（",
    figure(times(misses)),
    "スルーで次は当選）",
  )
}

/** The CZ's success rate where a step reasons from it, as a ratio inside the working. */
const successOf = (step: Step): number => known(givenNumber(step, "success", 1))

const settledShare = (step: Step, naming: GroundsNaming): Said => {
  const allotted = givenIn(step, "allotted")
  const [after, reset] = [known(numberOf(allotted?.args[2])), known(numberOf(allotted?.args[3]))]
  const completion = known(arg(step, 1))
  const shown = shownAt(completion, RATIO)
  return plain(
    `${modeName(naming, known(numberOf(allotted?.args[1])))}の振り分け ＝（1 − 上限到達率 `,
    figure(ratio(completion)),
    "）× AT後 ",
    figure(ratio(after)),
    " ＋ ",
    figure(ratio(completion)),
    " × 設定変更後 ",
    figure(ratio(reset)),
    link(near((1 - shown) * shownAt(after, RATIO) + shown * shownAt(reset, RATIO), known(arg(step, 2)), RATE)),
    figure(rate(arg(step, 2))),
  )
}

/** A mode's ceiling in regular games: as the sheet gives it, counted on the screen and so reached sooner, or none. */
const modeAt = (step: Step, naming: GroundsNaming): Said => {
  const label = triggerCeilingName(naming, known(arg(step, 0)))
  const inGames = stepsUnder(step).find((inner) => inner.rule === "ceiling_on_screen" || inner.rule === "ceiling_in_games" || inner.rule === "no_ceiling")
  if (inGames?.rule === "ceiling_on_screen") {
    const screen = known(arg(inGames, 0))
    const lcd = known(givenNumber(inGames, "lcd_rate", 0))
    const quotient = screen / lcd
    return plain(
      `${label} ＝ 液晶 `,
      figure(games(screen)),
      " ÷ 液晶倍率 ",
      figure(trimmed(lcd, 3)),
      link(near(shownAt(screen, GAMES) / Number(trimmed(lcd, 3)), quotient, WHOLE)),
      figure(told(quotient, WHOLE)),
      "、切り上げて通常 ",
      figure(games(arg(step, 1))),
    )
  }
  return plain(`${label} `, figure(inGames?.rule === "no_ceiling" ? "なし" : games(arg(step, 1))))
}

/** The 機械割 over a cycle and its AT, a line to each step: the AT's games, the medals staked, those paid out, and the one over the other. */
const rateLines = (step: Step): readonly Said[] => {
  const [atGames = Number.NaN, staked = Number.NaN, out = Number.NaN] = computedIn(step)
  const gain = known(arg(stepsUnder(step).find((inner) => inner.claim.functor === "gain"), 1))
  const net = known(netIn(step))
  const loss = known(lossIn(step))
  const cycle = known(cycleIn(step))
  const bet = known(givenNumber(step, "bet", 0))
  const [shownGain, shownNet, shownLoss, shownCycle] = [shownAt(gain, MEDALS), shownAt(net, PER_GAME), shownAt(loss, PER_GAME), shownAt(cycle, GAMES)]
  const [shownAtGames, shownStaked, shownOut] = [shownAt(atGames, GAMES), shownAt(staked, MEDALS), shownAt(out, MEDALS)]
  return [
    plain("ATのゲーム数 ＝ 獲得 ", figure(medals(gain)), " ÷ 純増 ", figure(perGame(net)), link(near(shownGain / shownNet, atGames, GAMES)), figure(games(atGames))),
    plain(
      "1周期の投入 ＝ ",
      figure(medals(bet)),
      " ×（通常 ",
      figure(games(cycle)),
      " ＋ AT ",
      figure(games(atGames)),
      "）",
      link(near(bet * (shownCycle + shownAtGames), staked, MEDALS)),
      figure(medals(staked)),
    ),
    plain(
      "1周期の払い出し ＝ 投入 ",
      figure(medals(staked)),
      " − 減り ",
      figure(perGame(loss)),
      " × 通常 ",
      figure(games(cycle)),
      " ＋ 獲得 ",
      figure(medals(gain)),
      link(near(shownStaked - shownLoss * shownCycle + shownGain, out, MEDALS)),
      figure(medals(out)),
    ),
    plain("機械割 ＝ 払い出し ", figure(medals(out)), " ÷ 投入 ", figure(medals(staked)), link(near(shownOut / shownStaked, known(arg(step, 1)), RATE)), figure(rate(arg(step, 1)))),
  ]
}

/** The 機械割 over a cycle, its bonuses and its AT, a line to each step: the AT's games, the medals staked, those paid out, and the one over the other. */
const rateLinesBesideBonuses = (step: Step, naming: GroundsNaming): readonly Said[] => {
  const word = triggerWord(naming)
  const [atGames = Number.NaN, staked = Number.NaN, out = Number.NaN] = computedIn(step)
  const gain = known(arg(stepsUnder(step).find((inner) => inner.claim.functor === "gain"), 1))
  const net = known(netIn(step))
  const loss = known(lossIn(step))
  const cycle = known(cycleIn(step))
  const bet = known(givenNumber(step, "bet", 0))
  const bonus = bonusesIn(step)
  const shown = { gain: shownAt(gain, MEDALS), net: shownAt(net, PER_GAME), loss: shownAt(loss, PER_GAME), cycle: shownAt(cycle, GAMES), own: shownAt(bonus.games, GAMES), medals: shownAt(bonus.medals, MEDALS) }
  const [shownAtGames, shownStaked, shownOut] = [shownAt(atGames, GAMES), shownAt(staked, MEDALS), shownAt(out, MEDALS)]
  return [
    plain("ATのゲーム数 ＝ 獲得 ", figure(medals(gain)), " ÷ 純増 ", figure(perGame(net)), link(near(shown.gain / shown.net, atGames, GAMES)), figure(games(atGames))),
    plain(
      "1周期の投入 ＝ ",
      figure(medals(bet)),
      " ×（通常 ",
      figure(games(cycle)),
      ` ＋ ${word}中 `,
      figure(games(bonus.games)),
      " ＋ AT ",
      figure(games(atGames)),
      "）",
      link(near(bet * (shown.cycle + shown.own + shownAtGames), staked, MEDALS)),
      figure(medals(staked)),
    ),
    plain(
      "1周期の払い出し ＝ 投入 ",
      figure(medals(staked)),
      " − 減り ",
      figure(perGame(loss)),
      " × 通常 ",
      figure(games(cycle)),
      " ＋ 獲得 ",
      figure(medals(gain)),
      ` ＋ ${word}の獲得 `,
      figure(medals(bonus.medals)),
      link(near(shownStaked - shown.loss * shown.cycle + shown.gain + shown.medals, out, MEDALS)),
      figure(medals(out)),
    ),
    plain("機械割 ＝ 払い出し ", figure(medals(out)), " ÷ 投入 ", figure(medals(staked)), link(near(shownOut / shownStaked, known(arg(step, 1)), RATE)), figure(rate(arg(step, 1)))),
  ]
}

/** The 初当たり the engine's chance below the ceilings comes back to, from the cycle's triggers over its games, against the one published. */
const chanceChecked = (step: Step, naming: GroundsNaming): Said => {
  const cycle = stepUnder(step, "cycle_cut", "cycle_free")
  const [cycleGames, triggers] = [known(arg(cycle, 1)), known(arg(cycle, 2))]
  const [mine, published] = [known(arg(step, 1)), known(arg(step, 2))]
  const extra = Array.from({ length: 7 }, (_, more) => more).find((more) => near(Number(trimmed(cycleGames, 1 + more)) / Number(trimmed(triggers, 3 + more)), 1 / mine, ODDS)) ?? 0
  const division = [`${triggerWord(naming)} `, figure(`${trimmed(triggers, 3 + extra)}回`), " ÷ 通常 ", figure(`${trimmed(cycleGames, 1 + extra)}G`), link(near(Number(trimmed(cycleGames, 1 + extra)) / Number(trimmed(triggers, 3 + extra)), 1 / mine, ODDS))]
  return checked(step, (holds) => {
    if (holds) {
      const digits = together(1 / mine, 1 / published, ODDS)
      return [...division, figure(oneIn(mine, digits)), "、解析値の初当たり ", figure(oneIn(published, digits)), " と一致"]
    }
    const shown = apart(1 / mine, 1 / published, ODDS)
    return [...division, figure(`1/${shown.mine}`), "、解析値の初当たり ", figure(`1/${shown.other}`), " と一致しません（分母の差 ", figure(shown.gap), "）"]
  })
}

/** A sampled 機械割 against the exact one, within twice its margin or beyond it. */
const sampleChecked = (step: Step): Said => {
  const [exact, sampled, margin] = [known(arg(step, 1)), known(arg(step, 2)), known(arg(step, 3))]
  return checked(step, (holds) => [
    "推定の機械割 ",
    figure(rate(sampled)),
    " と厳密解 ",
    figure(rate(exact)),
    " の差 ",
    figure(rate(Math.abs(exact - sampled))),
    " は、誤差 ±",
    figure(rate(margin)),
    " の2倍 ",
    figure(rate(2 * margin)),
    holds ? " 以内" : " を超えています。数字が書き換えられているかもしれません",
  ])
}

/** What one step of the proof says, in the words of an analysis sheet; none for steps the line above already says. */
const lineOf = (step: Step, naming: GroundsNaming): Said | undefined => {
  switch (step.rule) {
    case "grounds":
      return plain("この算出条件の数字は、設定ごとに次のように導かれます。")
    case "level":
      return plain(`設定${arg(step, 0) ?? "--"}`)
    case "gain_from_rate":
      return gainFromRate(step)
    case "gain_from_rate_beside_bonuses":
      return gainFromRateBesideBonuses(step, naming)
    case "bonuses":
      return bonusesLine(step, naming)
    case "net_over_all":
      return netOverAll(step)
    case "gain_solved":
      return plain("ATの平均獲得枚数 ", figure(medals(arg(step, 1))), "（有利区間の上限 ", figure(medals(givenNumber(stepUnder(step, "gain_taken"), "cap", 0))), " のもとで計算エンジンが解いた値）")
    case "gain_under_cap":
      return gainUnderCap(step)
    case "capped":
      return capped(step)
    case "completion_solved":
      return plain("上限到達率 ", figure(rate(arg(step, 1))), "（計算エンジンが有利区間の上限を入れて解いた値）")
    case "settled_share":
      return settledShare(step, naming)
    case "gain_fixed":
      return plain("ATの平均獲得枚数 ", figure(medals(arg(step, 1))), "（解析値のまま）")
    case "gain_in_sets":
      return gainInSets(step)
    case "gain_by_table":
      return gainByTable(step)
    case "table_part":
      return tablePart(step)
    case "cycle_from_first_hit":
      return cycleFromFirstHit(step, naming)
    case "cycle_to_at_ceiling":
      return plain("1周期の通常ゲーム数 ", figure(games(arg(step, 1))), "（AT間天井で打ち切られる周期）")
    case "cycle_cut":
      return cycleCut(step, naming)
    case "mode_at":
      return modeAt(step, naming)
    case "won_by_success":
      return plain(`ATまでの${triggerWord(naming)} ＝ 1 ÷ ${successWord(naming)} `, figure(ratio(successOf(step))), link(near(1 / shownAt(successOf(step), RATIO), known(arg(step, 1)), TIMES)), figure(times(arg(step, 1))))
    case "won_within_misses":
      return wonWithinMisses(step, naming)
    case "won_on_the_last_miss":
      return plain(`ATまでの${triggerWord(naming)} ＝ スルー天井 `, figure(times(givenNumber(step, "misses", 0))), " ＋ 1 ＝ ", figure(times(arg(step, 1))), `（${successWord(naming)} `, figure(rate(successOf(step))), "：スルー天井でだけ当選）")
    case "loss_per_game": {
      const base = known(givenNumber(step, "base", 0))
      return plain("通常時1Gあたりの減り ＝ 50枚 ÷ ベース ", figure(told(base, { ...WHOLE, unit: "G" })), link(near(50 / shownAt(base, WHOLE), known(arg(step, 0)), PER_GAME)), figure(perGame(arg(step, 0))))
    }
    case "check_engine": {
      const { label, measure } = engineFigure(step)
      return compared(
        step,
        measure,
        (mine, engine) => [`ここで導いた${label} `, figure(mine), " ＝ 計算エンジンの ", figure(engine)],
        (mine, engine, gap) => [`ここで導いた${label} `, figure(mine), " が計算エンジンの ", figure(engine), " と食い違っています（差 ", figure(gap), "）"],
      )
    }
    case "check_chance":
      return chanceChecked(step, naming)
    case "check_stored":
      return compared(
        step,
        RATE,
        (mine, stored) => ["ここで導いた機械割 ", figure(mine), " ＝ 保存されている ", figure(stored)],
        (mine, stored, gap) => ["保存されている機械割 ", figure(stored), " と、ここで導いた ", figure(mine), " が食い違っています（差 ", figure(gap), "）。古い計算エンジンで作られたか、数字が書き換えられています"],
      )
    case "check_sample":
      return sampleChecked(step)
    case "check_stated":
      return compared(
        step,
        RATE,
        (mine, stated) => ["獲得枚数から戻した機械割 ", figure(mine), " ＝ 入力された ", figure(stated)],
        (mine, stated, gap) => ["獲得枚数から戻した機械割 ", figure(mine), " は、入力された機械割 ", figure(stated), " に戻りません（差 ", figure(gap), "）。有利区間の上限で獲得が削られているかもしれません"],
      )
    case "unverified_capped_gain":
      return {
        parts: said(
          "未確認：有利区間の上限（",
          figure(medals(numberOf(compoundOf(step.claim.args[0], "capped_gain", 1)?.args[0]))),
          "）のもとでのATの平均獲得枚数は、計算エンジンが解いた値をそのまま使っています。ATの獲得が引き戻し中の減りより小さいことがあり、ここでは積み上げられません",
        ),
        tone: "unverified",
      }
    case "unverified_completion":
      return { parts: said("未確認：上限に届くATの割合は、計算エンジンが解いた値をそのまま使っています。ATの獲得枚数を機械割から導く機種では、ここでは確かめられません"), tone: "unverified" }
    case "odd_loss_beyond_bet": {
      const beyond = compoundOf(step.claim.args[0], "loss_beyond_bet", 2)
      return { parts: said("気になる点：通常時1Gで、賭けた ", figure(medals(numberOf(beyond?.args[1]))), " より多い ", figure(perGame(numberOf(beyond?.args[0]))), " が減る計算です"), tone: "odd" }
    }
    case "odd_no_gain": {
      const none = compoundOf(step.claim.args[0], "no_gain", 2)
      return { parts: said(`気になる点：設定${numberOf(none?.args[0]) ?? "--"}のATで、メダルが増えません（平均獲得 `, figure(medals(numberOf(none?.args[1]))), "）"), tone: "odd" }
    }
    default:
      return undefined
  }
}

/** What one step of the proof says, a line to each step of its working; none for steps the line above already says. */
const linesOf = (step: Step, naming: GroundsNaming): readonly Said[] => {
  if (step.rule === "rate") return rateLines(step)
  if (step.rule === "rate_beside_bonuses") return rateLinesBesideBonuses(step, naming)
  if (step.rule === "cycle_free") return cycleFree(step, naming)
  const line = lineOf(step, naming)
  return line === undefined ? [] : [line]
}

const isCheck = (step: Step): boolean => step.rule.startsWith("check_")

const keyOf = (step: Step): string => `${step.rule}:${JSON.stringify(step.claim)}`

/** The conclusions a proof reaches outside its checks: each is said where it is first used plainly, never first deep under a check. */
const plainKeys = (proof: Proof): readonly string[] => (proof.type !== "step" || isCheck(proof) ? [] : [keyOf(proof), ...partsUnder(proof).flatMap(plainKeys)])

/** What could not be proved: a setting level's figures; none for the remarks, which only add to what is said. */
const unprovedLine = (goal: Term): Said | undefined => {
  const level = numberOf(compoundOf(goal, "level", 3)?.args[0])
  return level === undefined ? undefined : { parts: said(`設定${level}の機械割を、解析値から導けませんでした`), tone: "fails" }
}

/**
 * A proof of an AT machine's figures as lines to read, each step under the
 * one it supports: under each setting level, what the AT gains and from
 * what, how the 機械割 comes of it, the checks with whether they held, what
 * was taken unchecked and what is guessed to be out of the ordinary. Each
 * line names its result, then the working with every known figure put in
 * its place, then the result; a figure put in is told apart from the
 * words. The trigger and the modes are named as the formula names them.
 * A setting level that could not be proved is said so in its place.
 * A conclusion reached twice is said once, where it is first used
 * outside a check.
 */
export const groundsLines = (proof: Proof, naming: GroundsNaming): readonly GroundsLine[] => {
  type Walked = { readonly lines: readonly GroundsLine[]; readonly said: ReadonlySet<string> }
  const plainly = new Set(plainKeys(proof))
  const walk = (part: Step | (Proof & { readonly type: "unproved" }), depth: number, saidAlready: ReadonlySet<string>, underCheck: boolean): Walked => {
    if (part.type === "unproved") {
      const line = unprovedLine(part.goal)
      return { lines: line === undefined ? [] : [{ ...line, depth }], said: saidAlready }
    }
    const key = keyOf(part)
    if (saidAlready.has(key) || (underCheck && plainly.has(key))) return { lines: [], said: saidAlready }
    const lines = linesOf(part, naming).map((line) => ({ ...line, depth }))
    const below = partsUnder(part).reduce<Walked>(
      (sofar, inner) => {
        const walked = walk(inner, lines.length === 0 ? depth : depth + 1, sofar.said, underCheck || isCheck(part))
        return { lines: [...sofar.lines, ...walked.lines], said: walked.said }
      },
      { lines: [], said: new Set([...saidAlready, key]) },
    )
    return { lines: [...lines, ...below.lines], said: below.said }
  }
  return proof.type === "step" ? walk(proof, 0, new Set(), false).lines : []
}

/**
 * What an AT machine's grounds come to, in a sentence: the worst of what
 * was found — a disagreement or a setting level unproved, then something
 * guessed to be out of the ordinary, then something taken unchecked — or that every
 * check held.
 */
export const groundsStanding = (proof: Proof): Said => {
  const tally = tallyOf(findingsIn(proof))
  if (tally.fails + tally.unproved > 0) {
    const found = [...(tally.fails === 0 ? [] : [["食い違いが ", figure(`${tally.fails}件`)]]), ...(tally.unproved === 0 ? [] : [["証明できなかった箇所が ", figure(`${tally.unproved}件`)]])]
    return { parts: said(...found.flatMap((each, index) => [index === 0 ? "" : "、", ...each]), "あります。この算出条件の数字は、解析値から導ける数字ではありません。"), tone: "fails" }
  }
  const checks = ["検算 ", figure(`${tally.holds}件`), "はすべて一致しました"]
  if (tally.odd > 0) return { parts: said(...checks, "が、珍しいとみている点が ", figure(`${tally.odd}件`), "あります。珍しいかどうかは推測で、確かめたものではありません。解析値を見直してください。"), tone: "odd" }
  if (tally.unverified > 0) return { parts: said(...checks, "。ただし、確かめていない点が ", figure(`${tally.unverified}件`), "あります。"), tone: "unverified" }
  return { parts: said(...checks, "。"), tone: "holds" }
}
