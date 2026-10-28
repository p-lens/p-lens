import { createSignal, type JSX } from "solid-js"

import { Button } from "../../primitives/button"
import { CONTINUE_HERE, followedSinceText } from "../../wording/play-line"

/**
 * What stands in place of what a person would do with a play while
 * another of the owner's devices holds it: that it does, as of when, and
 * at the row's end the way to continue it here. Where it stands is the
 * screen's to say; pressed again before the claim is settled, it is
 * passed over.
 */
export function ContinueBar(props: { readonly shownAt: string; readonly onContinue: () => Promise<void> }): JSX.Element {
  const [pressing, setPressing] = createSignal<"waiting" | "claiming">("waiting")
  const press = async (): Promise<void> => {
    if (pressing() === "claiming") return
    setPressing("claiming")
    await props.onContinue()
    setPressing("waiting")
  }
  return (
    <div class="flex min-h-8 items-center gap-2">
      <p class="min-w-0 flex-1 text-xs leading-4 text-text-muted">{followedSinceText(props.shownAt)}</p>
      <Button size="small" class="shrink-0" onClick={() => void press()}>
        {CONTINUE_HERE}
      </Button>
    </div>
  )
}
