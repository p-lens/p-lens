import { createResource, createSignal, For, Match, Show, Switch, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { bookStandings, type BookStanding } from "../../../application/backup"
import { addBook } from "../../../application/add-book"
import { deleteBook } from "../../../application/delete-book"
import type { ApplicationError } from "../../../application/errors"
import { moveBook } from "../../../application/book-order"
import { ensureFirstBook } from "../../../application/seed"
import type { BookId } from "../../../core/book/book"
import type { Direction } from "../../../core/book/order"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { ChevronDownIcon } from "../../primitives/icons"
import { Loaded } from "../../primitives/states"
import { settleTyping, TextField } from "../../primitives/text-field"
import { toast } from "../../primitives/toast"
import type { Place } from "../../navigation/place"
import { lastBackupText, standingText } from "../../wording/backup"
import { LONGEST_TITLE } from "../../../core/journal/title"
import { bookTitle, describeTitleProblem } from "../../wording/book"
import { describeError } from "../../wording/errors"
import { BookTitle } from "../shell/BookTitle"
import { ViewHeader } from "../shell/ViewHeader"
import { rowsOf, type Row } from "./book-rows"

const DIRECTIONS: readonly Direction[] = ["earlier", "later"]

const MOVE_LABELS: Readonly<Record<Direction, string>> = { earlier: "ひとつ上へ", later: "ひとつ下へ" }

/** Where deleting a book is: not asked, asked and waiting to be sure, going, or failed. */
type Deleting =
  | { readonly type: "resting" }
  | { readonly type: "asking" }
  | { readonly type: "deleting" }
  | { readonly type: "failed"; readonly error: ApplicationError }

/**
 * One book, under its title, renamed where it stands by its owner, with
 * how it stands against its backups — what deleting it
 * would lose — the arrows that move it one place in the list, where it
 * is the person's own and has a place to move to, and the way to delete
 * it: a press asks, and a second, beside what will go, does it. Laid out
 * for a phone first.
 */
function BookRow(props: { readonly listed: BookStanding; readonly moves: readonly Direction[]; readonly onMove: (direction: Direction) => void; readonly onDeleted: () => Promise<void> }): JSX.Element {
  const app = useApp()
  const [state, setState] = createSignal<Deleting>({ type: "resting" })
  const unsaved = (): boolean => props.listed.standing.type !== "kept"
  const remove = async (): Promise<void> => {
    if (state().type === "deleting") return
    setState({ type: "deleting" })
    const deleted = await deleteBook(app.services.deletion, props.listed.book.id)
    if (!deleted.ok) {
      setState({ type: "failed", error: deleted.error })
      return
    }
    toast({ title: "帳簿を削除しました", description: bookTitle(props.listed.book) })
    await props.onDeleted()
  }
  return (
    <li class="flex flex-col gap-3 rounded-md bg-surface-1 p-3">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div class="flex min-w-0 flex-col gap-0.5 sm:flex-1">
          <div class="flex min-w-0">
            <BookTitle book={props.listed.book} nameClass="min-w-0 break-words text-sm font-medium" />
          </div>
          <span class="text-xs" classList={{ "text-warning": unsaved(), "text-text-secondary": !unsaved() }}>
            {standingText(props.listed.standing)}
          </span>
          <Show when={lastBackupText(props.listed.standing)} keyed>
            {(last) => <span class="text-xs text-text-muted">{last}</span>}
          </Show>
        </div>
        <div class="flex items-center gap-1 sm:shrink-0">
          <For each={DIRECTIONS}>
            {(direction) => (
              <Show when={props.moves.includes(direction)} fallback={<span class="size-9" />}>
                <Button variant="ghost" size="icon" aria-label={MOVE_LABELS[direction]} title={MOVE_LABELS[direction]} onClick={() => props.onMove(direction)}>
                  <span classList={{ "rotate-180": direction === "earlier" }}>
                    <ChevronDownIcon />
                  </span>
                </Button>
              </Show>
            )}
          </For>
          <div class="flex-1" />
          <Show when={state().type === "resting" || state().type === "failed"}>
            <Button variant="secondary" class="text-negative" onClick={() => setState({ type: "asking" })}>
              削除
            </Button>
          </Show>
        </div>
      </div>
      <Switch>
        <Match when={state().type === "asking" || state().type === "deleting"}>
          <div role="alert" class="flex flex-col gap-3 rounded-md border border-negative/40 bg-negative/10 p-3">
            <p class="text-sm text-text-primary">
              「{bookTitle(props.listed.book)}」をこの端末から削除します。元に戻せません。
              <Show when={unsaved()}>
                <span class="font-semibold">バックアップしていない記録は失われます。</span>
              </Show>
            </p>
            <div class="flex flex-col gap-2 sm:flex-row">
              <Button variant="secondary" class="text-negative" onClick={() => void remove()}>
                {state().type === "deleting" ? "削除しています…" : "削除する"}
              </Button>
              <Button variant="secondary" onClick={() => setState({ type: "resting" })}>
                やめる
              </Button>
            </div>
          </div>
        </Match>
        <Match when={((current) => (current.type === "failed" ? current.error : undefined))(state())} keyed>
          {(error) => (
            <p role="alert" class="rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-text-primary">
              {describeError(error)}
            </p>
          )}
        </Match>
      </Switch>
    </li>
  )
}

/** Where adding a book is: being typed, being made, or stopped by what is wrong with its name. */
type Adding = { readonly type: "typing" } | { readonly type: "adding" } | { readonly type: "refused"; readonly reason: string }

/**
 * One more book for the device: its name typed, and a small button beside
 * it. A person in a group keeps two — their own play, and the group's — and
 * names each for what it holds.
 */
function AddBook(): JSX.Element {
  const app = useApp()
  const [title, setTitle] = createSignal("")
  const [adding, setAdding] = createSignal<Adding>({ type: "typing" })
  const add = async (): Promise<void> => {
    settleTyping()
    if (adding().type === "adding") return
    setAdding({ type: "adding" })
    const added = await addBook(app.services.session, app.services.firstBook(), title(), app.services.preferences.businessDayTurn())
    if (!added.ok) {
      setAdding({ type: "refused", reason: describeError(added.error) })
      return
    }
    if (!added.value.ok) {
      setAdding({ type: "refused", reason: describeTitleProblem(added.value.error) })
      return
    }
    toast({ title: "帳簿を追加しました", description: title().trim() })
    setTitle("")
    setAdding({ type: "typing" })
    app.wrote()
  }
  return (
    <form
      autocomplete="off"
      class="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        void add()
      }}
    >
      <div class="flex items-end gap-2">
        <div class="min-w-0 flex-1 sm:max-w-xs">
          <TextField label="新しい帳簿の名前" value={title()} onChange={setTitle} maxLength={LONGEST_TITLE} />
        </div>
        <Button type="submit" class="shrink-0">
          {adding().type === "adding" ? "追加中…" : "追加"}
        </Button>
      </div>
      <Show when={((current) => (current.type === "refused" ? current.reason : undefined))(adding())} keyed>
        {(reason) => (
          <p role="alert" class="text-sm text-negative">
            {reason}
          </p>
        )}
      </Show>
    </form>
  )
}

/**
 * The books this device keeps: one more added under a name, and each one
 * there in the order books stand in everywhere, moved a place at a time
 * where it is the person's own, with how it stands against its backups,
 * taken off the device only
 * after a second press beside what will be lost. It is the device's copy
 * that goes — a backup of it, and the book on a device that syncs it, stay.
 * A device is never left with no book: deleting the last one puts an empty
 * one in its place.
 */
export function BooksSettings(props: { readonly place: Place }): JSX.Element {
  const app = useApp()
  const [listed] = createResource(
    () => ({ revision: app.revision(), made: app.backups.count() }),
    () => bookStandings(app.services.backup),
  )
  const [ordered] = createResource(() => app.revision(), () => app.services.session.books())
  /** The device's books in the order they stand in everywhere, each with how it stands against its backups, and the ways it may move. */
  const rows = (standings: readonly BookStanding[]): readonly Row[] => ((books) => rowsOf(books?.ok === true ? books.value : [], standings, app.services.member))(ordered())
  const move = async (bookId: BookId, direction: Direction): Promise<void> => {
    const done = await moveBook(app.services.session, app.services.member, bookId, direction)
    if (!done.ok) toast({ title: "帳簿を並べ替えられませんでした", description: describeError(done.error), tone: "error" })
    app.wrote()
  }
  const settle = async (): Promise<void> => {
    await ensureFirstBook(app.services.session, app.services.firstBook)
    app.wrote()
  }
  return (
    <MainContent header={<ViewHeader place={props.place} title="帳簿の管理" />}>
      <div class="max-w-5xl">
        <div class="flex flex-col gap-6 p-4">
          <AddBook />
          <section class="flex flex-col gap-2">
            <h2 class="text-xs font-bold uppercase tracking-wide text-text-muted">帳簿</h2>
            <Loaded outcome={listed()}>
              {(books) => (
                <ul class="flex flex-col gap-1">
                  <For each={rows(books)}>{(row) => <BookRow listed={row.standing} moves={row.moves} onMove={(direction) => void move(row.standing.book.id, direction)} onDeleted={settle} />}</For>
                </ul>
              )}
            </Loaded>
            <p class="text-xs text-text-muted">矢印で自分の帳簿を並べ替えられます。並びは帳簿と一緒に、同期しているほかの端末にも届きます。</p>
            <p class="text-xs text-text-muted">削除はこの端末からだけで、元に戻せません。バックアップや、同期しているほかの端末の帳簿は消えません。最後の1冊を削除すると、空の帳簿が新しく作られます。</p>
          </section>
        </div>
      </div>
    </MainContent>
  )
}
