import { Show, type JSX } from "solid-js"

import { borderStandingOf, type BorderStanding } from "../../../../core/pachinko/border-standing"
import { spinPerformanceOf, type Consumption } from "../../../../core/pachinko/consumption"
import { playTheoreticalValue } from "../../../../core/pachinko/theoretical-value"
import { tokenValueOf, type PlayTerms } from "../../../../core/parlor/terms"
import type { FormulaSnapshot } from "../../../../core/pachinko/snapshot"
import { missingJackpots, type LiveSummary } from "../../../../core/play-log/live"
import { formulaText } from "../../../wording/pachinko/formula"
import { formatCount, theoreticalFigureText, theoreticalFractionText } from "../../../wording/numbers"
import { BORDER_STANDING_SAYS } from "../../../wording/pachinko/play"

const rateOf = (perThousand: number | undefined): string => (perThousand === undefined ? "--" : perThousand.toFixed(1))

const DOTS: Readonly<Record<BorderStanding, string>> = { above: "bg-positive", below: "bg-negative", level: "bg-text-muted" }

/** A dot that says where the spin performance stands against the border, by its colour and, for whoever cannot see it, in words. */
function StandingDot(props: { readonly standing: BorderStanding }): JSX.Element {
  return <span role="img" aria-label={BORDER_STANDING_SAYS[props.standing]} title={BORDER_STANDING_SAYS[props.standing]} class={`mr-1 inline-block size-2 rounded-full align-middle ${DOTS[props.standing]}`} />
}

/** One figure under its name, small enough that three sit side by side on a phone: the figures must leave room for the readings under them. What it is given to wear stands before its value. */
function Tile(props: { readonly label: string; readonly value: string; readonly unit?: string; readonly wears?: JSX.Element }): JSX.Element {
  return (
    <div class="flex min-w-0 flex-col rounded-md border border-border px-2 py-1.5">
      <dt class="truncate text-[10px] font-bold tracking-wide text-text-muted">{props.label}</dt>
      <dd class="truncate text-base font-bold tabular-nums text-text-primary">
        {props.wears}
        {props.value}
        <Show when={props.unit}>
          <span class="ml-0.5 text-[10px] font-normal text-text-muted">{props.unit}</span>
        </Show>
      </dd>
    </div>
  )
}


/**
 * Where the play stands now, worked out from its log as it reads at this
 * moment: its regular games, what it has spent in cash and drawn from
 * savings — side by side, never summed — and the spin performance measured over them
 * with the player's own balls counted in; and, where the play carries a
 * formula, what it is worth at that rate — the border the play's own
 * mix of balls breaks even at, set under the spin performance on a phone,
 * the one read against the other.
 *
 * Folded, as a play is until a person unfolds it, it is the three figures
 * anyone reads first — cash spent, balls drawn, the spin performance —
 * and the spin performance wears a dot that says where it stands against
 * the border, which is itself out of sight: green above it, red below,
 * grey level with it, none where there is no border to stand against.
 * Unfolded, the border is there to be read, and the dot is not. What the
 * play is worth has its tiles from the start, each holding the shape of
 * its figure with nothing in it until a reading gives one: a figure
 * arriving changes a tile, and never the lay of the screen.
 */
export function LiveFigures(props: {
  readonly summary: LiveSummary
  /** The balls drawn from savings since the play began. */
  readonly replayed: number
  readonly consumption: Consumption | undefined
  readonly formula: FormulaSnapshot | undefined
  readonly terms: PlayTerms | undefined
  readonly folded: boolean
  /** What stands beside the line naming the formula: a small way to more about it, out of the figures' way. */
  readonly beside: (formula: FormulaSnapshot) => JSX.Element
}): JSX.Element {
  const spinPerformance = (): number | undefined => {
    const measured = props.consumption?.measured
    return measured === undefined || props.terms === undefined ? undefined : spinPerformanceOf(measured, props.terms)
  }
  const theoretical = () =>
    props.formula === undefined || props.consumption === undefined ? undefined : playTheoreticalValue(props.formula.figures, props.terms, props.consumption)
  const standing = (): BorderStanding | undefined => (props.folded ? borderStandingOf(spinPerformance(), theoretical()?.border) : undefined)
  return (
    <section class="flex flex-col gap-2">
      <dl class="grid grid-cols-3 gap-1.5" classList={{ "sm:grid-cols-6": !props.folded }}>
        <Show when={!props.folded}>
          <Tile label="通常回転" value={formatCount(props.consumption?.regularSpins ?? props.summary.spins)} unit="回転" />
          <Tile label="カウンタ" value={formatCount(props.summary.counterNow)} unit="回転" />
          <Tile label="大当り" value={formatCount(props.summary.jackpots)} unit="回" />
        </Show>
        <Tile label="現金投資" value={props.summary.outlay === undefined ? "--" : `¥${formatCount(props.summary.outlay)}`} />
        <Tile label="貯玉投資" value={formatCount(props.replayed)} unit="玉" />
        <Tile
          label="回転率"
          value={rateOf(spinPerformance())}
          unit="回転/千円"
          wears={
            <Show when={standing()} keyed>
              {(found) => <StandingDot standing={found} />}
            </Show>
          }
        />
      </dl>
      <Show when={props.folded ? undefined : props.formula} keyed>
        {(formula) => (
          <div class="flex flex-col gap-2">
            <div class="flex items-center gap-1">
              <p class="min-w-0 text-xs text-text-muted">算出条件「{formulaText(formula.figures)}」{props.terms === undefined ? "（交換率が入っていません）" : `／ 交換率 ${tokenValueOf(props.terms).toFixed(2)}円/玉`}</p>
              {props.beside(formula)}
            </div>
            <dl class="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
              <Tile label="期待値（ここまで）" value={theoreticalFigureText(theoretical()?.theoreticalValue)} />
              <Tile label="期待値（1回転）" value={theoreticalFractionText(theoretical()?.yenPerSpin, 3)} />
              <Tile label="実質ボーダー" value={rateOf(theoretical()?.border)} unit="回転/千円" />
              <Show when={formula.figures.spinsPerHour !== undefined}>
                <Tile label="期待値（時給）" value={theoreticalFigureText(theoretical()?.yenPerHour)} />
              </Show>
            </dl>
          </div>
        )}
      </Show>
      <Show when={missingJackpots(props.summary) > 0}>
        <p role="alert" class="rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-sm text-text-primary">
          着席してから、カウンタでは大当り{props.summary.counterJackpots}回ですが、記録は{props.summary.jackpots}回です。
          {missingJackpots(props.summary)}回分の記録漏れがあるかもしれません。
        </p>
      </Show>
    </section>
  )
}
