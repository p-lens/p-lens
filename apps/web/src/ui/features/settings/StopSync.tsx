import { createSignal, Show, type JSX } from "solid-js"

import type { ApplicationError } from "../../../application/errors"
import { stopSync } from "../../../application/stop-sync"
import type { ListedBook } from "../../../core/book/book"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { ConfirmDialog } from "../../primitives/dialog"
import { toast } from "../../primitives/toast"
import { bookTitle } from "../../wording/book"
import { stoppedSyncText, stopSyncWording, type StopSyncWay } from "../../wording/sync"
import { FailureNote } from "./FailureNote"

/** What a press of the button is doing, or how the last one failed. */
type Working = { readonly type: "idle" } | { readonly type: "asking" } | { readonly type: "working" } | { readonly type: "failed"; readonly error: ApplicationError }

/**
 * The small button that stops a book syncing on this device — one's own
 * book, or one let into, as `way` says — and the question asked before.
 * A round runs first, so what this device wrote reaches the line before
 * the device lets go of it, wherever the relay can be reached; where it
 * cannot, the book stops all the same, and what was not sent stays here.
 */
export function StopSync(props: { readonly book: ListedBook; readonly way: StopSyncWay; readonly onStopped: () => void }): JSX.Element {
  const app = useApp()
  const [working, setWorking] = createSignal<Working>({ type: "idle" })
  const wording = () => stopSyncWording(props.way, bookTitle(props.book))
  const stop = async (): Promise<void> => {
    setWorking({ type: "working" })
    await app.sync.run()
    const stopped = await stopSync(app.services.stopping, props.book.id)
    setWorking(stopped.ok ? { type: "idle" } : { type: "failed", error: stopped.error })
    if (!stopped.ok) return
    toast({ title: stoppedSyncText(props.way), description: bookTitle(props.book) })
    props.onStopped()
    app.wrote()
  }
  return (
    <>
      <Button size="small" variant="outline" class="shrink-0" onClick={() => working().type !== "working" && setWorking({ type: "asking" })} aria-busy={working().type === "working"}>
        {working().type === "working" ? "処理しています…" : wording().button}
      </Button>
      <ConfirmDialog
        open={working().type === "asking"}
        title={wording().question}
        confirm={wording().button}
        decline="やめる"
        onConfirmed={() => void stop()}
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
