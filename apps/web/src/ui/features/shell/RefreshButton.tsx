import { Show, type JSX } from "solid-js"

import type { ApplicationError } from "../../../application/errors"
import { type AppContext, type DeliveryState, lagging, type SyncState, useApp } from "../../context"
import { RefreshIcon } from "../../primitives/icons"
import { toast } from "../../primitives/toast"
import { NO_CONNECTION } from "../../wording/connection"
import { describeError } from "../../wording/errors"
import { isOffline, lastSyncedText, NOT_SYNCED_MARK, REFRESH_FAILED } from "../../wording/sync"
import { syncFailuresSaid } from "./sync-failure"

const isOfflineError = (error: ApplicationError): boolean =>
  (error.type === "sync" && isOffline(error.problem)) || (error.type === "catalog" && (error.error.type === "unavailable" || error.error.type === "unreadable-answer"))

/** What a press that failed is told: no connection, where either side found none, said once for both; else every book that stopped, each named, or the catalog's failure. */
const failureSaid = async (app: AppContext, delivered: DeliveryState | undefined, synced: SyncState): Promise<string | undefined> => {
  const errors = [...(synced.type === "failed" ? synced.failures.map((failure) => failure.error) : []), ...(delivered?.type === "failed" ? [delivered.error] : [])]
  if (errors.length === 0) return undefined
  if (errors.some(isOfflineError)) return NO_CONNECTION
  if (synced.type === "failed") return (await syncFailuresSaid(app.services.session, synced.failures)).join(" ")
  return errors[0] === undefined ? undefined : describeError(errors[0])
}

/**
 * A button in the top bar's corner that brings the device up to date now,
 * rather than when the app next looks: the shared catalog's newest
 * delivery taken, and the device's books synced with their lines, which
 * also brings in what others have sent. It turns while either is under
 * way. Pressed, it ends in words where either failed — a phone has no
 * hover to read a title by. Unpressed, a round that left a book out of
 * date is marked beside it in a word, quietly, until one goes through; a
 * book waiting on a person — a conflict to choose in, a book let go of — is
 * told where its books are, and marks nothing here. A build that
 * names no shared catalog has only its books to bring up to date.
 */
export function RefreshButton(): JSX.Element {
  const app = useApp()
  const busy = (): boolean => app.delivery.state().type === "refreshing" || app.sync.state().type === "syncing"
  const behind = (): boolean => lagging(app.sync.state()).length > 0
  const failed = (): boolean => behind() || app.delivery.state().type === "failed"
  const title = (): string => {
    if (busy()) return "更新しています"
    return behind() ? `${NOT_SYNCED_MARK}（${lastSyncedText(app.sync.lastSynced())}）` : "機種・算出条件の更新と同期"
  }
  const refresh = async (): Promise<void> => {
    if (busy()) return
    const [delivered, synced] = await Promise.all([app.services.catalogShared ? app.delivery.refresh() : Promise.resolve(undefined), app.sync.run()])
    const said = await failureSaid(app, delivered, synced)
    if (said !== undefined) toast({ title: REFRESH_FAILED, description: lagging(synced).length > 0 ? `${said}（${lastSyncedText(app.sync.lastSynced())}）` : said, tone: "error" })
  }
  return (
    <button
      type="button"
      onClick={() => void refresh()}
      aria-label={title()}
      title={title()}
      aria-busy={busy()}
      class="flex h-7 min-w-7 items-center justify-center gap-1 rounded px-1 hover:bg-surface-3 hover:text-text-primary [&_svg]:size-5"
      classList={{ "text-text-muted": !failed(), "text-negative": failed(), "[&_svg]:animate-spin": busy() }}
    >
      <RefreshIcon />
      <Show when={behind() && !busy()}>
        <span class="whitespace-nowrap text-xs">{NOT_SYNCED_MARK}</span>
      </Show>
    </button>
  )
}
