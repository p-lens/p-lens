import { createResource, createSignal, For, Match, Show, Switch, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import type { ApplicationError, Outcome } from "../../../application/errors"
import { destinationsOf, forgetDestination } from "../../../application/sending"
import { firstConflict, joinByCode, startSync, syncedBooks } from "../../../application/sync"
import { roleIn, type BookId, type TitledBook } from "../../../core/book/book"
import { Ok } from "../../../core/result/result"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { copyText } from "../../primitives/clipboard"
import { createNudge } from "../../primitives/nudge"
import { Loaded } from "../../primitives/states"
import { TextField } from "../../primitives/text-field"
import { toast } from "../../primitives/toast"
import type { Place } from "../../navigation/place"
import { bookTitle } from "../../wording/book"
import { describeError } from "../../wording/errors"
import { syncedText } from "../../wording/sync"
import { ViewHeader } from "../shell/ViewHeader"
import { ConflictPanel } from "./ConflictPanel"
import { MembersPanel } from "./MembersPanel"

/** A book as the sync screen lists it: its cover, and whether this device syncs it. */
interface Listed {
  readonly book: TitledBook
  readonly synced: boolean
}

/** What a press on this screen is doing, or how the last one failed. */
type Working = { readonly type: "idle" } | { readonly type: "working" } | { readonly type: "failed"; readonly error: ApplicationError }

function Failure(props: { readonly error: ApplicationError }): JSX.Element {
  return (
    <p role="alert" class="rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-text-primary">
      {describeError(props.error)}
    </p>
  )
}

/**
 * One book: started on its way to its other devices, or the code they join
 * it with — and, for its owner, the people let into it, opened under the
 * row. A book this device was itself let into says so, and what it may do
 * with it, in place of both.
 */
function BookRow(props: { readonly listed: Listed; readonly onChanged: () => void }): JSX.Element {
  const app = useApp()
  const [working, setWorking] = createSignal<Working>({ type: "idle" })
  /** Whether the list of those let into the book is open under its row. */
  const [inviting, setInviting] = createSignal(false)
  const role = () => roleIn(props.listed.book, app.services.member)
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
    toast(copied.ok ? { title: "同期コードをコピーしました", description: "もう一台の端末の「設定 → 同期」に貼り付けてください。" } : { title: "コピーできませんでした", tone: "error" })
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
          <Show when={role() === "owner"} fallback={<span class="text-xs text-text-muted">{role() === "editor" ? "招待された帳簿（編集）" : "招待された帳簿（閲覧のみ）"}</span>}>
            <span class="text-xs text-text-muted">同期中</span>
            <Button size="small" variant="secondary" onClick={() => void copyCode()}>
              同期コードをコピー
            </Button>
            <Button size="small" variant="secondary" onClick={() => setInviting((open) => !open)}>
              {inviting() ? "招待を閉じる" : "仲間を招待"}
            </Button>

          </Show>
        </Show>
      </div>
      <Show when={props.listed.synced && role() === "owner" && inviting()}>
        <MembersPanel bookId={props.listed.book.id} title={bookTitle(props.listed.book)} />
      </Show>

      <Show when={working()} keyed>
        {(state) => (state.type === "failed" ? <Failure error={state.error} /> : undefined)}
      </Show>
    </li>
  )
}

/**
 * The books of other people this device may send plays to, each in a line
 * with the small button that lets go of it. Shown only where there is one.
 */
function Destinations(props: { readonly changed: number; readonly onChanged: () => void }): JSX.Element {
  const app = useApp()
  const [destinations] = createResource(
    () => props.changed,
    () => destinationsOf(app.services.destinations),
  )
  const found = () => ((listed) => (listed?.ok === true ? listed.value : []))(destinations())
  return (
    <Show when={found().length > 0}>
      <section class="flex flex-col gap-2">
        <h2 class="text-xs font-bold uppercase tracking-wide text-text-muted">稼働の送り先</h2>
        <ul class="flex flex-col gap-1">
          <For each={found()}>
            {(destination) => (
              <li class="flex items-center gap-2 rounded-md bg-surface-1 py-2 pl-3 pr-2">
                <span class="min-w-0 flex-1 break-words text-sm text-text-primary">{destination.title}</span>
                <Button
                  size="small"
                  variant="outline"
                  class="shrink-0"
                  onClick={() => void forgetDestination(app.services.destinations, destination).then(() => props.onChanged())}
                >
                  外す
                </Button>
              </li>
            )}
          </For>
        </ul>
        <p class="text-xs text-text-muted">「本日の稼働」の紙ヒコーキで送れます。相手の帳簿の中身は、この端末からは見えません。</p>
      </section>
    </Show>
  )
}

/** Another device's book, or another person's, joined by the code that was handed over; or a book to send plays to, by a code that lets this device do only that. */
function Join(props: { readonly onJoined: () => void }): JSX.Element {
  const app = useApp()
  const nudge = createNudge()
  const [code, setCode] = createSignal("")
  const [working, setWorking] = createSignal<Working>({ type: "idle" })
  const join = async (): Promise<void> => {
    if (working().type === "working") return
    if (code().trim() === "") {
      nudge.nudge()
      return
    }
    setWorking({ type: "working" })
    const joined = await joinByCode({ ...app.services.sync, destinations: app.services.destinations }, code(), app.services.relayUrl)
    setWorking(joined.ok ? { type: "idle" } : { type: "failed", error: joined.error })
    if (!joined.ok) return
    setCode("")
    toast(
      joined.value.type === "book"
        ? { title: "帳簿を追加しました", description: "この端末でも同じ帳簿を使えます。" }
        : { title: "送り先を追加しました", description: `「本日の稼働」から「${joined.value.title}」に送れます。` },
    )
    props.onJoined()
  }
  return (
    <div class="flex flex-col gap-2">
      <TextField label="同期コード・招待コード" value={code()} onChange={setCode} placeholder="もう一台の端末や、仲間からもらったコード" required invalid={nudge.red() && code().trim() === ""} onFocus={nudge.settle} />
      <div>
        <Button size="small" onClick={() => void join()}>
          この端末に追加
        </Button>
      </div>
      <Show when={working()} keyed>
        {(state) => (state.type === "failed" ? <Failure error={state.error} /> : undefined)}
      </Show>
    </div>
  )
}

/**
 * Syncing a person's books between their own devices: which books go, the
 * code another device joins one with, a book joined from another's code, and
 * how the last round went. What travels is sealed on the device; the relay
 * in between reads none of it.
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
      return Ok(books.value.map((book) => ({ book, synced: synced.value.includes(book.id) })))
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
    <MainContent header={<ViewHeader place={props.place} title="同期" />}>
      <div class="max-w-5xl">
        <div class="flex flex-col gap-6 p-4">
          <p class="text-sm text-text-muted">
            自分の端末どうしで帳簿を揃えます。変更は端末の中で暗号化してから送るので、中継サーバは中身を読めません。同期コードは鍵そのものです。人には渡さず、仲間には「仲間を招待」で作る招待コードを渡してください。
          </p>
          <section class="flex flex-col gap-2">
            <h2 class="text-xs font-bold uppercase tracking-wide text-text-muted">帳簿</h2>
            <Loaded outcome={listed()}>
              {(books) => (
                <ul class="flex flex-col gap-1">
                  <For each={books}>{(each) => <BookRow listed={each} onChanged={changedHere} />}</For>
                </ul>
              )}
            </Loaded>
          </section>
          <Destinations changed={changed()} onChanged={changedHere} />
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
              {(state) => <Failure error={state.error} />}
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
          <section class="flex flex-col gap-2">
            <h2 class="text-xs font-bold uppercase tracking-wide text-text-muted">コードで帳簿を追加</h2>
            <Join onJoined={joined} />
          </section>
        </div>
      </div>
    </MainContent>
  )
}
