import { Show, type JSX } from "solid-js"

import { borderMarkOf, type BorderGrade, type BorderMark } from "../../../../core/pachinko/border-standing"
import { spinPerformanceOf, type Consumption } from "../../../../core/pachinko/consumption"
import { playTheoreticalValue } from "../../../../core/pachinko/theoretical-value"
import { tokenValueOf, type PlayTerms } from "../../../../core/parlor/terms"
import type { FormulaSnapshot } from "../../../../core/pachinko/snapshot"
import { missingJackpots, type LiveSummary } from "../../../../core/play-log/live"
import { CrownIcon, StarIcon, TrianglesDownIcon, TriangleUpIcon } from "../../../primitives/icons"
import { HelpPopover } from "../../../primitives/popover"
import { formulaText } from "../../../wording/pachinko/formula"
import { amountText, formatCount, theoreticalFigureText, theoreticalFractionText } from "../../../wording/numbers"
import { borderMarkSays } from "../../../wording/pachinko/play"
import { seal } from "../../../../mummer"

const rateOf = (perThousand: number | undefined): string => (perThousand === undefined ? "--" : perThousand.toFixed(1))

const DRAWN = "[&_svg]:inline [&_svg]:h-3.5 [&_svg]:w-auto [&_svg]:align-[-0.15em]"

const MARKS: Readonly<Record<BorderGrade, { readonly shape: () => JSX.Element; readonly look: string }>> = {
  crowned: { shape: () => <CrownIcon />, look: `text-mark-gold ${DRAWN}` },
  shining: { shape: () => <StarIcon />, look: `text-mark-gold motion-safe:animate-[shine_2.4s_ease-in-out_3] ${DRAWN}` },
  outstanding: { shape: () => <StarIcon />, look: `text-mark-gold ${DRAWN}` },
  excellent: { shape: () => <StarIcon />, look: `text-mark-red ${DRAWN}` },
  strong: { shape: () => <TriangleUpIcon />, look: `text-mark-purple ${DRAWN}` },
  professional: { shape: () => <TriangleUpIcon />, look: `text-mark-green ${DRAWN}` },
  modest: { shape: () => <TriangleUpIcon />, look: `text-mark-blue ${DRAWN}` },
  near: { shape: () => <TrianglesDownIcon count={1} />, look: `text-mark-yellow ${DRAWN}` },
  short: { shape: () => <TrianglesDownIcon count={1} />, look: `text-mark-red ${DRAWN}` },
  shorter: { shape: () => <TrianglesDownIcon count={2} />, look: `text-mark-red ${DRAWN}` },
  deep: { shape: () => <TrianglesDownIcon count={3} />, look: `text-mark-red ${DRAWN}` },
  deepest: { shape: () => <TrianglesDownIcon count={4} />, look: `text-mark-red ${DRAWN}` },
}

/** A mark that says where the play stands against its border and how far, by its shape and colour and, for whoever cannot see them, in words. */
function StandingMark(props: { readonly mark: BorderMark }): JSX.Element {
  return (
    <span role="img" aria-label={borderMarkSays(props.mark)} title={borderMarkSays(props.mark)} class={`ml-1 align-middle text-xs ${MARKS[props.mark.grade].look}`}>
      {MARKS[props.mark.grade].shape()}
    </span>
  )
}

/** One figure under its name, small enough that three sit side by side on a phone: the figures must leave room for the readings under them. What it is given to wear stands after its name. */
function Tile(props: { readonly label: string; readonly value: string; readonly unit?: string; readonly wears?: JSX.Element }): JSX.Element {
  return (
    <div class="flex min-w-0 flex-col rounded-md border border-border px-2 py-1.5">
      <dt class="truncate text-[10px] font-bold tracking-wide text-text-muted">
        {props.label}
        {props.wears}
      </dt>
      <dd class="truncate text-base font-bold tabular-nums text-text-primary">
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
 * anyone reads first — cash spent, balls drawn, the spin performance.
 * Folded or not, the spin performance's name wears a mark after it that
 * says where the play stands against its border, and how far: graded
 * by what a spin is worth over an hour, never by the spin performance set
 * against the border (`borderMarkOf`) — a gold crown, a gold star that
 * shines, a gold or red star, a purple,
 * green or blue triangle above it, a yellow one pointing down at it or a
 * little under, and below it one to four red ones side by side, by
 * how far, the gold ones only once 300 spins have
 * been measured over 90 minutes; none where the play has no worth yet.
 * Unfolded, the border is there to be read as well. What the
 * play is worth has its tiles from the start, each holding the shape of
 * its figure with nothing in it until a reading gives one: a figure
 * arriving changes a tile, and never the lay of the screen.
 */
export function LiveFigures(props: {
  readonly summary: LiveSummary
  /** The balls drawn from savings since the play began. */
  readonly replayed: number
  /** Minutes from the play's start to its latest line written with a time. */
  readonly minutesPlayed: number | undefined
  readonly consumption: Consumption | undefined
  readonly formula: FormulaSnapshot | undefined
  /** The person's usual over-entry at the cabinet, in balls a round: the border falls by it until a bonus says how much more they pay. */
  readonly overEntry: number | undefined
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
    props.formula === undefined || props.consumption === undefined ? undefined : playTheoreticalValue(props.formula.figures, props.terms, props.consumption, props.overEntry)
  const mark = (): BorderMark | undefined => borderMarkOf(theoretical()?.yenPerSpin, { spins: props.consumption?.measured?.spins ?? 0, minutes: props.minutesPlayed })
  return (
    <section class="flex flex-col gap-2">
      <dl class="grid grid-cols-3 gap-1.5" classList={{ "sm:grid-cols-6": !props.folded }}>
        <Show when={!props.folded}>
          <Tile label="通常回転" value={formatCount(props.consumption?.regularSpins ?? props.summary.spins)} unit="回転" />
          <Tile label="カウンタ" value={formatCount(props.summary.counterNow)} unit="回転" />
          <Tile label="大当り" value={formatCount(props.summary.jackpots)} unit="回" />
        </Show>
        <Tile label="現金投資" value={props.summary.outlay === undefined ? "--" : `¥${amountText(seal.play(props.summary.outlay))}`} />
        <Tile label="貯玉投資" value={amountText(seal.play(props.replayed))} unit="玉" />
        <Tile
          label="回転率"
          value={rateOf(spinPerformance())}
          unit="回転/千円"
          wears={
            <Show when={mark()} keyed>
              {(found) => <StandingMark mark={found} />}
            </Show>
          }
        />
      </dl>
      <Show when={props.folded ? undefined : props.formula} keyed>
        {(formula) => (
          <div class="flex flex-col gap-2">
            <div class="flex items-center gap-1">
              <p class="min-w-0 text-xs text-text-muted">算出条件「{formulaText(formula.figures)}」{props.terms === undefined ? "（交換率が入っていません）" : `／ 交換率 ${tokenValueOf(props.terms).toFixed(2)}円/玉`}</p>
              <HelpPopover label="回転率と実質ボーダーについて" title="回転率と実質ボーダーについて" ink="nerdpro">
                <p>回転率は、払った1,000円で借りられる玉あたりの回転数です。貯玉や持ち玉で打った分も、貸玉に直して数えます。</p>
                <p>貸玉が割高な島では、1,000円で借りられる玉が減るぶん回転率が下がり、ボーダーとの差に表れます。</p>
                <p>実質ボーダーは、打った玉の値段で決まります。現金で借りた玉は借りた値段、貯玉や持ち玉は交換の値段で数えるので、それらで打つほど下がります。</p>
              </HelpPopover>
              {props.beside(formula)}
            </div>
            <dl class="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
              <Tile label="期待値（ここまで）" value={theoreticalFigureText(seal.play(theoretical()?.theoreticalValue))} />
              <Tile label="期待値（1回転）" value={theoreticalFractionText(seal.play(theoretical()?.yenPerSpin), 3)} />
              <Tile label="実質ボーダー" value={rateOf(theoretical()?.border)} unit="回転/千円" />
              <Show when={formula.figures.spinsPerHour !== undefined}>
                <Tile label="期待値（時給）" value={theoreticalFigureText(seal.play(theoretical()?.yenPerHour))} />
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
