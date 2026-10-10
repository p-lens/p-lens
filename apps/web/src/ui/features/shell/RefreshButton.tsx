import type { JSX } from "solid-js"

import type { ApplicationError } from "../../../application/errors"
import { useApp } from "../../context"
import { RefreshIcon } from "../../primitives/icons"
import { describeError } from "../../wording/errors"

/**
 * A button in the top bar's corner that brings the device up to date now,
 * rather than when the app next looks: the shared catalog's newest
 * delivery taken, and the device's books synced with their lines, which
 * also brings in what others have sent. It turns while either is under
 * way, and says why in its title when the last of either failed. A build
 * that names no shared catalog has only its books to bring up to date.
 */
export function RefreshButton(): JSX.Element {
  const app = useApp()
  const busy = (): boolean => app.delivery.state().type === "refreshing" || app.sync.state().type === "syncing"
  const failure = (): ApplicationError | undefined => {
    const [delivery, sync] = [app.delivery.state(), app.sync.state()]
    if (sync.type === "failed") return sync.error
    return delivery.type === "failed" ? delivery.error : undefined
  }
  const title = (): string => {
    if (busy()) return "更新しています"
    const failed = failure()
    return failed === undefined ? "機種・算出条件の更新と同期" : `更新できませんでした: ${describeError(failed)}`
  }
  const refresh = (): void => {
    if (busy()) return
    if (app.services.catalogShared) app.delivery.refresh()
    app.sync.run()
  }
  return (
    <button
      type="button"
      onClick={refresh}
      aria-label={title()}
      title={title()}
      aria-busy={busy()}
      class="flex size-7 items-center justify-center rounded hover:bg-surface-3 hover:text-text-primary [&_svg]:size-5"
      classList={{ "text-text-muted": failure() === undefined, "text-negative": failure() !== undefined, "[&_svg]:animate-spin": busy() }}
    >
      <RefreshIcon />
    </button>
  )
}
