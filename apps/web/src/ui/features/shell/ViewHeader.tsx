import { Show, type JSX } from "solid-js"
import { Breadcrumb, type Crumb, useArrangement } from "solid-gathering-shell"

import { BackIcon, UrgedBackIcon } from "../../primitives/icons"
import { useMoves } from "../../navigation/moves"
import { parentOf, type Place } from "../../navigation/place"

/** How loudly the way back is urged: hot, or only to be looked at. */
export type Urge = "loud" | "quiet"

/** How each urge is drawn: red with a heartbeat where it is hot, in the text's own colour with a jab where it is not; either swells from its right end, so that swelling too pushes toward the list. */
const URGE_LOOKS: Readonly<Record<Urge, string>> = {
  loud: "text-negative animate-[urge-loud_1.2s_ease-out_infinite]",
  quiet: "text-text-primary animate-[urge_1.2s_ease-out_infinite]",
}

/**
 * The title of what is on screen, with a way back up in a narrow window,
 * where the list it was chosen from is not beside it. The hardware back
 * button does the same; this is for the windows without one.
 *
 * A place deeper than one level gives a `trail` instead: the steps that led
 * to it, as a thread shows its channel, each earlier one a way back.
 */
export function ViewHeader(props: {
  readonly place: Place
  readonly title: string
  readonly trail?: readonly Crumb[] | undefined
  readonly actions?: JSX.Element
  /** Whether the way back is urged on, and how loud: drawn as <<<, each as large as the chevron alone, jabbing at the list while something there wants looking at — red and swelling like a heartbeat where it is hot, in the text's own colour where it is not. */
  readonly urged?: Urge | undefined
}): JSX.Element {
  const arrangement = useArrangement()
  const moves = useMoves()
  return (
    <div class="flex min-w-0 flex-1 items-center gap-2">
      <Show when={arrangement() === "narrow" && parentOf(props.place) !== undefined}>
        <button
          type="button"
          class="-ml-2 flex h-8 items-center justify-center rounded text-text-secondary hover:bg-surface-3 hover:text-text-primary"
          classList={{ "w-8": props.urged === undefined, "px-0.5": props.urged !== undefined }}
          onClick={() => moves.up(props.place)}
        >
          <Show when={props.urged} keyed fallback={<BackIcon label="戻る" />}>
            {(urge) => (
              <span class={`flex origin-right motion-reduce:animate-none ${URGE_LOOKS[urge]}`}>
                <UrgedBackIcon label="戻る" />
              </span>
            )}
          </Show>
        </button>
      </Show>
      <Show when={props.trail} keyed fallback={<h1 class="min-w-0 flex-1 truncate text-[13px] font-semibold text-text-primary sm:text-sm">{props.title}</h1>}>
        {(trail) => <Breadcrumb label="現在地" items={trail} />}
      </Show>
      {props.actions}
    </div>
  )
}
