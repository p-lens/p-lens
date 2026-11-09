import { createSignal, onCleanup, Show, type JSX } from "solid-js"

import { useApp } from "../../context"
import { CloudOffIcon, RefreshIcon } from "../../primitives/icons"
import { toast } from "../../primitives/toast"
import { REFRESH_FAILED, REFRESH_OFFLINE, REFRESH_TITLE, REFRESHING } from "../../wording/catalog"
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
 * words — a phone has no hover to read a title by. While the device is
 * offline it is a cloud struck through, in the bar's quiet colour and not
 * the colour of a failure, so that nobody takes the app to be unusable
 * offline; pressed, it still asks, in case the device was wrong. A build
 * that names no shared catalog has nothing to bring up to date, and no
 * button.
 */
export function RefreshButton(): JSX.Element {
  const app = useApp()
  const [pressed, setPressed] = createSignal<Pressed>("turned")
  const turning: { timer: ReturnType<typeof setTimeout> | undefined } = { timer: undefined }
  onCleanup(() => clearTimeout(turning.timer))
  const busy = (): boolean => app.delivery.state().type === "refreshing" || pressed() === "turning"
  const [online, setOnline] = createSignal(navigator.onLine)
  const wentOnline = (): void => void setOnline(true)
  const wentOffline = (): void => void setOnline(false)
  window.addEventListener("online", wentOnline)
  window.addEventListener("offline", wentOffline)
  onCleanup(() => {
    window.removeEventListener("online", wentOnline)
    window.removeEventListener("offline", wentOffline)
  })
  const failed = (): boolean => online() && app.delivery.state().type === "failed"
  const title = (): string => (busy() ? REFRESHING : online() ? REFRESH_TITLE : REFRESH_OFFLINE)
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
        aria-label={title()}
        title={title()}
        aria-busy={busy()}
        class="flex h-7 min-w-7 items-center justify-center gap-1 rounded px-1 hover:bg-surface-3 hover:text-text-primary [&_svg]:size-5"
        classList={{ "text-text-muted": !failed(), "text-negative": failed(), "[&_svg]:animate-spin": busy() }}
      >
        <Show when={online() || busy()} fallback={<CloudOffIcon />}>
          <RefreshIcon />
        </Show>
      </button>
    </Show>
  )
}
