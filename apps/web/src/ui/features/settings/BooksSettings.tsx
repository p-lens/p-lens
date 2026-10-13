import { createEffect, createMemo, createResource, createSignal, For, Match, on, Show, Switch, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { bookStandings, type BookStanding } from "../../../application/backup"
import { addBook } from "../../../application/add-book"
import { deleteBook, holdsNothing } from "../../../application/delete-book"
import type { ApplicationError } from "../../../application/errors"
import { swapWithNext } from "../../../application/book-order"
import { ensureFirstBook } from "../../../application/seed"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { DiceIcon, SwapIcon } from "../../primitives/icons"
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
import { motionOf, rowsOf, type Motion, type Row, type Swap } from "./book-rows"

const SWAP_LABEL = "次の自分の帳簿と入れ替える"

const REDRAW_LABEL = "名前の候補を引き直す"

/** Where deleting a book is: not asked, asked and waiting to be sure, going — after being asked about, or straight away — or failed. */
type Deleting =
  | { readonly type: "resting" }
  | { readonly type: "asking" }
  | { readonly type: "deleting"; readonly asked: boolean }
  | { readonly type: "failed"; readonly error: ApplicationError }

/**
 * One book, under its title, renamed where it stands by its owner, with
 * how it stands against its backups — what deleting it
 * would lose — and the way to delete it: a press asks, and a second,
 * beside what will go, does it; a book that holds nothing goes at the first. Changing places with another, it swells
 * where it stands and settles where it comes to, and says when it has.
 * Laid out for a phone first.
 */
function BookRow(props: { readonly listed: BookStanding; readonly motion: Motion; readonly onSettled: () => void; readonly onDeleted: () => Promise<void> }): JSX.Element {
  const app = useApp()
  const [state, setState] = createSignal<Deleting>({ type: "resting" })
  const unsaved = (): boolean => props.listed.standing.type !== "kept"
  /** Whether what will be lost is shown: while a person is asked, and while a book they were asked about goes. A book that holds nothing goes with nothing shown. */
  const warned = (): boolean => ((current) => current.type === "asking" || (current.type === "deleting" && current.asked))(state())
  const remove = async (asked: boolean): Promise<void> => {
    if (state().type === "deleting") return
    setState({ type: "deleting", asked })
    const deleted = await deleteBook(app.services.deletion, props.listed.book.id)
    if (!deleted.ok) {
      setState({ type: "failed", error: deleted.error })
      return
    }
    toast({ title: "帳簿を削除しました", description: bookTitle(props.listed.book) })
    await props.onDeleted()
  }
  /** A book that holds nothing goes at the first press; any other is asked about, and so is one that could not be read. */
  const ask = async (): Promise<void> => {
    if (state().type === "deleting") return
    const empty = await holdsNothing(app.services.deletion, props.listed.book.id, app.services.firstBook())
    if (empty.ok && empty.value) return remove(false)
    setState({ type: "asking" })
  }
  return (
    <div
      class="flex flex-col gap-3 rounded-md bg-surface-1 p-3"
      classList={{
        "relative z-10 animate-[swell_140ms_ease-out_forwards]": props.motion === "swelling",
        "relative z-10 animate-[settle_240ms_ease-out]": props.motion === "settling",
      }}
      onAnimationEnd={() => {
        if (props.motion === "settling") props.onSettled()
      }}
    >
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
        <div class="flex items-center justify-end sm:shrink-0">
          <Show when={!warned()}>
            <Button variant="secondary" class="text-negative" onClick={() => void ask()}>
              {state().type === "deleting" ? "削除しています…" : "削除"}
            </Button>
          </Show>
        </div>
      </div>
      <Switch>
        <Match when={warned()}>
          <div role="alert" class="flex flex-col gap-3 rounded-md border border-negative/40 bg-negative/10 p-3">
            <p class="text-sm text-text-primary">
              「{bookTitle(props.listed.book)}」をこの端末から削除します。元に戻せません。
              <Show when={unsaved()}>
                <span class="font-semibold">バックアップしていない記録は失われます。</span>
              </Show>
            </p>
            <div class="flex flex-col gap-2 sm:flex-row">
              <Button variant="secondary" class="text-negative" onClick={() => void remove(true)}>
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
    </div>
  )
}

/** Where changing two books' places is: not asked, being written, or written and shown until the two have settled. */
type Swapping = { readonly type: "resting" } | { readonly type: "writing"; readonly swap: Swap } | { readonly type: "written"; readonly swap: Swap }

const swapOf = (swapping: Swapping): Swap | undefined => (swapping.type === "resting" ? undefined : swapping.swap)

/**
 * The books as a list, and at its right edge, on the line between each of
 * the person's own and the row under it, where another of theirs comes
 * after, the arrows that swap the two: both swell while the swap is
 * written, and settle in each other's place once the list is read again.
 * The edge is kept clear for the arrows whether there are any or not, so
 * a row is as wide with one book as with several, and reaches into the
 * screen's own margin, so the rows give up little. A
 * second swap waits for the first to be written.
 */
function BookList(props: { readonly rows: readonly Row[]; readonly onDeleted: () => Promise<void> }): JSX.Element {
  const app = useApp()
  const rows = createMemo(() => props.rows)
  const [swapping, setSwapping] = createSignal<Swapping>({ type: "resting" })
  const swap = async (asked: Swap): Promise<void> => {
    if (swapping().type === "writing") return
    setSwapping({ type: "writing", swap: asked })
    const done = await swapWithNext(app.services.session, app.services.member, asked.upper)
    if (!done.ok) toast({ title: "帳簿を並べ替えられませんでした", description: describeError(done.error), tone: "error" })
    setSwapping(done.ok ? { type: "written", swap: asked } : { type: "resting" })
    app.wrote()
  }
  return (
    <ul class="-mr-2 flex flex-col gap-1">
      <For each={rows()}>
        {(row) => (
          <li class="relative pr-7">
            <BookRow listed={row.standing} motion={motionOf(rows(), swapOf(swapping()), row.standing.book.id)} onSettled={() => setSwapping({ type: "resting" })} onDeleted={props.onDeleted} />
            <Show when={row.swapsWith} keyed>
              {(lower) => (
                <Button
                  variant="outline"
                  size="icon"
                  class="absolute right-0 top-full z-20 mt-0.5 size-6 -translate-y-1/2"
                  aria-label={SWAP_LABEL}
                  title={SWAP_LABEL}
                  onClick={() => void swap({ upper: row.standing.book.id, lower })}
                >
                  <SwapIcon />
                </Button>
              )}
            </Show>
          </li>
        )}
      </For>
    </ul>
  )
}

/** Where adding a book is: being typed, being made, or stopped by what is wrong with its name. */
type Adding = { readonly type: "typing" } | { readonly type: "adding" } | { readonly type: "refused"; readonly reason: string }

/**
 * One more book for the device: its name typed, and a small button beside
 * it. A person in a group keeps two — their own play, and the group's — and
 * names each for what it holds. A name left empty is no refusal: the book
 * takes the one shown in the field, a picture none of the books there
 * begins with and マイ帳簿, so a dozen can be made by pressing a dozen
 * times and named whenever their owner cares to; and the die beside the
 * button draws another, for whoever would rather not be the one shown.
 */
function AddBook(props: { readonly titles: readonly string[] }): JSX.Element {
  const app = useApp()
  const [title, setTitle] = createSignal("")
  const [adding, setAdding] = createSignal<Adding>({ type: "typing" })
  const [unnamed, setUnnamed] = createSignal(app.services.unnamedTitle(props.titles))
  createEffect(on(() => props.titles, (titles) => setUnnamed(app.services.unnamedTitle(titles)), { defer: true }))
  const named = (): string => (title().trim() === "" ? unnamed() : title())
  const add = async (): Promise<void> => {
    settleTyping()
    if (adding().type === "adding") return
    setAdding({ type: "adding" })
    const name = named()
    const added = await addBook(app.services.session, app.services.firstBook(), name, app.services.preferences.businessDayTurn())
    if (!added.ok) {
      setAdding({ type: "refused", reason: describeError(added.error) })
      return
    }
    if (!added.value.ok) {
      setAdding({ type: "refused", reason: describeTitleProblem(added.value.error) })
      return
    }
    toast({ title: "帳簿を追加しました", description: name.trim() })
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
          <TextField label="新しい帳簿の名前" value={title()} onChange={setTitle} maxLength={LONGEST_TITLE} placeholder={unnamed()} />
        </div>
        <Button type="button" variant="outline" size="icon" class="shrink-0" aria-label={REDRAW_LABEL} title={REDRAW_LABEL} onClick={() => setUnnamed(app.services.unnamedTitle([...props.titles, unnamed()]))}>
          <DiceIcon />
        </Button>
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
 * there in the order books stand in everywhere, changing places with the
 * next where both are the person's own, with how it stands against its backups,
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
  /** What the device's books are called, for a new one to be told apart from. */
  const titles = createMemo((): readonly string[] => ((books) => (books?.ok === true ? books.value.flatMap((book) => (book.title === undefined ? [] : [book.title])) : []))(ordered()), [], { equals: (before, after) => before.join("\n") === after.join("\n") })
  /** The device's books in the order they stand in everywhere, each with how it stands against its backups, and the book it may change places with. */
  const rows = (standings: readonly BookStanding[]): readonly Row[] => ((books) => rowsOf(books?.ok === true ? books.value : [], standings, app.services.member))(ordered())
  const settle = async (): Promise<void> => {
    await ensureFirstBook(app.services.session, app.services.firstBook)
    app.wrote()
  }
  return (
    <MainContent header={<ViewHeader place={props.place} title="帳簿の管理" />}>
      <div class="max-w-5xl">
        <div class="flex flex-col gap-6 p-4">
          <AddBook titles={titles()} />
          <section class="flex flex-col gap-2">
            <h2 class="text-xs font-bold uppercase tracking-wide text-text-muted">帳簿</h2>
            <Loaded outcome={listed()}>
              {(books) => <BookList rows={rows(books)} onDeleted={settle} />}
            </Loaded>
            <p class="text-xs text-text-muted">右の矢印で、自分の帳簿を上下に入れ替えられます。並びは帳簿と一緒に、同期しているほかの端末にも届きます。</p>
            <p class="text-xs text-text-muted">削除はこの端末からだけで、元に戻せません。バックアップや、同期しているほかの端末の帳簿は消えません。最後の1冊を削除すると、空の帳簿が新しく作られます。</p>
          </section>
        </div>
      </div>
    </MainContent>
  )
}
