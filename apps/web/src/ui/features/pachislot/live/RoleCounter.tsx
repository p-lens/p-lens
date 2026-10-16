import { Index, onCleanup, onMount, type JSX } from "solid-js"

import type { Countable } from "../../../../core/pachislot/weighing"
import type { Counts } from "../../../../core/play-log/checkpoint"
import { createLongPress } from "../../../primitives/long-press"
import { feelHold, feelTap } from "../../../primitives/vibration"
import { formatCount } from "../../../wording/numbers"
import { observedOneInText } from "../../../wording/pachislot/formula"

function CountTile(props: {
  readonly countable: Countable
  readonly count: number
  readonly outOf: number
  readonly shortcut: number | undefined
  readonly held: boolean
  readonly onCount: (id: string, by: 1 | -1) => void
}): JSX.Element {
  const press = createLongPress(() => {
    feelHold()
    props.onCount(props.countable.id, -1)
  })
  return (
    <button
      type="button"
      class="flex min-h-24 select-none flex-col items-center justify-center gap-1 rounded-lg border border-border bg-surface-2 px-2 py-3 transition-colors hover:bg-surface-3 active:bg-surface-0"
      classList={{ "opacity-40": props.held }}
      style={{ "-webkit-touch-callout": "none" }}
      onPointerDown={press.onPointerDown}
      onPointerMove={press.onPointerMove}
      onPointerUp={press.onPointerUp}
      onPointerLeave={press.onPointerLeave}
      onPointerCancel={press.onPointerCancel}
      onContextMenu={press.onContextMenu}
      onClick={() => {
        if (press.wasLong()) return
        feelTap()
        props.onCount(props.countable.id, 1)
      }}
    >
      <span class="text-3xl font-bold tabular-nums text-text-primary">{formatCount(props.count)}</span>
      <span class="text-xs tabular-nums text-text-muted">{observedOneInText(props.outOf, props.count)}</span>
      <span class="text-center text-xs font-semibold leading-tight text-text-secondary">
        {props.countable.label}
        {props.shortcut === undefined ? "" : <kbd class="ml-0.5 text-[0.625rem] font-normal text-text-muted">{props.shortcut}</kbd>}
      </span>
    </button>
  )
}

/**
 * Tiles to count small wins, bonuses and the cues watched for over a bonus
 * with, four to a row, each showing its count and how often it has come up
 * in what it is counted out of: the games counted, or a cue's trials. A tap adds one, and a long
 * press takes one back; on a keyboard, the digits press the first nine
 * tiles. Held, while what comes up is no regular game's, they are shown
 * faint; what a press then does is the counting's to say. Rows are an
 * `<Index>`, so a count changing never remounts a tile.
 */
export function RoleCounter(props: {
  readonly countables: readonly Countable[]
  readonly counts: Counts
  readonly outOf: (id: string) => number
  readonly held: boolean
  readonly onCount: (id: string, by: 1 | -1) => void
}): JSX.Element {
  const pressed = (event: KeyboardEvent): void => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
    const countable = /^[1-9]$/.test(event.key) ? props.countables[Number(event.key) - 1] : undefined
    if (countable === undefined) return
    event.preventDefault()
    props.onCount(countable.id, 1)
  }
  onMount(() => window.addEventListener("keydown", pressed))
  onCleanup(() => window.removeEventListener("keydown", pressed))
  return (
    <div class="grid grid-cols-4 gap-2">
      <Index each={props.countables}>
        {(countable, index) => (
          <CountTile
            countable={countable()}
            count={props.counts[countable().id] ?? 0}
            outOf={props.outOf(countable().id)}
            shortcut={index < 9 ? index + 1 : undefined}
            held={props.held}
            onCount={props.onCount}
          />
        )}
      </Index>
    </div>
  )
}
