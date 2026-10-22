import { createMemo, createSignal, For, Show, type JSX } from "solid-js"

import { stretchPerformancesOf, type StretchRate } from "../../../../core/pachinko/consumption"
import { mergeableSpan, type Span } from "../../../../core/pachinko/merging"
import { gainOf, overPaidOf } from "../../../../core/pachinko/payout"
import type { PlayTerms } from "../../../../core/parlor/terms"
import type { Checkpoint } from "../../../../core/play-log/checkpoint"
import { ConfirmPopover } from "../../../primitives/popover"
import { createSpanPress, inSpan, spanRow } from "../../../primitives/span-press"
import { feelTap } from "../../../primitives/vibration"
import { formatMoment } from "../../../wording/dates"
import { formatCount } from "../../../wording/numbers"
import { jackpotsText } from "../../../wording/pachinko/machine"
import { MERGE_READINGS, mergeSays, PHASE_NAMES, signedBalls, STRETCH_RATE_UNIT, stretchRateText, UNTOLD_JACKPOT } from "../../../wording/pachinko/play"

/**
 * A line and the one before it, which says what the line added to the
 * running totals; and, where the line is a reading, its place among the
 * play's readings — the seat as it was found and a jackpot found missing
 * are not readings, and have none.
 */
interface Step {
  readonly checkpoint: Checkpoint
  /** Whether the line is the seat as it was found: the log's first. */
  readonly seat: boolean
  readonly reading: number | undefined
  readonly rented: number
  readonly replayed: number
  readonly supported: number
  /** What a bonus counted as it ended paid beyond what its machine lists, on the line it was counted at (`overPaidOf`): below nought where it paid less. */
  readonly overPaid: number | undefined
}

const isFinish = (checkpoint: Checkpoint): boolean => checkpoint.event?.kind === "finished"

const isReading = (checkpoint: Checkpoint, line: number): boolean => line > 0 && !isFinish(checkpoint) && !(checkpoint.event?.kind === "jackpot" && checkpoint.event.approximate === true)

const stepsOf = (ordered: readonly Checkpoint[]): readonly Step[] => {
  const differences = overPaidOf(ordered)
  return ordered.reduce<{ readonly steps: readonly Step[]; readonly outlay: number; readonly replay: number; readonly support: number; readonly readings: number }>(
    (walked, checkpoint, line) => {
      const outlay = checkpoint.outlay ?? walked.outlay
      const replay = checkpoint.replay ?? walked.replay
      const support = checkpoint.support ?? walked.support
      const reading = isReading(checkpoint, line) ? walked.readings : undefined
      const step: Step = { checkpoint, seat: line === 0, reading, rented: outlay - walked.outlay, replayed: replay - walked.replay, supported: support - walked.support, overPaid: differences.get(line) }
      return { steps: [...walked.steps, step], outlay, replay, support, readings: walked.readings + (reading === undefined ? 0 : 1) }
    },
    { steps: [], outlay: 0, replay: 0, support: 0, readings: 0 },
  ).steps
}

/** What a jackpot's line calls it: its bonus with what it added to the hand — what was said it paid beyond its machine's with it — and the jackpots it was won over where they were more than one; or a jackpot whose bonus was not told — found missing, or on a machine that lists none. */
const jackpotText = (checkpoint: Checkpoint): string | undefined => {
  const event = checkpoint.event
  if (event?.kind !== "jackpot") return undefined
  if (event.bonus !== undefined) return [event.bonus.name, signedBalls(gainOf(event.bonus)), event.bonus.over === undefined ? undefined : `(差${signedBalls(event.bonus.over)})`, jackpotsText(event.bonus)].filter((part) => part !== undefined).join(" ")
  return event.approximate === true ? `${UNTOLD_JACKPOT}（推定）` : UNTOLD_JACKPOT
}

/** What a line did to the balls, each where it did anything: rented, drawn, drifted, counted, and — counted as a bonus ended — what it paid beyond what it was told to. */
const ballsText = (step: Step): string =>
  [
    step.rented > 0 ? `貸玉 ¥${formatCount(step.rented)}` : undefined,
    step.replayed > 0 ? `貯玉 ${formatCount(step.replayed)}玉` : undefined,
    step.supported !== 0 ? `電サポ ${signedBalls(step.supported)}` : undefined,
    step.checkpoint.held === undefined ? undefined : `持ち玉 ${formatCount(step.checkpoint.held)}玉`,
    step.overPaid === undefined ? undefined : `出玉差 ${signedBalls(step.overPaid)}`,
  ]
    .filter((text): text is string => text !== undefined)
    .join("　")

const ROW = "flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-left"

/** What the line that finishes a recorded play is called, where a reading says the state the cabinet was in. */
const FINISH_NAME = "終了"

/** What the seat as it was found is called, where a reading says the state the cabinet was in. */
const SEAT_NAME = "着席"

/** What a line is called before its counter: the seat, the finish, or the state the cabinet was in. */
const nameOf = (step: Step): string => (step.seat ? SEAT_NAME : isFinish(step.checkpoint) ? FINISH_NAME : PHASE_NAMES[step.checkpoint.phase ?? "regular"])

/** One line of the log: its moment, its name, its counter, its own stretch's spin performance where it has one, and its bonus — cut short where it would not fit — over what it did to the balls. */
function Line(props: { readonly step: Step; readonly rate: StretchRate | undefined }): JSX.Element {
  const checkpoint = (): Checkpoint => props.step.checkpoint
  return (
    <>
      <div class="flex items-baseline gap-2">
        <time class="w-10 shrink-0 text-xs tabular-nums text-text-muted">{checkpoint().at === undefined ? "--:--" : formatMoment(checkpoint().at ?? "").slice(-5)}</time>
        <span class="w-8 shrink-0 text-xs text-text-secondary">{nameOf(props.step)}</span>
        <Show when={!isFinish(checkpoint()) || checkpoint().counter?.spins !== undefined}>
          <span class="shrink-0 tabular-nums text-text-primary">{checkpoint().counter?.spins === undefined ? "--" : formatCount(checkpoint().counter?.spins ?? 0)} 回転</span>
        </Show>
        <Show when={checkpoint().counter?.gauge !== undefined}>
          <span class="shrink-0 text-xs tabular-nums text-text-secondary">遊 {formatCount(checkpoint().counter?.gauge ?? 0)}</span>
        </Show>
        <Show when={props.rate} keyed>
          {(rate) => (
            <span class="shrink-0 text-xs tabular-nums text-text-muted">
              {stretchRateText(rate)}
              <span class="text-[0.5rem]">{STRETCH_RATE_UNIT}</span>
            </span>
          )}
        </Show>
        <Show when={jackpotText(checkpoint())} keyed>
          {(won) => <span class="ml-auto min-w-0 truncate rounded bg-accent px-1.5 py-0.5 text-xs font-semibold text-accent-contrast">{won}</span>}
        </Show>
      </div>
      <Show when={ballsText(props.step)} keyed>
        {(balls) => <p class="pl-12 text-xs tabular-nums text-text-muted">{balls}</p>}
      </Show>
    </>
  )
}

/** What pressing a line takes up to be set right: a reading by its place among them, or the seat as it was found. */
export type Revised = { readonly type: "reading"; readonly index: number } | { readonly type: "seat" }

const pressedOf = (step: Step, line: number): Revised | undefined => (step.reading !== undefined ? { type: "reading", index: step.reading } : line === 0 ? { type: "seat" } : undefined)

/** Whether two presses take up the same line. */
export const samePressed = (left: Revised | undefined, right: Revised | undefined): boolean =>
  left !== undefined && right !== undefined && left.type === right.type && (left.type !== "reading" || right.type !== "reading" || left.index === right.index)

const pressLabel = (pressed: Revised): string => (pressed.type === "seat" ? "開始時データを修正" : `${pressed.index + 1}件目の記録を修正`)

/** One line of the log, tinted by what it is — a jackpot blue, 時短 yellow-green, 確変 purple. A reading, or the seat as it was found, is pressed to set it right; a jackpot found missing is only shown. A reading in the run being made one is marked. */
function Row(props: { readonly step: Step; readonly rate: StretchRate | undefined; readonly pressed: Revised | undefined; readonly revising: boolean; readonly merging: boolean; readonly onRevise: (pressed: Revised) => void }): JSX.Element {
  const jackpot = (): boolean => props.step.checkpoint.event?.kind === "jackpot"
  /** Whether the row is neither being set right nor in a run being made one: only then does it wear what it is. */
  const resting = (): boolean => !props.revising && !props.merging
  return (
    <li {...spanRow(props.step.reading)}>
      <Show
        when={props.pressed}
        keyed
        fallback={
          <div class={ROW}>
            <Line step={props.step} rate={props.rate} />
          </div>
        }
      >
        {(found) => (
          <button
            type="button"
            aria-label={pressLabel(found)}
            onClick={() => props.onRevise(found)}
            class={`${ROW} hover:bg-surface-3/40 focus-visible:outline-2 focus-visible:outline-focus-ring`}
            classList={{
              "bg-accent/10": jackpot() && resting(),
              "bg-rapid/15": !jackpot() && props.step.checkpoint.phase === "rapid" && resting(),
              "bg-special/15": !jackpot() && props.step.checkpoint.phase === "special" && resting(),
              "bg-warning/15": props.revising && !props.merging,
              "bg-accent/30": props.merging,
            }}
          >
            <Line step={props.step} rate={props.rate} />
          </button>
        )}
      </Show>
    </li>
  )
}

/**
 * The play's log in play order, oldest first, as a conversation reads:
 * each reading with the state the cabinet was in, the counter as it was
 * read, the bonus where it was a jackpot, and under it what the reading
 * did to the balls. Pressing a reading, or the seat as it was found, takes
 * it up to be set right — in a play in progress — and pressing the line
 * being set right again lets it go, as stopping does. A recorded play's log is
 * only read: given no way to revise, no line is pressed, and the line that
 * finished the play is shown as its last.
 *
 * Given a way to merge, a reading held and dragged from marks a run of
 * readings, as far as they may be made one (`mergeableSpan`), and letting
 * go asks beside it whether to: nothing is merged by the dragging itself.
 *
 * A line's room is left empty after the last, so the newest reading is
 * never the very bottom of what can be scrolled to.
 */
export function Timeline(props: {
  readonly checkpoints: readonly Checkpoint[]
  /** The corner's terms the play was on, which each line's own stretch's spin performance is worked out by; none where they are unknown. */
  readonly terms: PlayTerms | undefined
  readonly revising: Revised | undefined
  readonly onRevise: ((pressed: Revised) => void) | undefined
  readonly onMerge: ((span: Span) => Promise<void>) | undefined
}): JSX.Element {
  const rates = createMemo((): readonly (StretchRate | undefined)[] => (props.terms === undefined ? [] : stretchPerformancesOf(props.checkpoints, props.terms)))
  const press = createSpanPress((anchor, reached) => mergeableSpan(props.checkpoints, anchor, reached))
  const [merging, setMerging] = createSignal(false)
  const merge = async (span: Span): Promise<void> => {
    if (merging()) return
    setMerging(true)
    await props.onMerge?.(span)
    setMerging(false)
    press.putDown()
  }
  return (
    <>
      <ol
        class="flex flex-col gap-0.5"
        ref={(element) => {
          if (props.onMerge !== undefined) press.list(element)
        }}
      >
        <For each={stepsOf(props.checkpoints)}>
          {(step, line) => {
            const revise = props.onRevise
            const pressed = revise === undefined ? undefined : pressedOf(step, line())
            return (
              <Row
                step={step}
                rate={rates()[line()]}
                pressed={pressed}
                revising={samePressed(pressed, props.revising)}
                merging={inSpan(press.span(), step.reading)}
                onRevise={(found) => {
                  if (press.wasHeld() || revise === undefined) return
                  feelTap()
                  revise(found)
                }}
              />
            )
          }}
        </For>
      </ol>
      <div aria-hidden="true" class={`${ROW} mt-0.5`}>
        <span class="invisible">--</span>
      </div>
      <ConfirmPopover
        anchor={press.chosen()?.row}
        says={((span) => (span === undefined ? "" : mergeSays(span.to - span.from + 1)))(press.chosen()?.span)}
        confirm={MERGE_READINGS}
        doing={merging()}
        onConfirm={() => ((span) => (span === undefined ? undefined : void merge(span)))(press.chosen()?.span)}
        onCancel={press.putDown}
      />
    </>
  )
}
