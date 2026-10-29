import { createSignal, For, Match, Switch, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { useApp } from "../../ui/context"
import { ViewHeader } from "../../ui/features/shell/ViewHeader"
import type { Place } from "../../ui/navigation/place"
import { Button } from "../../ui/primitives/button"
import { FIRST_TOUCH_RESET, RESET_ASK, RESET_CANCEL, RESET_DO, RESET_DONE, RESET_LINES } from "./wording"

/** Where forgetting the notes is: not asked, asked and waiting to be sure, or done. */
type Resetting = { readonly type: "resting" } | { readonly type: "asking" } | { readonly type: "done" }

/**
 * Showing 操作の手引き again: what the notes are and where they come, a
 * press that asks and a second that forgets every note the device has
 * shown, so that each comes again at the next touch. Books and plays are
 * left as they are.
 */
export function FirstTouchSettings(props: { readonly place: Place }): JSX.Element {
  const app = useApp()
  const [state, setState] = createSignal<Resetting>({ type: "resting" })
  const reset = (): void => {
    app.services.firstTouch.forget()
    setState({ type: "done" })
  }
  return (
    <MainContent header={<ViewHeader place={props.place} title={FIRST_TOUCH_RESET} />}>
      <div class="flex max-w-5xl flex-col items-start gap-3 p-4">
        <For each={RESET_LINES}>{(line) => <p class="text-sm text-text-secondary">{line}</p>}</For>
        <Switch>
          <Match when={state().type === "resting"}>
            <Button variant="secondary" onClick={() => setState({ type: "asking" })}>
              {FIRST_TOUCH_RESET}
            </Button>
          </Match>
          <Match when={state().type === "asking"}>
            <div role="alert" class="flex flex-col items-start gap-3 rounded-md border border-border bg-surface-3 p-3">
              <p class="text-sm text-text-primary">{RESET_ASK}</p>
              <div class="flex flex-wrap gap-2">
                <Button onClick={reset}>{RESET_DO}</Button>
                <Button variant="secondary" onClick={() => setState({ type: "resting" })}>
                  {RESET_CANCEL}
                </Button>
              </div>
            </div>
          </Match>
          <Match when={state().type === "done"}>
            <p role="status" class="text-sm text-positive">
              {RESET_DONE}
            </p>
          </Match>
        </Switch>
      </div>
    </MainContent>
  )
}
