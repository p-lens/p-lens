import { createSignal, For, type JSX } from "solid-js"

import type { BookId, ListedBook } from "../../core/book/book"
import type { Outcome } from "../../application/errors"
import { useApp } from "../../ui/context"
import { useMoves } from "../../ui/navigation/moves"
import { pathOf, type Place } from "../../ui/navigation/place"
import { Button } from "../../ui/primitives/button"
import { createNudge, redText } from "../../ui/primitives/nudge"
import { Loaded } from "../../ui/primitives/states"
import { TabsContent } from "../../ui/primitives/tabs"
import { bookTitle } from "../../ui/wording/book"
import { WritingLine, type Writing, type WritingKey } from "../ui/writing"
import { GENERAL } from "./csv-import"
import { makeSingleJournal, makeTallyTable, makeTogether } from "./use-cases"

/** Where a book whole is kept and put back: the backup's section of the settings. */
const BACKUP: Place = { kind: "settings-section", section: "backup" }

/**
 * One book in a line of the general tab: a tick for taking it into the
 * zip, its title, and at the line's end the two files it is written out
 * as, each a small button its word wide. However many books there are, the ticks stand in a column
 * down the left and the buttons in one down the right. Where the line is
 * too narrow to leave the title room, as on a phone, the buttons go under
 * it to the right, together.
 */
function GeneralBookRow(props: { readonly book: ListedBook; readonly writing: Writing; readonly ticked: boolean; readonly onTick: (ticked: boolean) => void }): JSX.Element {
  const app = useApp()
  const writing = props.writing
  return (
    <li class="flex flex-col gap-2 rounded-md bg-surface-1 py-2 pl-3 pr-2">
      <div class="flex flex-wrap items-center justify-end gap-2">
        <label class="flex min-w-0 flex-1 basis-40 cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            aria-label={`${bookTitle(props.book)} を zip に入れる`}
            checked={props.ticked}
            onChange={(event) => props.onTick(event.currentTarget.checked)}
            class="size-5 shrink-0 accent-accent"
          />
          <span class="min-w-0 flex-1 break-words text-sm font-medium text-text-primary">{bookTitle(props.book)}</span>
        </label>
        <div class="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="small" class="shrink-0" onClick={() => void writing.write((watch) => makeSingleJournal(app.services.export, props.book.id, watch))}>
            journal
          </Button>
          <Button variant="outline" size="small" class="shrink-0" onClick={() => void writing.write((watch) => makeTallyTable(app.services.export, props.book.id, watch))}>
            CSV
          </Button>
        </div>
      </div>
      <WritingLine writing={writing} />
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
function GeneralBooks(props: { readonly books: readonly ListedBook[]; readonly writingOf: (key: WritingKey) => Writing }): JSX.Element {
  const app = useApp()
  const together = props.writingOf("together")
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
    const chosen = ticked()
    void together.write((watch) => makeTogether(app.services.export, chosen, watch))
  }
  return (
    <section class="flex flex-col gap-2">
      <div class="flex items-center gap-2 py-1 pl-3 pr-2">
        <label class="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
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
        </label>
        <Button variant="outline" size="small" class="shrink-0" onClick={zip}>
          まとめて zip
        </Button>
      </div>
      <div class="pr-2">
        <WritingLine writing={together} />
      </div>
      <ul class="flex flex-col gap-1">
        <For each={props.books}>{(book) => <GeneralBookRow book={book} writing={props.writingOf(`${GENERAL}:${book.id}`)} ticked={!leftOut().includes(book.id)} onTick={(on) => tick(book.id, on)} />}</For>
      </ul>
    </section>
  )
}

/**
 * 汎用形式's export tab: a book's journals as one, for hledger or any
 * editor, and its tallies as a table, for a spreadsheet — a book at a
 * time, or the ticked books' together in one zip. The book whole, readings
 * and all, is a backup's to carry, and the line under the tab is the way
 * there.
 */
export function GeneralExportTab(props: { readonly books: Outcome<readonly ListedBook[]> | undefined; readonly writingOf: (key: WritingKey) => Writing }): JSX.Element {
  const moves = useMoves()
  return (
    <TabsContent value={GENERAL} class="flex flex-col gap-6 p-4">
      <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-text-muted">
        <dt class="font-medium text-text-secondary">journal</dt>
        <dd>仕訳を1本にまとめた hledger のテキストファイル。</dd>
        <dt class="font-medium text-text-secondary">CSV</dt>
        <dd>収支の一覧を1件1行の表に。表計算ソフトで開けます。</dd>
        <dt class="font-medium text-text-secondary">zip</dt>
        <dd>選んだ帳簿の journal と CSV を、稼働の CSV とあわせてひとつにまとめます。</dd>
      </dl>
      <Loaded outcome={props.books}>{(found) => <GeneralBooks books={found} writingOf={props.writingOf} />}</Loaded>
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
    </TabsContent>
  )
}
