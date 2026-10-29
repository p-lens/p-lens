import { Match, Switch, type JSX } from "solid-js"

import { isMumming, isPlainLabelShown, startMumming } from "../../../mummer"
import { useApp } from "../../context"
import { useMoves } from "../../navigation/moves"
import { createHourStruck } from "../../primitives/hour"
import { MaskIcon } from "../../primitives/icons"
import { MUMMER_HEADING, MUMMER_MARK, PLAIN_LABEL, PLAIN_LABEL_READ } from "../../wording/mummer"

/**
 * The top bar's left corner while mumming: a mask and its name, there on
 * every screen so that it is never left on unseen. Pressed, it only goes
 * to where mumming is turned off, so a press by mistake on a stream shows
 * nothing it veils. Mumming turned off on a business day it was on, the
 * corner keeps a faint 通常表示 until the day turns, pressed to mum again
 * at once; one who did not mum that day sees nothing there.
 */
export function MummingMark(): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const hour = createHourStruck()
  const plainShown = (): boolean => {
    hour()
    return isPlainLabelShown(app.services.businessDay())
  }
  return (
    <Switch>
      <Match when={isMumming()}>
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
      </Match>
      <Match when={plainShown()}>
        <button
          type="button"
          onClick={() => startMumming(app.services.businessDay())}
          aria-label={PLAIN_LABEL_READ}
          title={PLAIN_LABEL_READ}
          class="flex h-7 items-center rounded px-1.5 text-xs text-text-muted opacity-40 hover:bg-surface-3"
        >
          {PLAIN_LABEL}
        </button>
      </Match>
    </Switch>
  )
}
