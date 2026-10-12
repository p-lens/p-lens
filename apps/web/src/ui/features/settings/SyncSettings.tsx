import { createResource, createSignal, For, Match, Show, Switch, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import type { ApplicationError, Outcome } from "../../../application/errors"
import { firstConflict, startSync, syncedBooks } from "../../../application/sync"
import { roleIn, type BookId, type ListedBook } from "../../../core/book/book"
import { Ok } from "../../../core/result/result"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { copyText } from "../../primitives/clipboard"
import { Loaded } from "../../primitives/states"
import { toast } from "../../primitives/toast"
import type { Place } from "../../navigation/place"
import { bookTitle } from "../../wording/book"
import { syncedText } from "../../wording/sync"
import { ViewHeader } from "../shell/ViewHeader"
import { ConflictPanel } from "./ConflictPanel"
import { FailureNote } from "./FailureNote"
import { JoinByCode } from "./JoinByCode"

/** A book of one's own as the screen lists it: its cover, and whether this device syncs it. */
interface Listed {
  readonly book: ListedBook
  readonly synced: boolean
}

/** What a press on this screen is doing, or how the last one failed. */
type Working = { readonly type: "idle" } | { readonly type: "working" } | { readonly type: "failed"; readonly error: ApplicationError }

/** One book of one's own: started on its way to one's other devices, or the code they join it with. */
function BookRow(props: { readonly listed: Listed; readonly onChanged: () => void }): JSX.Element {
  const app = useApp()
  const [working, setWorking] = createSignal<Working>({ type: "idle" })
  const coded = async (bookId: BookId): Promise<Outcome<string> | undefined> => {
    if (working().type === "working") return undefined
    setWorking({ type: "working" })
    const code = await startSync(app.services.sync, bookId, app.services.relayUrl)
    setWorking(code.ok ? { type: "idle" } : { type: "failed", error: code.error })
    return code
  }
  const start = async (): Promise<void> => {
    const code = await coded(props.listed.book.id)
    if (code?.ok !== true) return
    props.onChanged()
    app.sync.run()
  }
  const copyCode = async (): Promise<void> => {
    const code = await coded(props.listed.book.id)
    if (code?.ok !== true) return
    const copied = await copyText(code.value)
    toast(copied.ok ? { title: "同期コードをコピーしました", description: "もう一台の端末の「設定 → 端末の同期」に貼り付けてください。" } : { title: "コピーできませんでした", tone: "error" })
  }
  return (
    <li class="flex flex-col gap-2 rounded-md bg-surface-1 px-3 py-3">
      <div class="flex flex-wrap items-center gap-2">
        <span class="min-w-0 flex-1 truncate text-sm text-text-primary">{bookTitle(props.listed.book)}</span>
        <Show
          when={props.listed.synced}
          fallback={
            <Button size="small" variant="secondary" onClick={() => void start()}>
              同期を始める
            </Button>
          }
        >
          <span class="text-xs text-text-muted">同期中</span>
          <Button size="small" variant="secondary" onClick={() => void copyCode()}>
            同期コードをコピー
          </Button>
        </Show>
      </div>
      <Show when={working()} keyed>
        {(state) => (state.type === "failed" ? <FailureNote error={state.error} /> : undefined)}
      </Show>
    </li>
  )
}

/**
 * Syncing a person's own books between their own devices: which books go,
 * the code another of their devices joins one with, a book joined from
 * such a code, and how the last round went — every book this device
 * syncs, shared ones too, goes round together, so this is where a round
 * that stopped is seen and a conflict settled. Letting other people in is
 * another screen's: a book's own code is its key, and nothing here is for
 * handing to anyone. What travels is sealed on the device; the relay in
 * between reads none of it.
 */
export function SyncSettings(props: { readonly place: Place }): JSX.Element {
  const app = useApp()
  const [changed, setChanged] = createSignal(0)
  const [listed] = createResource(
    () => ({ revision: app.revision(), changed: changed() }),
    async (): Promise<Outcome<readonly Listed[]>> => {
      const [books, synced] = await Promise.all([app.services.session.books(), syncedBooks(app.services.sync.links)])
      if (!books.ok) return books
      if (!synced.ok) return synced
      return Ok(books.value.filter((book) => roleIn(book, app.services.member) === "owner").map((book) => ({ book, synced: synced.value.includes(book.id) })))
    },
  )
  const stuck = (): boolean => {
    const state = app.sync.state()
    return state.type === "failed" && state.error.type === "sync" && state.error.problem.type === "conflict"
  }
  const [conflict] = createResource(
    () => (stuck() ? { revision: app.revision(), changed: changed() } : undefined),
    () => firstConflict(app.services.sync),
  )
  const settled = (): void => {
    app.wrote()
    app.sync.run()
  }
  const changedHere = (): void => {
    setChanged((count) => count + 1)
  }
  const joined = (): void => {
    changedHere()
    app.wrote()
  }
  return (
    <MainContent header={<ViewHeader place={props.place} title="端末の同期" />}>
      <div class="max-w-5xl">
        <div class="flex flex-col gap-6 p-4">
          <p class="text-sm text-text-muted">自分の端末どうしで帳簿を揃えます。変更は端末の中で暗号化してから送るので、中継サーバは中身を読めません。同期コードは鍵そのものです。人には渡さないでください。</p>
          <section class="flex flex-col gap-2">
            <h2 class="text-xs font-bold uppercase tracking-wide text-text-muted">自分の帳簿</h2>
            <Loaded outcome={listed()}>
              {(books) => (
                <ul class="flex flex-col gap-1">
                  <For each={books}>{(each) => <BookRow listed={each} onChanged={changedHere} />}</For>
                </ul>
              )}
            </Loaded>
          </section>
          <section class="flex flex-col gap-2">
            <h2 class="text-xs font-bold uppercase tracking-wide text-text-muted">もう一台の端末の帳簿を追加</h2>
            <JoinByCode takes="own" onJoined={joined} />
          </section>
          <section class="flex flex-col gap-2">
            <h2 class="text-xs font-bold uppercase tracking-wide text-text-muted">いまの状態</h2>
            <div class="flex flex-wrap items-center gap-3">
              <Button size="small" variant="secondary" onClick={app.sync.run}>
                今すぐ同期
              </Button>
              <Switch>
                <Match when={app.sync.state().type === "syncing"}>
                  <span class="text-sm text-text-muted">同期しています…</span>
                </Match>
                <Match when={((state) => (state.type === "synced" ? state : undefined))(app.sync.state())} keyed>
                  {(state) => <span class="text-sm text-text-muted">{syncedText(state.synced)}</span>}
                </Match>
              </Switch>
            </div>
            <Show when={((state) => (state.type === "failed" ? state : undefined))(app.sync.state())} keyed>
              {(state) => <FailureNote error={state.error} />}
            </Show>
            <Show when={stuck()}>
              <Loaded outcome={conflict()}>
                {(found) => (
                  <Show when={found} keyed>
                    {(open) => <ConflictPanel conflict={open} onSettled={settled} />}
                  </Show>
                )}
              </Loaded>
            </Show>
          </section>
        </div>
      </div>
    </MainContent>
  )
}
