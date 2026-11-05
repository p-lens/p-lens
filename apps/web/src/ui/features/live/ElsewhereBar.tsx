import { Match, Switch, type JSX } from "solid-js"

import { Button } from "../../primitives/button"
import { arrivedSinceText, RECORD_ARRIVED } from "../../wording/sending"
import { ContinueBar } from "./ContinueBar"
import type { HeldElsewhere } from "./play-hold"

/**
 * What stands in place of what a person would do with a play this device
 * holds no draft of: for one another of the owner's devices holds, that it
 * does and the way to continue it here; for one someone sent, whose it is,
 * as of when it came, and at the row's end the way to record it.
 */
export function ElsewhereBar(props: { readonly hold: HeldElsewhere }): JSX.Element {
  return (
    <Switch>
      <Match when={props.hold.type === "followed" ? props.hold : undefined}>{(watched) => <ContinueBar shownAt={watched().shownAt} unreached={watched().unreached} onContinue={() => watched().onContinue()} />}</Match>
      <Match when={props.hold.type === "arrived" ? props.hold : undefined}>
        {(arrived) => (
          <div class="flex min-h-8 w-full items-center gap-2">
            <p class="min-w-0 flex-1 text-xs leading-4 text-text-muted">{arrivedSinceText(arrived().sender.name, arrived().shownAt)}</p>
            <Button size="small" class="shrink-0" onClick={() => arrived().onRecord()}>
              {RECORD_ARRIVED}
            </Button>
          </div>
        )}
      </Match>
    </Switch>
  )
}
