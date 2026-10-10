import { For, Show, type JSX } from "solid-js"

import { revisableStepAt } from "../../../../core/pachislot/revision"
import type { Countable } from "../../../../core/pachislot/weighing"
import type { Checkpoint } from "../../../../core/play-log/checkpoint"
import { cn } from "../../../primitives/cn"
import { formatMoment } from "../../../wording/dates"
import { formatCount } from "../../../wording/numbers"

/** A line worth a row: a reading of the counter or the outlay, an AT won, or the start of counting — not every tap on a tile. */
const isShown = (checkpoint: Checkpoint, index: number, ordered: readonly Checkpoint[]): boolean =>
  checkpoint.counter !== undefined ||
  checkpoint.outlay !== undefined ||
  checkpoint.event !== undefined ||
  (checkpoint.tally !== undefined && ordered.findIndex((candidate) => candidate.tally !== undefined) === index)

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

function ReadingRow(props: { readonly checkpoint: Checkpoint; readonly bonuses: readonly Countable[] }): JSX.Element {
  const counted = (): string =>
    props.bonuses
      .flatMap((bonus) => {
        const count = props.checkpoint.counter?.bonuses?.[bonus.id]
        return count === undefined ? [] : [`${bonus.label} ${formatCount(count)}`]
      })
      .join("・")
  return (
    <>
      <time class="w-20 shrink-0 text-xs tabular-nums text-text-muted">{props.checkpoint.at === undefined ? "—" : formatMoment(props.checkpoint.at)}</time>
      <span class="w-20 shrink-0 tabular-nums text-text-primary">{formatCount(props.checkpoint.spins)} G</span>
      <span class="flex-1 text-sm tabular-nums text-text-secondary">
        {props.checkpoint.outlay === undefined ? "" : `¥${formatCount(props.checkpoint.outlay)}`}
        <Show when={props.checkpoint.counter?.total} keyed>
          {(total) => <span class="ml-3 text-text-muted">累計 {formatCount(total)}G</span>}
        </Show>
        <Show when={props.checkpoint.counter?.total === undefined ? props.checkpoint.counter?.spins : undefined} keyed>
          {(sinceAt) => <span class="ml-3 text-text-muted">AT間 {formatCount(sinceAt)}G</span>}
        </Show>
        <Show when={counted() !== ""}>
          <span class="ml-3 text-text-muted">{counted()}</span>
        </Show>
      </span>
      <Show when={props.checkpoint.tally !== undefined && props.checkpoint.counter === undefined}>
        <span class="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 text-xs text-text-secondary">小役カウント開始</span>
      </Show>
      <Show when={atEndedText(props.checkpoint)} keyed>
        {(text) => <span class="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 text-xs font-semibold text-text-secondary">{text}</span>}
      </Show>
      <Show when={props.checkpoint.event?.kind === "ended"}>
        <span class="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 text-xs font-semibold text-text-secondary">終了</span>
      </Show>
      <Show when={props.checkpoint.event?.kind === "cz-missed"}>
        <span class="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 text-xs font-semibold text-text-secondary">CZ失敗</span>
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

/** The bonuses a log's counter readings count, each under its id, in the order first read. */
const countedIn = (checkpoints: readonly Checkpoint[]): readonly Countable[] =>
  [...new Set(checkpoints.flatMap((checkpoint) => Object.keys(checkpoint.counter?.bonuses ?? {})))].map((id) => ({ id, label: id }))

/**
 * A pachislot play's readings in play order, oldest first: the games played,
 * the counter's day and bonuses or its games since the last AT, the ATs won,
 * the outlay. A reading of the counter is pressed to set it right or take it
 * away; the seat as it was found, and what was only tapped, are not — in a
 * play in progress. A recorded play's log is only read: given no way to
 * revise, no line is pressed, and the line that ended the play is shown as
 * its last. Given no bonuses to name, each is named by its id as the
 * counter's readings have it: a recorded play keeps its log, not its formula.
 */
export function Timeline(props: {
  readonly checkpoints: readonly Checkpoint[]
  readonly bonuses: readonly Countable[] | undefined
  readonly revising: number | undefined
  readonly onRevise: ((step: number) => void) | undefined
}): JSX.Element {
  const bonuses = (): readonly Countable[] => props.bonuses ?? countedIn(props.checkpoints)
  const shown = (): readonly Row[] =>
    props.checkpoints.flatMap((checkpoint, line, ordered) =>
      isShown(checkpoint, line, ordered) ? [{ checkpoint, step: props.onRevise === undefined ? undefined : revisableStepAt(ordered, line) }] : [],
    )
  return (
    <ol class="flex flex-col gap-0.5">
      <For each={shown()}>
        {(row) => (
          <li>
            <Show
              when={row.step !== undefined}
              fallback={
                <div class={ROW}>
                  <ReadingRow checkpoint={row.checkpoint} bonuses={bonuses()} />
                </div>
              }
            >
              <button
                type="button"
                class={cn(ROW, "hover:bg-surface-3/40", props.revising === row.step && "bg-warning/10 ring-1 ring-warning/50")}
                aria-label={`${formatCount(row.checkpoint.spins)}Gの記録を修正`}
                onClick={() => {
                  if (row.step !== undefined) props.onRevise?.(row.step)
                }}
              >
                <ReadingRow checkpoint={row.checkpoint} bonuses={bonuses()} />
              </button>
            </Show>
          </li>
        )}
      </For>
    </ol>
  )
}
