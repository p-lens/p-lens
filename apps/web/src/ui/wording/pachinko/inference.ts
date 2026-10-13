import type { WayDto } from "@p-lens/contracts/pachinko"

import type { Weighing } from "../../../application/pachinko/inference"
import { PACE_BY_DEFAULT, tokenExchangeOf, type TokenRental, type Weighed, type WeighingTerms } from "../../../core/pachinko/inference"
import { formatCount, formatMan, theoreticalFigureText } from "../numbers"

export const RENTAL_NAMES: Readonly<Record<TokenRental, string>> = { 4: "4円", 1: "1円" }

/**
 * An exchange as a choice among the three, short enough for the three to
 * stand in a row, and as players of that rental say it: the balls ¥100 of
 * prizes takes — 28玉 at ¥4 a ball is 112玉 at ¥1.
 */
export const exchangeChoiceText = (terms: WeighingTerms): string => (terms.exchange === "equal" ? "等価" : `${formatCount(tokenExchangeOf(terms))}玉`)

/** A spin performance as players say it, to one place. */
export const spinPerformanceText = (weighed: Weighed): string => `${weighed.spinPerformance.toFixed(1)}回転/千円`

/** How far a spin performance stands from its border, signed: `ボーダー -2.4`. */
export const borderGapText = (weighed: Weighed): string => ((gap) => `ボーダー ${gap < 0 ? "-" : "+"}${Math.abs(gap).toFixed(1)}`)(weighed.spinPerformance - weighed.border)

export const inferredValueText = (weighed: Weighed): string => theoreticalFigureText(weighed.theoreticalValue)

/** What a weighing under way is doing: the usual trials, or the many more a play is given that too few of those came near. */
export const weighingText = (beyond: boolean): string => (beyond ? "通常に加え、追加の推論をしています…" : "推定中…")

/**
 * What stands where a weighing is begun, by where the weighing is: the
 * button's name until it is pressed, and then, in the button's place and
 * no button — a press would do nothing — that it is under way and how it
 * ended: 推定完了 where the play was weighed, 推定終了 where it ended with
 * nothing weighed. The button is back once the form says anything else of
 * the play.
 */
export const weighButtonText = (weighing: Weighing): string => {
  switch (weighing.type) {
    case "resting":
      return "推定期待値を算出する"
    case "weighing":
      return "推定中…"
    case "weighed":
      return "推定完了"
    case "unweighable":
    case "anomalous":
    case "vague":
    case "failed":
      return "推定終了"
  }
}

/** How far a weighing has got: `120万 / 200万回`. */
export const weighingProgressText = (done: number, planned: number): string => `${formatMan(done)} / ${formatMan(planned)}回`

/** What is said of a play that is not weighed: its machine cannot be played out, or it took no cash to read its spins' cost from. */
export const UNWEIGHABLE: Readonly<Record<"no-basis" | "no-outlay", string>> = {
  "no-basis": "この機種には計算根拠のある算出条件がなく、推定できません。",
  "no-outlay": "現金投資のない稼働は、推定できません。",
}

/** What is said of a play that told too little to read: what a person can still add, where they have not, and plainly that nothing was read where they have. */
export const vagueText = (jackpotsTold: boolean): string => (jackpotsTold ? "この展開は、回転率の手がかりが少なく推定できませんでした。" : "情報が不足しています。「条件」から大当り回数を入力すると、推定できる場合があります。")

/**
 * A play out of the ordinary, as it is reported: flatly, as a machine
 * would, in three lines — that it was detected, how seldom such a play
 * comes, and what that figure is a figure of.
 */
export const ANOMALY = {
  detected: "異常な展開を検知しました",
  unrecorded: "推定期待値は記録されません。",
} as const

const WAYS: Readonly<Record<WayDto, string>> = {
  "outlay-at-least": "投資額がこれ以上になる",
  "outlay-at-most": "投資額がこれ以下で済む",
  "takings-at-least": "回収額がこれ以上になる",
  "takings-at-most": "回収額がこれ以下になる",
  "result-at-least": "収支がこれ以上になる",
  "result-at-most": "収支がこれ以下になる",
}

/** How seldom a play comes, to two figures: `約12,000回に1回`; where no trial went as far, only that it was not once played out — which is all that was found. */
export const frequencyText = (oneIn: number, beyond: boolean): string => (beyond ? "再現できませんでした" : `約${formatCount(Number(oneIn.toPrecision(2)))}回に1回`)

/** What the figure of an anomaly is a figure of: which way the play is out, and that it is the machine as it is taken to be that was played out; or, where it was not once played out, how many trials that was said of. */
export const frequencyBasisText = (oneIn: number, beyond: boolean, way: WayDto): string =>
  beyond ? `${formatMan(oneIn)}回のシミュレーションでの結果（この機種・仮定した条件で${WAYS[way]}展開）` : `この機種・仮定した条件で${WAYS[way]}推定発生頻度`

/** What is said beside a reading whose cabinet's pace was assumed, its formula saying none. */
export const PACE_ASSUMED = `1時間の回転数が算出条件にないため、仮の値（${formatCount(PACE_BY_DEFAULT)}回転）で推定しています。`
