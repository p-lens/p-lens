import { Show, type JSX } from "solid-js"

import { isZero, rounded, type Decimal } from "../../../core/decimal/decimal"
import { averageOf, daysWonOf, prizesOf, shareOf, type Overall } from "../../../core/report/overall"
import { inferredShareText, NOT_TALLIED } from "../../wording/breakdown"
import { formatCompactSignedYen, formatCompactYen, formatCount, toneOf } from "../../wording/numbers"

const TONES = { positive: "text-positive", negative: "text-negative", neutral: "text-text-primary" } as const

/** One figure under its name; `--` where there is none to show. */
function Figure(props: { readonly label: string; readonly value: string; readonly tone?: keyof typeof TONES; readonly note?: string | undefined }): JSX.Element {
  return (
    <div class="flex min-w-0 flex-col gap-0.5 rounded-md bg-surface-1 px-3 py-2">
      <dt class="text-xs text-text-muted">{props.label}</dt>
      <dd class={`text-base font-semibold tabular-nums ${TONES[props.tone ?? "neutral"]}`}>{props.value}</dd>
      <Show when={props.note}>{(note) => <dd class="text-xs tabular-nums text-text-muted">{note()}</dd>}</Show>
    </div>
  )
}

/** A result as a tile shows it, coloured by which way it went; `--` where there is none. */
const result = (value: Decimal | undefined): { readonly value: string; readonly tone: keyof typeof TONES } =>
  value === undefined ? { value: "--", tone: "neutral" } : { value: formatCompactSignedYen(value), tone: toneOf(value) }

/** A theoretical value as a tile shows it: marked either way, `±¥0` for nothing; `--` where there is none. */
const worth = (value: Decimal | undefined): string => (value === undefined ? "--" : isZero(rounded(value, 0)) ? "±¥0" : formatCompactSignedYen(value))

/** A share as a percentage to a tenth, with what it is of; `--` where there is nothing to take a share of. */
const rateText = (part: number, whole: number): { readonly value: string; readonly note: string | undefined } =>
  ((share) => (share === undefined ? { value: "--", note: undefined } : { value: `${(share * 100).toFixed(1)}%`, note: `${formatCount(part)} / ${formatCount(whole)}` }))(shareOf(part, whole))

/**
 * A period's tallies taken as one, 総合: how many were played and on how
 * many days; what they made and were worth over all, and on average a
 * tally and a day; how often a tally, and a day, came out ahead; the cash
 * they took, the savings they drew on and the prizes taken home. Two to a
 * row on a phone, four on anything wider; yen past a hundred thousand in
 * 万 and 億, so a figure of years still fits. Where the books keep no
 * theoretical value, there is none to sum.
 */
export function OverallCard(props: { readonly overall: Overall; readonly theoreticalKept: boolean }): JSX.Element {
  const days = (): number => props.overall.days.length
  const theoretical = (value: Decimal | undefined): string => (props.theoreticalKept ? worth(value) : NOT_TALLIED)
  const won = () => rateText(props.overall.playsWon, props.overall.plays)
  const wonDays = () => rateText(daysWonOf(props.overall), days())
  return (
    <dl class="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
      <Figure label="プレイ台数" value={`${formatCount(props.overall.plays)}台`} />
      <Figure label="プレイ日数" value={`${formatCount(days())}日`} />
      <Figure label="通算収支" {...result(props.overall.actual)} />
      <Figure
        label="通算期待値"
        value={theoretical(props.overall.theoretical)}
        note={props.theoreticalKept && !isZero(props.overall.inferred) ? inferredShareText(props.overall.inferred) : undefined}
      />
      <Figure label="平均収支（1台）" {...result(averageOf(props.overall.actual, props.overall.plays))} />
      <Figure label="平均収支（1日）" {...result(averageOf(props.overall.actual, days()))} />
      <Figure label="平均期待値（1台）" value={theoretical(averageOf(props.overall.theoretical, props.overall.plays))} />
      <Figure label="平均期待値（1日）" value={theoretical(averageOf(props.overall.theoretical, days()))} />
      <Figure label="勝率（台）" {...won()} />
      <Figure label="勝率（日）" {...wonDays()} />
      <Figure label="現金投資" value={formatCompactYen(props.overall.cash)} />
      <Figure label="貯玉利用（円換算）" value={formatCompactYen(props.overall.savingsDrawn)} />
      <Figure label="特殊景品" value={formatCompactYen(props.overall.specialPrizes)} />
      <Figure label="景品合計" value={formatCompactYen(prizesOf(props.overall))} note={`端玉景品 ${formatCompactYen(props.overall.oddPrizes)}`} />
    </dl>
  )
}
