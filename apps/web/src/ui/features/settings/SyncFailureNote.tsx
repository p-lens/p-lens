import { createResource, For, Show, type JSX } from "solid-js"

import { laggingOf, type SyncFailure } from "../../../application/sync"
import { useApp } from "../../context"
import { lastSyncedText } from "../../wording/sync"
import { syncFailuresSaid } from "../shell/sync-failure"

/** Why the last round stopped, at each book that did, and — where any is behind for something a round may get past — since when the books are out of date. */
export function SyncFailureNote(props: { readonly failures: readonly SyncFailure[] }): JSX.Element {
  const app = useApp()
  const [said] = createResource(
    () => props.failures,
    (failures) => syncFailuresSaid(app.services.session, failures),
  )
  return (
    <div role="alert" class="flex flex-col gap-1 rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-text-primary">
      <For each={said.latest ?? []}>{(line) => <p>{line}</p>}</For>
      <Show when={laggingOf(props.failures).length > 0}>
        <span class="block text-xs text-text-muted">{lastSyncedText(app.sync.lastSynced())}</span>
      </Show>
    </div>
  )
}
