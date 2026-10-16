import { Show, type JSX } from "solid-js"

import { apportioned, isZero, ZERO, type Decimal } from "../../../core/decimal/decimal"
import { averageOf, daysWonOf, prizesOf, shareOf, type Overall } from "../../../core/report/overall"
import { inferredShareText, NOT_TALLIED, playTimeText, TOTALS_HEADS } from "../../wording/breakdown"
import { formatCount, formatSignedYen, formatTheoreticalYen, formatYen, toneOf } from "../../wording/numbers"

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
  value === undefined ? { value: "--", tone: "neutral" } : { value: formatSignedYen(value), tone: toneOf(value) }

/** A theoretical value as a tile shows it: marked either way, `±¥0` for nothing; `--` where there is none. */
const worth = (value: Decimal | undefined): string => (value === undefined ? "--" : formatTheoreticalYen(value))

/** A share as a percentage to a tenth, with what it is of; `--` where there is nothing to take a share of. */
const rateText = (part: number, whole: number): { readonly value: string; readonly note: string | undefined } =>
  ((share) => (share === undefined ? { value: "--", note: undefined } : { value: `${(share * 100).toFixed(1)}%`, note: `${formatCount(part)} / ${formatCount(whole)}` }))(shareOf(part, whole))

/** One total on a line of its own, its name at the left and the figure at the right, as a trial balance lists them. */
function Total(props: { readonly label: string; readonly value: string; readonly tone?: keyof typeof TONES; readonly note?: string | undefined; readonly minor?: boolean }): JSX.Element {
  return (
    <div class={`flex items-baseline justify-between gap-3 border-b border-border last:border-b-0 ${props.minor === true ? "py-1 pl-3" : "py-1.5"}`}>
      <dt class={props.minor === true ? "text-xs text-text-muted" : "text-sm text-text-secondary"}>{props.label}</dt>
      <dd class="flex flex-col items-end">
        <span class={`text-sm font-semibold tabular-nums ${TONES[props.tone ?? "neutral"]}`}>{props.value}</span>
        <Show when={props.note}>{(note) => <span class="text-xs tabular-nums text-text-muted">{note()}</span>}</Show>
      </dd>
    </div>
  )
}

/** Totals of one kind under their head, a line to each. */
function Totals(props: { readonly head: string; readonly children: JSX.Element }): JSX.Element {
  return (
    <section aria-label={props.head} class="flex flex-col gap-1">
      <h2 class="text-xs font-semibold text-text-muted">{props.head}</h2>
      <dl class="rounded-md bg-surface-1 px-3">{props.children}</dl>
    </section>
  )
}

/**
 * A period's tallies taken as one, 総合: first what is only added up,
 * listed a line to each as a trial balance is, under three heads — 稼働,
 * how many were played, on how many days and for how long; 収支, what they
 * took in, the part of it renting and replaying tokens cost, what they
 * gave back, made and were worth; and 現金と景品, the cash they took, the
 * savings they drew on, and 景品等合計, what was taken home, with the
 * special and odd prizes and the part of a yen in it — then what is
 * worked out from those, a tile to each: what they made and were worth on
 * average a tally and a day, and how often a tally, and a day, came out
 * ahead. Where the books keep no theoretical value, or no play time,
 * there is none to sum.
 */
export function OverallCard(props: { readonly overall: Overall; readonly theoreticalKept: boolean }): JSX.Element {
  const days = (): number => props.overall.days.length
  const theoretical = (value: Decimal | undefined): string => (props.theoreticalKept ? worth(value) : NOT_TALLIED)
  const won = () => rateText(props.overall.playsWon, props.overall.plays)
  const wonDays = () => rateText(daysWonOf(props.overall), days())
  /** 景品等合計's parts in whole yen, rounded so that they add up to it as it is shown. */
  const prizeParts = (): readonly Decimal[] => apportioned([props.overall.specialPrizes, props.overall.oddPrizes, props.overall.translationAdjustment], 0)
  return (
    <div class="flex flex-col gap-3">
      <div class="flex flex-col gap-3 md:grid md:grid-cols-3 md:items-start md:gap-x-4">
        <Totals head={TOTALS_HEADS.played}>
          <Total label="プレイ台数" value={`${formatCount(props.overall.plays)}台`} />
          <Total label="プレイ日数" value={`${formatCount(days())}日`} />
          <Total label="通算時間" value={((seconds) => (seconds === undefined ? NOT_TALLIED : playTimeText(seconds)))(props.overall.playSeconds)} />
        </Totals>
        <Totals head={TOTALS_HEADS.result}>
          <Total label="通算投資" value={formatYen(props.overall.spent)} />
          <Total label="うち貸玉差額" value={formatYen(props.overall.rentalSpread)} minor />
          <Total label="うち再プレイ手数料" value={formatYen(props.overall.replayFee)} minor />
          <Total label="通算回収" value={formatYen(props.overall.returned)} />
          <Total label="通算収支" {...result(props.overall.actual)} />
          <Total
            label="通算期待値"
            value={theoretical(props.overall.theoretical)}
            note={props.theoreticalKept && !isZero(props.overall.inferred) ? inferredShareText(props.overall.inferred) : undefined}
          />
        </Totals>
        <Totals head={TOTALS_HEADS.money}>
          <Total label="現金投資" value={formatYen(props.overall.cash)} />
          <Total label="貯玉利用（円換算）" value={formatYen(props.overall.savingsDrawn)} />
          <Total label="景品等合計" value={formatYen(prizesOf(props.overall))} />
          <Total label="うち特殊景品" value={formatYen(prizeParts()[0] ?? ZERO)} minor />
          <Total label="うち端玉景品" value={formatYen(prizeParts()[1] ?? ZERO)} minor />
          <Total label="うち換算調整勘定" value={formatYen(prizeParts()[2] ?? ZERO)} minor />
        </Totals>
      </div>
      <dl class="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <Figure label="平均収支（1台）" {...result(averageOf(props.overall.actual, props.overall.plays))} />
        <Figure label="平均収支（1日）" {...result(averageOf(props.overall.actual, days()))} />
        <Figure label="平均期待値（1台）" value={theoretical(averageOf(props.overall.theoretical, props.overall.plays))} />
        <Figure label="平均期待値（1日）" value={theoretical(averageOf(props.overall.theoretical, days()))} />
        <Figure label="勝率（台）" {...won()} />
        <Figure label="勝率（日）" {...wonDays()} />
      </dl>
    </div>
  )
}
