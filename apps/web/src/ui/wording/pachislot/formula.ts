import type { SettingLevelFigures } from "../../../core/pachislot/figures"
import type { FormulaKind, SettingLevelShare } from "../../../core/pachislot/formula"
import type { Prior, StockSpreadKey } from "../../../core/pachislot/prior"
import type { TakeBackRefusal } from "../../../core/pachislot/path"
import type { CounterRefusal } from "../../../core/pachislot/reading"
import type { RevisionRefusal } from "../../../core/pachislot/revision"
import type { ReadingRefusal } from "../../../core/play-log/live"
import { formulaIdText } from "../catalog"
import { formatCount, UNSEEN_THEORETICAL } from "../numbers"
import type { TriggerWords } from "./trigger"

const KIND_NAMES: Readonly<Record<FormulaKind, string>> = { manual: "手入力", simulated: "解析値から計算", sampled: "シミュレータ" }

export const kindName = (kind: FormulaKind): string => KIND_NAMES[kind]

/** Odds as an analysis sheet prints them: `1/273.1`, and `1/6.25` where one decimal would round a 小役 away. */
export const oddsText = (oneIn: number): string => (Number.isFinite(oneIn) ? `1/${oneIn.toFixed(oneIn < 10 ? 2 : 1)}` : "--")

/**
 * What a pachislot formula is known by: its 機械割 from the lowest setting
 * level to the highest — `機械割 97.0%〜109.4%` — since nobody names one.
 */
export const formulaText = (figures: readonly SettingLevelFigures[]): string => {
  const rates = figures.map((each) => each.payoutRate)
  const [lowest, highest] = [Math.min(...rates), Math.max(...rates)]
  if (rates.length === 0) return "機械割 --"
  return lowest === highest ? `機械割 ${payoutRateText(lowest)}` : `機械割 ${payoutRateText(lowest)}〜${payoutRateText(highest)}`
}

type Said = { readonly id: string; readonly figures: readonly SettingLevelFigures[] }

/** A pachislot formula's name among its machine's, with its id where another says the same. */
export const formulaNameAmong = (formula: Said, among: readonly Said[]): string => {
  const said = formulaText(formula.figures)
  return among.filter((other) => formulaText(other.figures) === said).length > 1 ? `${said}（${formulaIdText(formula.id)}）` : said
}

/** A pachislot formula as it is passed on — "use this one": its id, which finds it, then its 機械割, which says what it is. */
export const formulaHandle = (formula: Said): string => `${formulaIdText(formula.id)} ${formulaText(formula.figures)}`

/** A 設定配分's shares, the levels it gives any: `設定1 60%・設定6 10%`. */
export const sharesText = (shares: readonly SettingLevelShare[]): string =>
  shares
    .filter((share) => share.basisPoints > 0)
    .map((share) => `設定${share.settingLevel} ${share.basisPoints / 100}%`)
    .join("・")

/** Figures nothing is known of yet, each as dashes in the shape it would have. */
export const UNSEEN = { share: "--.-%", averageSettingLevel: "設定-.--", settingLevel: "設定-", payoutRate: "---.-%", medalsPerGame: "-.---枚", medals: "--枚", games: "--G", yen: UNSEEN_THEORETICAL } as const

/** 機械割 as players write it: `1.055` is `105.5%`. */
export const payoutRateText = (ratio: number): string => `${(ratio * 100).toFixed(1)}%`

/** A chance as a share: `0.372` is `37.2%`. */
export const shareText = (probability: number): string => `${(probability * 100).toFixed(1)}%`

/** 期待設定, to two places as players quote it: `設定3.22`. */
export const averageSettingLevelText = (settingLevel: number): string => `設定${settingLevel.toFixed(2)}`

/** How often something came up so far, as a counter shows it: `1/5.9`, or `1/--` before it has. */
export const observedOneInText = (games: number, count: number): string => (count > 0 && games > 0 ? `1/${(games / count).toFixed(games / count < 10 ? 2 : 1)}` : "1/--")

/** What an even prior is called wherever a 設定配分 would be named. */
export const EVEN_PRIOR_NAME = "均等（全設定が同じ）"

/** What each stock spread is called: the kind of day it is a reading of, and how hard. */
export const STOCK_SPREAD_NAMES: Readonly<Record<StockSpreadKey, string>> = {
  collecting: "回収日（激辛）",
  "ordinary-harsh": "通常営業（辛め）",
  ordinary: "通常営業（標準）",
  "ordinary-kind": "通常営業（甘め）",
  "event-weak": "イベント日（弱め）",
  event: "イベント日（標準）",
  "event-strong": "イベント日（強め）",
  "new-machine": "新台導入週",
  "grand-opening": "グランドオープン",
  featured: "全台系・対象台",
}

/** A play's prior by name: the 設定配分's label, a stock spread's name, or an even spread. */
export const priorName = (prior: Prior): string => {
  if (prior.type === "distribution") return prior.label
  return prior.type === "stock" ? STOCK_SPREAD_NAMES[prior.key] : EVEN_PRIOR_NAME
}

/** Theoretical medals a game gains or loses, to three places: `+0.108枚`. */
export const medalsPerGameText = (medals: number): string => `${medals < 0 ? "-" : "+"}${Math.abs(medals).toFixed(3)}枚`

/** Theoretical medals in whole ones, signed: `+120枚`. */
export const signedMedalsText = (medals: number): string => `${medals < 0 ? "-" : "+"}${formatCount(Math.round(Math.abs(medals)))}枚`

/** Games or medals on average, in whole ones: `約412G`. */
export const aboutText = (value: number, unit: "G" | "枚"): string => `約${formatCount(Math.round(value))}${unit}`

/** Why an AT machine's reading cannot be kept as it stands. */
export const describeAtReadingRefusal = (refusal: ReadingRefusal): string => {
  switch (refusal.type) {
    case "counter-went-back":
      return `AT間のゲーム数は、少なくとも${formatCount(refusal.expectedAtLeast)}Gのはずです。記録していないATがあったなら、足して記録できます。`
    case "outlay-went-back":
      return `投資（累計）は、前に記録した¥${formatCount(refusal.atLeast)}より少なくはなりません。`
    case "replay-went-back":
      return `貯メダル（累計）は、前に記録した${formatCount(refusal.atLeast)}枚より少なくはなりません。`
  }
}

/** What was to be taken back, in the words of the machine's trigger. */
const takenName = (taken: TakeBackRefusal["taken"], trigger: TriggerWords): string => {
  switch (taken) {
    case "at":
      return "AT当選"
    case "cz-missed":
      return trigger.missed
    case "bonus-missed":
      return trigger.bonusMissed ?? "ATなしボーナス"
  }
}

/** Why the last AT won or CZ missed was not taken back. */
export const describeTakeBackRefusal = (refusal: TakeBackRefusal, trigger: TriggerWords): string => {
  switch (refusal.type) {
    case "none":
      return `戻せる${takenName(refusal.taken, trigger)}がありません。`
    case "played-on":
      return `${takenName(refusal.taken, trigger)}のあとに記録があるので戻せません。上の履歴から直してください。`
  }
}

export const describeCounterRefusal = (refusal: CounterRefusal, bonusLabel: (id: string) => string): string => {
  switch (refusal.type) {
    case "bonus-went-back":
      return `${bonusLabel(refusal.id)}の回数は、前に記録した${formatCount(refusal.atLeast)}回より少なくはなりません。`
    case "total-went-back":
      return `累計ゲーム数は、少なくとも${formatCount(refusal.atLeast)}Gのはずです。データカウンターを読み直してください。`
    case "outlay-went-back":
      return `投資（累計）は、前に記録した¥${formatCount(refusal.atLeast)}より少なくはなりません。`
    case "replay-went-back":
      return `貯メダル（累計）は、前に記録した${formatCount(refusal.atLeast)}枚より少なくはなりません。`
  }
}

/** Why a reading cannot be set right or taken away as asked: that a later record could not follow, and what it would need. */
export const describeStepRefusal = (refusal: RevisionRefusal, bonusLabel: (id: string) => string): string => {
  const where = "この変更だと、あとの記録と食い違います。"
  switch (refusal.type) {
    case "total-went-back":
      return `${where}累計ゲーム数が、少なくとも${formatCount(refusal.atLeast)}Gのはずになります。`
    case "bonus-went-back":
      return `${where}${bonusLabel(refusal.id)}の回数が、${formatCount(refusal.atLeast)}回より少なくなってしまいます。`
    case "counter-went-back":
      return `${where}AT間のゲーム数が、少なくとも${formatCount(refusal.expectedAtLeast)}Gのはずになります。`
    case "outlay-went-back":
      return `${where}投資（累計）が、¥${formatCount(refusal.atLeast)}より少なくなってしまいます。`
    case "replay-went-back":
      return `${where}貯メダル（累計）が、${formatCount(refusal.atLeast)}枚より少なくなってしまいます。`
  }
}

/** A bonus as a list of bonuses names it: by its name, or — until it is given one — by where it stands among the bonuses, ボーナス2. */
export const bonusTitle = (label: string, position: number): string => (label.trim() === "" ? `ボーナス${position}` : label.trim())
