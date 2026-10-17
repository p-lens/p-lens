import { createEffect, createSignal, For, on, Show, type JSX } from "solid-js"

import { mergeableSpan, type Span } from "../../../../core/pachislot/merging"
import { revisableStepAt } from "../../../../core/pachislot/revision"
import type { Countable } from "../../../../core/pachislot/weighing"
import type { Checkpoint } from "../../../../core/play-log/checkpoint"
import { cn } from "../../../primitives/cn"
import { ConfirmPopover } from "../../../primitives/popover"
import { createSpanPress, inSpan, spanRow } from "../../../primitives/span-press"
import { feelTap } from "../../../primitives/vibration"
import { formatMoment } from "../../../wording/dates"
import { formatCount } from "../../../wording/numbers"
import { MERGE_READINGS, mergeSays } from "../../../wording/pachislot/play"
import { triggerWordsOf, type TriggerWords } from "../../../wording/pachislot/trigger"

/** A line worth a row: a reading of the counter, the outlay or the medals drawn from savings, or an AT won — not a tap on a tile. */
const isShown = (checkpoint: Checkpoint): boolean => checkpoint.counter !== undefined || checkpoint.outlay !== undefined || checkpoint.replay !== undefined || checkpoint.event !== undefined

/** An AT's result as a line says it: whether it completed, its sets and its medals, where said. */
const atEndedText = (checkpoint: Checkpoint): string | undefined => {
  const event = checkpoint.event
  if (event?.kind !== "at-ended") return undefined
  const parts = [
    event.completed === undefined ? undefined : event.completed ? "完走" : "完走せず",
    event.sets === undefined ? undefined : `${formatCount(event.sets)}セット継続`,
    event.medals === undefined ? undefined : `${formatCount(event.medals)}枚`,
  ].filter((part) => part !== undefined)
  return parts.length === 0 ? "AT終了" : `AT終了（${parts.join("・")}）`
}

/** A line with the step it can be set right as, where it is a reading. */
interface Row {
  readonly checkpoint: Checkpoint
  readonly step: number | undefined
}

function ReadingRow(props: { readonly checkpoint: Checkpoint; readonly bonuses: readonly Countable[]; readonly trigger: TriggerWords; readonly strip: boolean }): JSX.Element {
  const counted = (): string =>
    props.bonuses
      .flatMap((bonus) => {
        const count = props.checkpoint.counter?.bonuses?.[bonus.id]
        return count === undefined ? [] : [`${bonus.label} ${formatCount(count)}`]
      })
      .join("・")
  return (
    <>
      <time class="shrink-0 text-xs tabular-nums text-text-muted" classList={{ "w-20": !props.strip }}>{props.checkpoint.at === undefined ? "--" : formatMoment(props.checkpoint.at)}</time>
      <span class="shrink-0 tabular-nums text-text-primary" classList={{ "w-20": !props.strip, "font-semibold": props.strip }}>{formatCount(props.checkpoint.spins)} G</span>
      <span class="text-sm tabular-nums text-text-secondary" classList={{ "flex-1": !props.strip, "flex flex-col": props.strip }}>
        {props.checkpoint.outlay === undefined ? "" : `¥${formatCount(props.checkpoint.outlay)}`}
        <Show when={props.checkpoint.replay} keyed>
          {(replay) => <span class="text-text-muted" classList={{ "ml-3": !props.strip }}>貯メダル {formatCount(replay)}枚</span>}
        </Show>
        <Show when={props.checkpoint.counter?.total} keyed>
          {(total) => <span class="text-text-muted" classList={{ "ml-3": !props.strip }}>累計 {formatCount(total)}G</span>}
        </Show>
        <Show when={props.checkpoint.counter?.total === undefined ? props.checkpoint.counter?.spins : undefined} keyed>
          {(sinceAt) => <span class="text-text-muted" classList={{ "ml-3": !props.strip }}>AT間 {formatCount(sinceAt)}G</span>}
        </Show>
        <Show when={counted() !== ""}>
          <span class="text-text-muted" classList={{ "ml-3": !props.strip }}>{counted()}</span>
        </Show>
      </span>
      <Show when={atEndedText(props.checkpoint)} keyed>
        {(text) => <span class="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 text-xs font-semibold text-text-secondary">{text}</span>}
      </Show>
      <Show when={props.checkpoint.event?.kind === "finished"}>
        <span class="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 text-xs font-semibold text-text-secondary">終了</span>
      </Show>
      <Show when={props.checkpoint.event?.kind === "cz-missed"}>
        <span class="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 text-xs font-semibold text-text-secondary">{props.trigger.missed}</span>
      </Show>
      <Show when={props.checkpoint.event?.kind === "bonus-missed"}>
        <span class="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 text-xs font-semibold text-text-secondary">{props.trigger.bonusMissed ?? "ATなしボーナス"}</span>
      </Show>
      <Show when={props.checkpoint.event?.kind === "jackpot"}>
        <span class="shrink-0 rounded bg-accent px-1.5 py-0.5 text-xs font-semibold text-accent-contrast">
          {props.checkpoint.event?.kind === "jackpot" && props.checkpoint.event.approximate === true ? "AT当選（推定）" : "AT当選"}
        </span>
      </Show>
    </>
  )
}

const ROW = "flex w-full items-baseline gap-3 rounded px-3 py-1.5 text-left"

/** A reading as a card of a strip: its lines one under another, as wide as a strip shows several of. */
const CARD = "flex h-full w-36 flex-col items-start gap-1 rounded-md border border-border px-3 py-2 text-left"

/** How near its end, in pixels, a strip scrolled by a person still counts as at its newest. */
const NEWEST_WITHIN = 24

/** The bonuses a log's counter readings count, each under its id, in the order first read. */
const countedIn = (checkpoints: readonly Checkpoint[]): readonly Countable[] =>
  [...new Set(checkpoints.flatMap((checkpoint) => Object.keys(checkpoint.counter?.bonuses ?? {})))].map((id) => ({ id, label: id }))

/**
 * A pachislot play's readings in play order, oldest first: the games played,
 * the counter's day and bonuses or its games since the last AT, the ATs won,
 * the outlay. A reading of the counter is pressed to set it right or take it
 * away; the seat as it was found, and what was only tapped, are not — in a
 * play in progress. A recorded play's log is only read: given no way to
 * revise, no line is pressed, and the line that finished the play is shown as
 * its last. Given no bonuses to name, each is named by its id as the
 * counter's readings have it: a recorded play keeps its log, not its formula.
 *
 * As a strip, the readings run across, the newest at the end, and the
 * strip keeps to that end as readings come unless a person has scrolled it
 * back, and again once they scroll it there. It comes to rest on a card,
 * except while a run is held: a snap would pull each step of the scrolling
 * a held finger makes at its edge back to the card it left.
 *
 * Given a way to merge, a reading held and dragged from marks a run of
 * readings, as far as they may be made one (`mergeableSpan`), and letting
 * go asks beside it whether to: nothing is merged by the dragging itself.
 */
export function Timeline(props: {
  readonly checkpoints: readonly Checkpoint[]
  readonly bonuses: readonly Countable[] | undefined
  /** What the machine's trigger is called, a CZ where no formula is at hand to say. */
  readonly trigger?: TriggerWords
  readonly revising: number | undefined
  readonly onRevise: ((step: number) => void) | undefined
  readonly onMerge: ((span: Span) => Promise<void>) | undefined
  /** Whether the readings run across a strip, the newest at its end, rather than down a column. */
  readonly strip?: boolean
}): JSX.Element {
  const press = createSpanPress((anchor, reached) => mergeableSpan(props.checkpoints, anchor, reached), props.strip === true ? "across" : "down")
  const strip = (): boolean => props.strip === true
  const shape = (): string => (strip() ? CARD : ROW)
  /** The strip, and whether it keeps to its newest end: it does until a person scrolls it back, and again once they scroll it to the end. */
  const held: { strip: HTMLElement | undefined; following: boolean } = { strip: undefined, following: true }
  const toNewest = (): void => {
    if (held.strip !== undefined && held.following) held.strip.scrollLeft = held.strip.scrollWidth
  }
  const [merging, setMerging] = createSignal(false)
  const merge = async (span: Span): Promise<void> => {
    if (merging()) return
    setMerging(true)
    await props.onMerge?.(span)
    setMerging(false)
    press.putDown()
  }
  const bonuses = (): readonly Countable[] => props.bonuses ?? countedIn(props.checkpoints)
  const shown = (): readonly Row[] =>
    props.checkpoints.flatMap((checkpoint, line, ordered) =>
      isShown(checkpoint) ? [{ checkpoint, step: props.onRevise === undefined ? undefined : revisableStepAt(ordered, line) }] : [],
    )
  createEffect(
    on(
      () => shown().length,
      () => queueMicrotask(toNewest),
    ),
  )
  /** How many readings a run takes in: its rows, the taps between them being no rows. */
  const readingsIn = (span: Span): number => shown().filter((row) => inSpan(span, row.step)).length
  return (
    <>
      <ol
        class={strip() ? "flex gap-2 overflow-x-auto pb-1" : "flex flex-col gap-0.5"}
        classList={{ "snap-x": strip() && press.span() === undefined }}
        ref={(element) => {
          if (props.onMerge !== undefined) press.list(element)
          if (!strip()) return
          held.strip = element
          element.addEventListener("scroll", () => {
            held.following = element.scrollLeft + element.clientWidth >= element.scrollWidth - NEWEST_WITHIN
          })
          queueMicrotask(toNewest)
        }}
      >
        <For each={shown()}>
          {(row) => (
            <li {...spanRow(row.step)} class={strip() ? "shrink-0 snap-end" : undefined}>
              <Show
                when={row.step !== undefined}
                fallback={
                  <div class={shape()}>
                    <ReadingRow checkpoint={row.checkpoint} bonuses={bonuses()} trigger={props.trigger ?? triggerWordsOf(undefined)} strip={strip()} />
                  </div>
                }
              >
                <button
                  type="button"
                  class={cn(shape(), "hover:bg-surface-3/40", props.revising === row.step && "bg-warning/10 ring-1 ring-warning/50", inSpan(press.span(), row.step) && "bg-accent/30")}
                  aria-label={`${formatCount(row.checkpoint.spins)}Gの記録を修正`}
                  onClick={() => {
                    if (row.step === undefined || press.wasHeld() || props.onRevise === undefined) return
                    feelTap()
                    props.onRevise(row.step)
                  }}
                >
                  <ReadingRow checkpoint={row.checkpoint} bonuses={bonuses()} trigger={props.trigger ?? triggerWordsOf(undefined)} strip={strip()} />
                </button>
              </Show>
            </li>
          )}
        </For>
      </ol>
      <ConfirmPopover
        anchor={press.chosen()?.row}
        says={((span) => (span === undefined ? "" : mergeSays(readingsIn(span))))(press.chosen()?.span)}
        confirm={MERGE_READINGS}
        doing={merging()}
        onConfirm={() => ((span) => (span === undefined ? undefined : void merge(span)))(press.chosen()?.span)}
        onCancel={press.putDown}
      />
    </>
  )
}
