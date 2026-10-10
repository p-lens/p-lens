import { createResource, createSignal, For, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import type { ApplicationError, Outcome } from "../../../application/errors"
import { exportPlayTable, exportSingleJournal, exportTogether } from "../../../application/export"
import type { BookId, TitledBook } from "../../../core/book/book"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { createNudge, redText } from "../../primitives/nudge"
import { Loaded } from "../../primitives/states"
import { useMoves } from "../../navigation/moves"
import { pathOf, type Place } from "../../navigation/place"
import { bookTitle } from "../../wording/book"
import { describeError } from "../../wording/errors"
import { ViewHeader } from "../shell/ViewHeader"

/** Where a book whole is kept and put back: the backup's section of the settings. */
const BACKUP: Place = { kind: "settings-section", section: "backup" }

/** Where a writing out is: not asked for, being made, or failed with why. */
type Working = { readonly type: "idle" } | { readonly type: "working" } | { readonly type: "failed"; readonly error: ApplicationError }

/** A file the person was asked where to put, and closed the question on: their answer, and nothing to report. */
const declined = (error: ApplicationError): boolean => error.type === "handover" && error.failure.type === "handover-cancelled"

/** A writing out and where it is, for a row or for the books together: one at a time, a declined one no failure. */
const createWriting = (): { readonly working: () => Working; readonly write: (made: () => Promise<Outcome<void>>) => Promise<void> } => {
  const [working, setWorking] = createSignal<Working>({ type: "idle" })
  return {
    working,
    write: async (made) => {
      if (working().type === "working") return
      setWorking({ type: "working" })
      const written = await made()
      setWorking(written.ok || declined(written.error) ? { type: "idle" } : { type: "failed", error: written.error })
    },
  }
}

function WritingNote(props: { readonly working: Working }): JSX.Element {
  return (
    <Show when={props.working.type === "working"}>
      <span class="shrink-0 text-xs text-text-muted" role="status">
        書き出し中…
      </span>
    </Show>
  )
}

function Failure(props: { readonly working: Working }): JSX.Element {
  return (
    <Show when={props.working.type === "failed" && props.working} keyed>
      {(failed) => (
        <p role="alert" class="rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-text-primary">
          {describeError(failed.error)}
        </p>
      )}
    </Show>
  )
}

/**
 * One book in a line: a tick for taking it into the zip, its title, and at
 * the line's end the two files it is written out as, each a small button
 * its word wide. However many books there are, the ticks stand in a column
 * down the left and the buttons in one down the right.
 */
function BookRow(props: { readonly book: TitledBook; readonly ticked: boolean; readonly onTick: (ticked: boolean) => void }): JSX.Element {
  const app = useApp()
  const writing = createWriting()
  return (
    <li class="flex flex-col gap-2 rounded-md bg-surface-1 py-2 pl-3 pr-2">
      <div class="flex items-center gap-2">
        <input
          type="checkbox"
          aria-label={`${bookTitle(props.book)} を zip に入れる`}
          checked={props.ticked}
          onChange={(event) => props.onTick(event.currentTarget.checked)}
          class="size-5 shrink-0 accent-accent"
        />
        <span class="min-w-0 flex-1 break-words text-sm font-medium text-text-primary">{bookTitle(props.book)}</span>
        <WritingNote working={writing.working()} />
        <Button variant="outline" size="small" class="shrink-0" onClick={() => void writing.write(() => exportSingleJournal(app.services.export, props.book.id))}>
          journal
        </Button>
        <Button variant="outline" size="small" class="shrink-0" onClick={() => void writing.write(() => exportPlayTable(app.services.export, props.book.id))}>
          CSV
        </Button>
      </div>
      <Failure working={writing.working()} />
    </li>
  )
}

/**
 * The books, each written out by itself or the ticked ones together as one
 * zip. Every book is ticked as the list opens — the usual wish is all of
 * them — and a book is left out by unticking it; the line above the list
 * ticks or unticks them all. A press for the zip with none ticked makes
 * nothing, and turns the count red for a while.
 */
function Books(props: { readonly books: readonly TitledBook[] }): JSX.Element {
  const app = useApp()
  const together = createWriting()
  /** The books unticked: kept as those left out, so a book that appears later is ticked like the rest. */
  const [leftOut, setLeftOut] = createSignal<readonly BookId[]>([])
  const ticked = (): readonly BookId[] => props.books.map((book) => book.id).filter((id) => !leftOut().includes(id))
  const tick = (id: BookId, on: boolean): void => {
    setLeftOut((current) => (on ? current.filter((each) => each !== id) : [...current, id]))
  }
  const every = (): boolean => ticked().length === props.books.length
  const nudge = createNudge()
  const zip = (): void => {
    if (ticked().length === 0) {
      nudge.nudge()
      return
    }
    void together.write(() => exportTogether(app.services.export, ticked()))
  }
  return (
    <section class="flex flex-col gap-2">
      <div class="flex items-center gap-2 py-1 pl-3 pr-2">
        <input
          type="checkbox"
          aria-label="すべての帳簿を選ぶ"
          checked={every()}
          onChange={(event) => setLeftOut(event.currentTarget.checked ? [] : props.books.map((book) => book.id))}
          class="size-5 shrink-0 accent-accent"
        />
        <span class="min-w-0 flex-1 text-xs font-bold tracking-wide" classList={{ ...redText(nudge.red()), "text-text-muted": !nudge.red() }}>
          帳簿（{ticked().length}/{props.books.length}）
        </span>
        <WritingNote working={together.working()} />
        <Button variant="outline" size="small" class="shrink-0" onClick={zip}>
          まとめて zip
        </Button>
      </div>
      <Failure working={together.working()} />
      <ul class="flex flex-col gap-1">
        <For each={props.books}>{(book) => <BookRow book={book} ticked={!leftOut().includes(book.id)} onTick={(on) => tick(book.id, on)} />}</For>
      </ul>
    </section>
  )
}

/**
 * Writing a book out as a file other than a backup, each on a press and at
 * no other time: its journals as one, for hledger or any editor, and its
 * plays as a table, for a spreadsheet — a book at a time, or the ticked
 * books' files together in one zip. The book whole, readings and all, is a
 * backup's to carry, and the line under the list is the way there.
 */
export function ExportSettings(props: { readonly place: Place }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const [books] = createResource(() => app.revision(), () => app.services.session.books())
  return (
    <MainContent header={<ViewHeader place={props.place} title="エクスポート" />}>
      <div class="max-w-5xl">
        <div class="flex flex-col gap-6 p-4">
          <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-text-muted">
            <dt class="font-medium text-text-secondary">journal</dt>
            <dd>仕訳を1本にまとめた hledger のテキストファイル。</dd>
            <dt class="font-medium text-text-secondary">CSV</dt>
            <dd>収支の一覧を1稼働1行の表に。表計算ソフトで開けます。</dd>
            <dt class="font-medium text-text-secondary">zip</dt>
            <dd>選んだ帳簿の journal と CSV をひとつにまとめます。</dd>
          </dl>
          <Loaded outcome={books()}>{(found) => <Books books={found} />}</Loaded>
          <p class="text-xs text-text-muted">
            帳簿をまるごと保存・復元するなら
            <a
              href={pathOf(BACKUP)}
              class="mx-1 text-accent underline underline-offset-2"
              onClick={(event) => {
                event.preventDefault()
                moves.go(BACKUP)
              }}
            >
              バックアップ
            </a>
            へ。
          </p>
        </div>
      </div>
    </MainContent>
  )
}
