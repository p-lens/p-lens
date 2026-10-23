import { Show, type JSX } from "solid-js"

import { isMumming } from "../../../mummer"
import { useMoves } from "../../navigation/moves"
import { MaskIcon } from "../../primitives/icons"
import { MUMMER_HEADING, MUMMER_MARK } from "../../wording/mummer"

/**
 * The top bar's left corner while mumming: a mask and its name, there on
 * every screen so that it is never left on unseen. Pressed, it only goes
 * to where mumming is turned off, so a press by mistake on a stream shows
 * nothing it veils.
 */
export function MummingMark(): JSX.Element {
  const moves = useMoves()
  return (
    <Show when={isMumming()}>
      <button
        type="button"
        onClick={() => moves.go({ kind: "settings-section", section: "mummer" })}
        aria-label={MUMMER_MARK}
        title={MUMMER_MARK}
        class="flex h-7 items-center gap-1 rounded px-1.5 text-xs font-semibold text-negative hover:bg-surface-3 [&_svg]:size-4"
      >
        <MaskIcon />
        {MUMMER_HEADING}
      </button>
    </Show>
  )
}
