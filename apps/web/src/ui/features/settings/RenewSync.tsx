import { createSignal, Show, type JSX } from "solid-js"

import type { ApplicationError } from "../../../application/errors"
import { renewSync, type RenewSyncPorts } from "../../../application/renew-sync"
import type { ListedBook } from "../../../core/book/book"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { ConfirmDialog } from "../../primitives/dialog"
import { toast } from "../../primitives/toast"
import { bookTitle } from "../../wording/book"
import { RENEWED_SYNC, renewSyncWording } from "../../wording/sync"
import { FailureNote } from "./FailureNote"

/** What a press of the button is doing, or how the last one failed. */
type Working = { readonly type: "idle" } | { readonly type: "asking" } | { readonly type: "working" } | { readonly type: "failed"; readonly error: ApplicationError }

/**
 * The small button that makes a book's line anew under a new code, to
 * leave behind a device that had the old one, and the question asked
 * before. The code copied from the row after is the new one.
 */
export function RenewSync(props: { readonly book: ListedBook; readonly onRenewed: () => void }): JSX.Element {
  const app = useApp()
  const [working, setWorking] = createSignal<Working>({ type: "idle" })
  const wording = () => renewSyncWording(bookTitle(props.book))
  const ports = (): RenewSyncPorts => ({
    sync: app.services.sync,
    invitations: {
      links: app.services.sync.links,
      relay: app.services.sync.relay,
      sealer: app.services.sync.sealer,
      invitations: app.services.invitations,
      now: app.services.now,
      newId: () => crypto.randomUUID(),
    },
    follow: app.services.stopping.follow,
  })
  const renew = async (): Promise<void> => {
    setWorking({ type: "working" })
    const renewed = await renewSync(ports(), props.book.id, bookTitle(props.book))
    setWorking(renewed.ok ? { type: "idle" } : { type: "failed", error: renewed.error })
    if (!renewed.ok) return
    toast(RENEWED_SYNC)
    props.onRenewed()
    app.wrote()
  }
  return (
    <>
      <Button size="small" variant="outline" class="shrink-0" onClick={() => working().type !== "working" && setWorking({ type: "asking" })} aria-busy={working().type === "working"}>
        {working().type === "working" ? "作り直しています…" : wording().button}
      </Button>
      <ConfirmDialog
        open={working().type === "asking"}
        title={wording().question}
        confirm={wording().button}
        decline="やめる"
        onConfirmed={() => void renew()}
        onDeclined={() => setWorking({ type: "idle" })}
      >
        {wording().body.map((line) => (
          <p>{line}</p>
        ))}
      </ConfirmDialog>
      <Show when={working()} keyed>
        {(state) => (state.type === "failed" ? <div class="basis-full"><FailureNote error={state.error} /></div> : undefined)}
      </Show>
    </>
  )
}
