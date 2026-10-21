import { Show, type JSX } from "solid-js"

import { shownNameOf } from "../../../core/catalog/catalog"
import type { HuddlePlay } from "../../../core/huddle/post"
import { huddleStandingOf, jackpotStreakOf } from "../../../core/huddle/standing"
import { parlorOf } from "../../../core/live-play/draft"
import { useApp } from "../../context"
import { CloseIcon } from "../../primitives/icons"
import { createLongPress } from "../../primitives/long-press"
import { formatMoment } from "../../wording/dates"
import { HUDDLE_DISMISS, HUDDLE_MOVED, HUDDLE_STANDINGS } from "../../wording/huddle"
import { parlorText } from "../../wording/parlor"

/**
 * The mark one of the others' plays wears: in a jackpot or 時短, the words
 * and the jackpots won in a row as a round chip — red, a jackpot being hot,
 * grey in 時短 — and none in 時短 that no jackpot led to; over or left for
 * another machine, a quiet framed chip; nothing while it is simply played.
 */
type Mark =
  | { readonly type: "streak"; readonly words: string; readonly count: number; readonly look: string }
  | { readonly type: "chip"; readonly words: string }

const STREAK_LOOKS = { jackpot: "bg-negative text-accent-contrast", rapid: "bg-surface-0 text-text-secondary" } as const

const markOf = (shown: HuddlePlay): Mark | undefined => {
  const standing = huddleStandingOf(shown.post.play)
  switch (standing) {
    case "jackpot":
    case "rapid":
      return { type: "streak", words: HUDDLE_STANDINGS[standing] ?? "", count: jackpotStreakOf(shown.post.play), look: STREAK_LOOKS[standing] }
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
 * One of the others' plays in the day's list: on what, with a mark for a
 * jackpot or 時短 and the jackpots won in a row, a play over or one left;
 * where and since when; and on the third line who plays it, where a play
 * sent to this device names its sender — but as a chip, so that it is not
 * taken for one, and with the line's width to itself. Pressed, it opens to
 * be looked at; held — or by a small cross where a pointer hovers — it asks
 * to be let go of from this device's list alone. It is not sent.
 */
export function HuddleRow(props: { readonly shown: HuddlePlay; readonly selected: boolean; readonly onSelect: () => void; readonly onDismiss: () => void }): JSX.Element {
  const app = useApp()
  const hold = createLongPress(() => props.onDismiss())
  const play = () => props.shown.post.play
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
          <span class="truncate">
            {shownNameOf(app.machineNames(), play().machine)}
            {play().cabinetNumber === undefined ? "" : ` ${play().cabinetNumber}番台`}
          </span>
          <Show when={markOf(props.shown)} keyed>
            {(mark) => <MarkShown mark={mark} />}
          </Show>
        </span>
        <span class="truncate text-xs text-text-muted">
          {parlorText(parlorOf(play()))}・{formatMoment(play().startedAt)}〜
        </span>
        <span class="flex min-w-0">
          <span class="truncate rounded-full bg-accent/30 px-2 text-[11px] font-semibold leading-5 text-text-primary">{props.shown.post.name}</span>
        </span>
      </button>
      <button
        type="button"
        aria-label={HUDDLE_DISMISS}
        title={HUDDLE_DISMISS}
        onClick={() => props.onDismiss()}
        class="absolute bottom-0.5 right-0.5 hidden size-5 items-center justify-center rounded text-text-muted hover:bg-surface-0 hover:text-text-primary focus-visible:flex group-hover:flex [&_svg]:size-3.5"
      >
        <CloseIcon label="" />
      </button>
    </li>
  )
}
