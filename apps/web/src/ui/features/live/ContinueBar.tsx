import { createSignal, Show, type JSX } from "solid-js"

import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { CONTINUE_HERE, CONTINUING_HERE, followedSinceText, followedUnheardText } from "../../wording/play-line"

/**
 * What stands in place of what a person would do with a play while
 * another of the owner's devices holds it: that it does, as of when, and
 * at the row's end the way to continue it here — and, while this device
 * cannot read the play's line, that the copy is not up to date and since
 * when. Where it stands is the screen's to say; while the claim is on its
 * way the button says so and takes no press.
 */
export function ContinueBar(props: { readonly shownAt: string; readonly onContinue: () => Promise<void> }): JSX.Element {
  const app = useApp()
  const [pressing, setPressing] = createSignal<"waiting" | "claiming">("waiting")
  const press = async (): Promise<void> => {
    if (pressing() === "claiming") return
    setPressing("claiming")
    await props.onContinue()
    setPressing("waiting")
  }
  return (
    <div class="flex min-h-8 items-center gap-2">
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <p class="text-xs leading-4 text-text-muted">{followedSinceText(props.shownAt)}</p>
        <Show when={((heard) => (heard.type === "unreached" ? heard : undefined))(app.playLine.heard())} keyed>
          {(heard) => <p class="text-xs leading-4 text-warning">{followedUnheardText(heard.since, heard.error)}</p>}
        </Show>
      </div>
      <Button size="small" class="shrink-0" onClick={() => void press()} aria-busy={pressing() === "claiming"}>
        {pressing() === "claiming" ? CONTINUING_HERE : CONTINUE_HERE}
      </Button>
    </div>
  )
}
