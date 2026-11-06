import { createSignal, onCleanup, Show, type JSX } from "solid-js"

import { useApp } from "../../context"
import { RefreshIcon } from "../../primitives/icons"
import { toast } from "../../primitives/toast"
import { REFRESH_FAILED, REFRESH_TITLE, REFRESHING } from "../../wording/catalog"
import { describeError } from "../../wording/errors"

/** How long the button turns at least once pressed, in milliseconds: an answer back sooner is still seen to have been asked for. */
const TURNS_FOR = 800

/** Whether a press is still within the time the button turns for at least. */
type Pressed = "turning" | "turned"

/**
 * A button in the top bar's corner that takes the shared catalog's newest
 * delivery now, rather than when the app next looks. It turns while it is
 * under way, and for 0.8 seconds at least, so that a delivery come back at
 * once is still seen to have been fetched; and a press that failed ends in
 * words — a phone has no hover to read a title by. A build that names no
 * shared catalog has nothing to bring up to date, and no button.
 */
export function RefreshButton(): JSX.Element {
  const app = useApp()
  const [pressed, setPressed] = createSignal<Pressed>("turned")
  const turning: { timer: ReturnType<typeof setTimeout> | undefined } = { timer: undefined }
  onCleanup(() => clearTimeout(turning.timer))
  const busy = (): boolean => app.delivery.state().type === "refreshing" || pressed() === "turning"
  const failed = (): boolean => app.delivery.state().type === "failed"
  const refresh = async (): Promise<void> => {
    if (busy()) return
    setPressed("turning")
    turning.timer = setTimeout(() => setPressed("turned"), TURNS_FOR)
    const delivered = await app.delivery.refresh()
    if (delivered.type === "failed") toast({ title: REFRESH_FAILED, description: describeError(delivered.error), tone: "error" })
  }
  return (
    <Show when={app.services.catalogShared}>
      <button
        type="button"
        onClick={() => void refresh()}
        aria-label={busy() ? REFRESHING : REFRESH_TITLE}
        title={busy() ? REFRESHING : REFRESH_TITLE}
        aria-busy={busy()}
        class="flex h-7 min-w-7 items-center justify-center gap-1 rounded px-1 hover:bg-surface-3 hover:text-text-primary [&_svg]:size-5"
        classList={{ "text-text-muted": !failed(), "text-negative": failed(), "[&_svg]:animate-spin": busy() }}
      >
        <RefreshIcon />
      </button>
    </Show>
  )
}
