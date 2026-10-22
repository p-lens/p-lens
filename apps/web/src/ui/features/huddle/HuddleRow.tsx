import { Show, type JSX } from "solid-js"

import { shownNameOf } from "../../../core/catalog/catalog"
import type { RoomPlay } from "../../../core/huddle/room"
import { huddleStandingOf, jackpotStreakOf } from "../../../core/huddle/standing"
import { useApp } from "../../context"
import { CloseIcon } from "../../primitives/icons"
import { createLongPress } from "../../primitives/long-press"
import { HUDDLE_DEPARTED, HUDDLE_DISMISS, HUDDLE_MOVED, HUDDLE_STANDINGS } from "../../wording/huddle"
import { captionOf } from "../live/play-caption"

/**
 * The mark one of the others' plays wears: in a jackpot or 時短, the words
 * and the jackpots won in a row as a round chip — red, a jackpot being hot,
 * grey in 時短 — and none in 時短 that no jackpot led to; over, left for
 * another machine, or the one its player was on as they left the huddle —
 * whatever it was doing then, which is no longer so — a quiet framed chip;
 * nothing while it is simply played.
 */
type Mark =
  | { readonly type: "streak"; readonly words: string; readonly count: number; readonly look: string }
  | { readonly type: "chip"; readonly words: string }

const STREAK_LOOKS = { jackpot: "bg-negative text-accent-contrast", rapid: "bg-surface-0 text-text-secondary" } as const

const markOf = (shown: RoomPlay, departed: boolean): Mark | undefined => {
  const standing = huddleStandingOf(shown.play)
  if (standing !== "finished" && shown.latest && departed) return { type: "chip", words: HUDDLE_DEPARTED }
  switch (standing) {
    case "jackpot":
    case "rapid":
      return { type: "streak", words: HUDDLE_STANDINGS[standing] ?? "", count: jackpotStreakOf(shown.play), look: STREAK_LOOKS[standing] }
    case "finished":
      return { type: "chip", words: HUDDLE_STANDINGS.finished ?? "" }
    case "playing":
      return shown.latest ? undefined : { type: "chip", words: HUDDLE_MOVED }
  }
}

function MarkShown(props: { readonly mark: Mark }): JSX.Element {
  return props.mark.type === "chip" ? (
    <span class="ml-auto shrink-0 rounded-full border border-border px-1.5 text-[11px] font-semibold leading-5 text-text-muted">{props.mark.words}</span>
  ) : (
    <span class="ml-auto flex shrink-0 items-center gap-1 text-[11px] font-semibold text-text-secondary">
      {props.mark.words}
      <Show when={props.mark.count > 0}>
        <span class={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 tabular-nums ${props.mark.look}`}>{props.mark.count}</span>
      </Show>
    </span>
  )
}

/**
 * One play in a huddle's room: on what, with a mark for a jackpot or 時短
 * and the jackpots won in a row, a play over, one left for another
 * machine or by one who left the huddle; where and since when; and on the
 * third line who plays it as a chip, with the line's width to itself.
 * Pressed, it opens. One of the others' is only to be looked at, and held
 * — or by a small cross where a pointer hovers — asks to be let go of from
 * this device's list alone; nothing is sent. One's own is never let go
 * of here: it is given up in the live space.
 */
export function HuddleRow(props: {
  readonly shown: RoomPlay
  /** Who plays it, as the chip says. */
  readonly who: string
  /** Whether its player has left the huddle. */
  readonly departed: boolean
  readonly selected: boolean
  readonly onSelect: () => void
  readonly onDismiss: (() => void) | undefined
}): JSX.Element {
  const app = useApp()
  const hold = createLongPress(() => props.onDismiss?.())
  const play = () => props.shown.play
  return (
    <li class="group relative">
      <button
        type="button"
        aria-current={props.selected ? "page" : undefined}
        onClick={() => {
          if (!hold.wasLong()) props.onSelect()
        }}
        onPointerDown={hold.onPointerDown}
        onPointerMove={hold.onPointerMove}
        onPointerUp={hold.onPointerUp}
        onPointerLeave={hold.onPointerLeave}
        onPointerCancel={hold.onPointerCancel}
        onContextMenu={hold.onContextMenu}
        class="flex w-full select-none flex-col gap-0.5 rounded px-2 py-1.5 text-left transition-colors [-webkit-touch-callout:none]"
        classList={{ "bg-surface-3 text-text-primary": props.selected, "text-text-muted hover:bg-surface-3/60 hover:text-text-secondary": !props.selected }}
      >
        <span class="flex min-w-0 items-center gap-1.5 text-[15px]">
          <span class="truncate">{shownNameOf(app.machineNames(), play().machine)}</span>
          <Show when={markOf(props.shown, props.departed)} keyed>
            {(mark) => <MarkShown mark={mark} />}
          </Show>
        </span>
        <span class="truncate text-xs text-text-muted">{captionOf(play(), app.services.businessDay())}</span>
        <span class="flex min-w-0">
          <span class="truncate rounded-full bg-accent/30 px-2 text-[11px] font-semibold leading-5 text-text-primary">{props.who}</span>
        </span>
      </button>
      <Show when={props.onDismiss} keyed>
        {(dismiss) => (
          <button
            type="button"
            aria-label={HUDDLE_DISMISS}
            title={HUDDLE_DISMISS}
            onClick={() => dismiss()}
            class="absolute bottom-0.5 right-0.5 hidden size-5 items-center justify-center rounded text-text-muted hover:bg-surface-0 hover:text-text-primary focus-visible:flex group-hover:flex [&_svg]:size-3.5"
          >
            <CloseIcon label="" />
          </button>
        )}
      </Show>
    </li>
  )
}
