import { Show, type JSX } from "solid-js"
import { Breadcrumb, type Crumb, useArrangement } from "solid-gathering-shell"

import { BackIcon } from "../../primitives/icons"
import { useMoves } from "../../navigation/moves"
import { parentOf, type Place } from "../../navigation/place"

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
}): JSX.Element {
  const arrangement = useArrangement()
  const moves = useMoves()
  return (
    <div class="flex min-w-0 flex-1 items-center gap-2">
      <Show when={arrangement() === "narrow" && parentOf(props.place) !== undefined}>
        <button
          type="button"
          class="-ml-2 flex size-8 items-center justify-center rounded text-text-secondary hover:bg-surface-3 hover:text-text-primary"
          onClick={() => moves.up(props.place)}
        >
          <BackIcon label="戻る" />
        </button>
      </Show>
      <Show when={props.trail} keyed fallback={<h1 class="min-w-0 flex-1 truncate text-[13px] font-semibold text-text-primary sm:text-sm">{props.title}</h1>}>
        {(trail) => <Breadcrumb label="現在地" items={trail} />}
      </Show>
      {props.actions}
    </div>
  )
}
