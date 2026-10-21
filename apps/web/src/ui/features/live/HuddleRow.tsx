import { Show, type JSX } from "solid-js"

import { shownNameOf } from "../../../core/catalog/catalog"
import type { HuddlePlay } from "../../../core/huddle/post"
import { huddleStandingOf, type HuddleStanding } from "../../../core/huddle/standing"
import { parlorOf } from "../../../core/live-play/draft"
import { useApp } from "../../context"
import { formatMoment } from "../../wording/dates"
import { HUDDLE_MOVED, HUDDLE_STANDINGS } from "../../wording/huddle"
import { parlorText } from "../../wording/parlor"

/** Each mark's look: a jackpot loud, 時短 beside it, a play over or left quiet. */
const STANDING_LOOKS: Readonly<Record<HuddleStanding, string>> = {
  jackpot: "bg-negative text-accent-contrast",
  rapid: "bg-accent text-accent-contrast",
  finished: "border border-border text-text-muted",
  playing: "",
}

const MOVED_LOOK = "border border-border text-text-muted"

/** The mark one of the others' plays wears: where it stands, or that it was left for another machine; none while it is simply being played. */
const markOf = (shown: HuddlePlay): { readonly words: string; readonly look: string } | undefined => {
  const standing = huddleStandingOf(shown.post.play)
  const words = HUDDLE_STANDINGS[standing]
  if (words !== undefined) return { words, look: STANDING_LOOKS[standing] }
  return shown.latest ? undefined : { words: HUDDLE_MOVED, look: MOVED_LOOK }
}

/**
 * One of the others' plays in the day's list: who plays it, as a chip, so
 * that it is not taken for a play sent to this device, on what and where,
 * and a mark for a jackpot, 時短, a play over or one left. Pressed, it
 * opens to be looked at; it is not held, sent or given up.
 */
export function HuddleRow(props: { readonly shown: HuddlePlay; readonly selected: boolean; readonly onSelect: () => void }): JSX.Element {
  const app = useApp()
  const play = () => props.shown.post.play
  return (
    <li>
      <button
        type="button"
        aria-current={props.selected ? "page" : undefined}
        onClick={() => props.onSelect()}
        class="flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-left transition-colors"
        classList={{ "bg-surface-3 text-text-primary": props.selected, "text-text-muted hover:bg-surface-3/60 hover:text-text-secondary": !props.selected }}
      >
        <span class="flex min-w-0 items-center gap-1.5 text-[15px]">
          <span class="max-w-[7em] shrink-0 truncate rounded-full bg-accent/30 px-2 text-[11px] font-semibold leading-5 text-text-primary">{props.shown.post.name}</span>
          <span class="truncate">
            {shownNameOf(app.machineNames(), play().machine)}
            {play().cabinetNumber === undefined ? "" : ` ${play().cabinetNumber}番台`}
          </span>
          <Show when={markOf(props.shown)} keyed>
            {(mark) => <span class={`ml-auto shrink-0 rounded-full px-1.5 text-[11px] font-semibold leading-5 ${mark.look}`}>{mark.words}</span>}
          </Show>
        </span>
        <span class="truncate text-xs text-text-muted">
          {parlorText(parlorOf(play()))}・{formatMoment(play().startedAt)}〜
        </span>
      </button>
    </li>
  )
}
