import { createSignal, Show, type JSX } from "solid-js"

import { Button } from "../../primitives/button"
import { CONTINUE_HERE, CONTINUING_HERE, FOLLOWED_UNREACHED, followedSinceText } from "../../wording/play-line"

/**
 * What stands in place of what a person would do with a play while
 * another of the owner's devices holds it: that it does, as of when, and
 * at the row's end the way to continue it here — and, while this device
 * cannot reach the play's line, that the copy may not be up to date. Where
 * it stands is the screen's to say; while the copy is on its way the
 * button says so and takes no press.
 */
export function ContinueBar(props: { readonly shownAt: number; readonly unreached: boolean; readonly onContinue: () => Promise<void> }): JSX.Element {
  const [pressing, setPressing] = createSignal<"waiting" | "claiming">("waiting")
  const press = async (): Promise<void> => {
    if (pressing() === "claiming") return
    setPressing("claiming")
    await props.onContinue()
    setPressing("waiting")
  }
  return (
    <div class="flex min-h-8 w-full items-center gap-2">
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <p class="text-xs leading-4 text-text-muted">{followedSinceText(props.shownAt)}</p>
        <Show when={props.unreached}>
          <p class="text-xs leading-4 text-warning">{FOLLOWED_UNREACHED}</p>
        </Show>
      </div>
      <Button size="small" class="shrink-0" onClick={() => void press()} aria-busy={pressing() === "claiming"}>
        {pressing() === "claiming" ? CONTINUING_HERE : CONTINUE_HERE}
      </Button>
    </div>
  )
}
