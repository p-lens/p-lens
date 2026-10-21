import { createResource, createSignal, For, Match, Show, Switch, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import type { ApplicationError, Outcome } from "../../../application/errors"
import { destinationsOf, forgetDestination } from "../../../application/sending"
import { startSync, syncedBooks } from "../../../application/sync"
import { roleIn, type ListedBook } from "../../../core/book/book"
import { Ok } from "../../../core/result/result"
import { useApp } from "../../context"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { Button } from "../../primitives/button"
import { Loaded } from "../../primitives/states"
import { bookTitle } from "../../wording/book"
import { syncedText } from "../../wording/sync"
import { ViewHeader } from "../shell/ViewHeader"
import { FailureNote } from "./FailureNote"
import { JoinByCode } from "./JoinByCode"
import { MembersPanel } from "./MembersPanel"

/** A book as the sharing screen lists it: its cover, and whether it is on its way anywhere yet. */
interface Listed {
  readonly book: ListedBook
  readonly synced: boolean
}

/** What a press on a row is doing, or how the last one failed. */
type Working = { readonly type: "idle" } | { readonly type: "working" } | { readonly type: "failed"; readonly error: ApplicationError }

/**
 * One book of one's own, and the people let into it, opened under its row.
 * A book has to be on its way through the relay before anyone can be let
 * into it; one that is not yet is started as the row is opened, so the
 * person inviting is not sent to another screen first.
 */
function OwnBookRow(props: { readonly listed: Listed; readonly onChanged: () => void }): JSX.Element {
  const app = useApp()
  const [working, setWorking] = createSignal<Working>({ type: "idle" })
  const [inviting, setInviting] = createSignal(false)
  const open = async (): Promise<void> => {
    if (working().type === "working") return
    if (!props.listed.synced) {
      setWorking({ type: "working" })
      const started = await startSync(app.services.sync, props.listed.book.id, app.services.relayUrl)
      setWorking(started.ok ? { type: "idle" } : { type: "failed", error: started.error })
      if (!started.ok) return
      props.onChanged()
      app.sync.run()
    }
    setInviting(true)
  }
  return (
    <li class="flex flex-col gap-2 rounded-md bg-surface-1 px-3 py-3">
      <div class="flex flex-wrap items-center gap-2">
        <span class="min-w-0 flex-1 truncate text-sm text-text-primary">{bookTitle(props.listed.book)}</span>
        <Button size="small" variant="secondary" onClick={() => (inviting() ? setInviting(false) : void open())}>
          {inviting() ? "招待を閉じる" : "仲間を招待"}
        </Button>
      </div>
      <Show when={inviting()}>
        <MembersPanel bookId={props.listed.book.id} title={bookTitle(props.listed.book)} />
      </Show>
      <Show when={working()} keyed>
        {(state) => (state.type === "failed" ? <FailureNote error={state.error} /> : undefined)}
      </Show>
    </li>
  )
}

/** The books of other people this device may send plays to, each in a line with the small button that lets go of it. Shown only where there is one, or where what the device keeps of them does not read. */
function Destinations(props: { readonly changed: number; readonly onChanged: () => void }): JSX.Element {
  const app = useApp()
  const [destinations] = createResource(
    () => props.changed,
    () => destinationsOf(app.services.destinations),
  )
  const found = () => ((listed) => (listed?.ok === true ? listed.value : []))(destinations())
  const failure = (): ApplicationError | undefined => ((listed) => (listed?.ok === false ? listed.error : undefined))(destinations())
  return (
    <>
      <Show when={failure()} keyed>
        {(error) => <FailureNote error={error} />}
      </Show>
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
                    onClick={() =>
                      void forgetDestination(app.services.destinations, destination).then(() => {
                        props.onChanged()
                        app.wrote()
                      })
                    }
                  >
                    外す
                  </Button>
                </li>
              )}
            </For>
          </ul>
          <p class="text-xs text-text-muted">左の列の送り先から、または「本日の稼働」で送りたい稼働の紙ヒコーキを押して送れます。相手の帳簿の中身は、この端末からは見えません。</p>
        </section>
      </Show>
    </>
  )
}

/**
 * How the last round of syncing went, in a line: sharing rides on it, so a
 * round that stopped is said here too, with the way to where it is looked
 * into and a conflict settled — the screen of one's own devices, which has
 * the whole of it.
 */
function SyncStanding(): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  return (
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
      <Switch>
        <Match when={app.sync.state().type === "syncing"}>
          <span>同期しています…</span>
        </Match>
        <Match when={((state) => (state.type === "synced" ? state : undefined))(app.sync.state())} keyed>
          {(state) => <span>{syncedText(state.synced)}</span>}
        </Match>
        <Match when={app.sync.state().type === "failed"}>
          <span class="font-bold text-negative">同期が止まっています。</span>
          <button type="button" class="underline underline-offset-2 hover:text-text-primary" onClick={() => moves.go({ kind: "settings-section", section: "sync" })}>
            「端末の同期」で確認する
          </button>
        </Match>
      </Switch>
    </div>
  )
}

/**
 * Sharing books with other people. First the place an invitation is typed
 * into, and what came of those typed in already — the books one was let
 * into, the books one may only send plays to — which is all most people
 * need; then, below a rule, one's own books and who is let into each, for
 * whoever invites. Underneath it rides
 * on the same lines a person's own devices sync by, but to the person it
 * is another thing: nothing here shows a book's own code, which is its
 * key, and what is handed to someone is always an invitation made for
 * them alone.
 */
export function SharingSettings(props: { readonly place: Place }): JSX.Element {
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
  const own = (books: readonly Listed[]): readonly Listed[] => books.filter((each) => roleIn(each.book, app.services.member) === "owner")
  const letInto = (books: readonly Listed[]): readonly Listed[] => books.filter((each) => roleIn(each.book, app.services.member) !== "owner")
  const changedHere = (): void => {
    setChanged((count) => count + 1)
  }
  const joined = (): void => {
    changedHere()
    app.wrote()
  }
  return (
    <MainContent header={<ViewHeader place={props.place} title="共有" />}>
      <div class="max-w-5xl">
        <div class="flex flex-col gap-6 p-4">
          <div class="flex flex-col gap-2">
            <p class="text-sm text-text-muted">仲間からもらった招待コードを貼ると、その帳簿がこの端末に追加されます。</p>
            <SyncStanding />
          </div>
          <section class="flex flex-col gap-2">
            <h2 class="text-xs font-bold uppercase tracking-wide text-text-muted">招待コードを入れる</h2>
            <JoinByCode takes="invitation" onJoined={joined} />
          </section>
          <Loaded outcome={listed()}>
            {(books) => (
              <Show when={letInto(books).length > 0}>
                <section class="flex flex-col gap-2">
                  <h2 class="text-xs font-bold uppercase tracking-wide text-text-muted">招待された帳簿</h2>
                  <ul class="flex flex-col gap-1">
                    <For each={letInto(books)}>
                      {(each) => (
                        <li class="flex flex-wrap items-center gap-2 rounded-md bg-surface-1 px-3 py-3">
                          <span class="min-w-0 flex-1 truncate text-sm text-text-primary">{bookTitle(each.book)}</span>
                          <span class="text-xs text-text-muted">{roleIn(each.book, app.services.member) === "editor" ? "編集できます" : "閲覧のみ"}</span>
                        </li>
                      )}
                    </For>
                  </ul>
                </section>
              </Show>
            )}
          </Loaded>
          <Destinations changed={changed()} onChanged={changedHere} />
          <hr class="border-border" />
          <section class="flex flex-col gap-2">
            <h2 class="text-xs font-bold uppercase tracking-wide text-text-muted">自分の帳簿に招待</h2>
            <p class="text-sm text-text-muted">相手ごとに招待コードを作って渡してください。渡すのは招待コードだけで、帳簿そのものの鍵は相手に渡りません。</p>
            <Loaded outcome={listed()}>
              {(books) => (
                <ul class="flex flex-col gap-1">
                  <For each={own(books)}>{(each) => <OwnBookRow listed={each} onChanged={changedHere} />}</For>
                </ul>
              )}
            </Loaded>
          </section>
        </div>
      </div>
    </MainContent>
  )
}
