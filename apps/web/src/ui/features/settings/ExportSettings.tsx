import { createMemo, createResource, createSignal, For, onCleanup, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import type { ApplicationError, Outcome } from "../../../application/errors"
import { handOver, makeForPrecord, makeSingleJournal, makeTallyTable, makeTogether, type ExportPorts, type ExportReport, type ExportWatch, type Made } from "../../../application/export"
import type { HandedFile } from "../../../backup/port/handover"
import type { BookId, ListedBook } from "../../../core/book/book"
import { Ok } from "../../../core/result/result"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { createNudge, redText } from "../../primitives/nudge"
import { Loaded } from "../../primitives/states"
import { createWait } from "../../primitives/wait"
import { useMoves } from "../../navigation/moves"
import { pathOf, type Place } from "../../navigation/place"
import { bookTitle } from "../../wording/book"
import { describeError } from "../../wording/errors"
import { EXPORT_BEGUN, EXPORT_BROKEN, EXPORT_HANDING, EXPORT_READY, EXPORT_SAVE, EXPORT_STOP, exportReportText } from "../../wording/export"
import { ViewHeader } from "../shell/ViewHeader"

/** Where a book whole is kept and put back: the backup's section of the settings. */
const BACKUP: Place = { kind: "settings-section", section: "backup" }

/**
 * Where a writing out is: not asked for; being made, with how far it has
 * got where it has said, and the stopping of it; made too long after its
 * press to hand over without another, waiting for 保存; being handed over;
 * failed with why; or broken off with nothing said of why.
 */
type Working =
  | { readonly type: "idle" }
  | { readonly type: "making"; readonly report: ExportReport | undefined; readonly stop: () => void }
  | { readonly type: "ready"; readonly file: HandedFile }
  | { readonly type: "handing" }
  | { readonly type: "failed"; readonly error: ApplicationError }
  | { readonly type: "broken" }

const IDLE: Working = { type: "idle" }

/** A file the person was asked where to put, and closed the question on: their answer, and nothing to report. */
const declined = (error: ApplicationError): boolean => error.type === "handover" && error.failure.type === "handover-cancelled"

/** A writing out and where it is: one at a time, stopped by the person or by the screen being left, a file made late handed over on a press of its own, and never left busy whatever befalls it. */
interface Writing {
  readonly working: () => Working
  readonly write: (made: (watch: ExportWatch) => Promise<Outcome<Made>>) => Promise<void>
  readonly save: () => Promise<void>
  readonly stop: () => void
}

const createWriting = (ports: ExportPorts): Writing => {
  const [working, setWorking] = createSignal<Working>(IDLE)
  const settled = (written: Outcome<void>): void => {
    setWorking(written.ok || declined(written.error) ? IDLE : { type: "failed", error: written.error })
  }
  const give = async (file: HandedFile): Promise<void> => {
    setWorking({ type: "handing" })
    try {
      settled(await handOver(ports, file))
    } catch {
      setWorking({ type: "broken" })
    }
  }
  const stop = (): void => {
    const current = working()
    if (current.type === "making") current.stop()
  }
  return {
    working,
    stop,
    save: async () => {
      const current = working()
      if (current.type === "ready") await give(current.file)
    },
    write: async (made) => {
      if (working().type === "making" || working().type === "handing") return
      const stopping = new AbortController()
      const halt = (): void => {
        stopping.abort()
        setWorking(IDLE)
      }
      setWorking({ type: "making", report: undefined, stop: halt })
      try {
        const outcome = await made({ stopped: stopping.signal, onReport: (report) => (stopping.signal.aborted ? undefined : setWorking({ type: "making", report, stop: halt })) })
        if (stopping.signal.aborted) return
        if (!outcome.ok) return settled(outcome)
        if (outcome.value.type === "stopped") return settled(Ok(undefined))
        if (ports.handover.givesNow()) return give(outcome.value.file)
        setWorking({ type: "ready", file: outcome.value.file })
      } catch {
        if (!stopping.signal.aborted) setWorking({ type: "broken" })
      }
    },
  }
}

/**
 * Each book's writing out, and the books' together, kept by the screen and
 * not by their rows: the list of books is read again whenever a book
 * changes, and a row made anew must still find its writing where it was.
 * Leaving the screen stops whatever is being made.
 */
const createWritings = (ports: ExportPorts): ((key: BookId | "together") => Writing) => {
  const held = new Map<BookId | "together", Writing>()
  onCleanup(() => held.forEach((writing) => writing.stop()))
  return (key) => {
    const found = held.get(key)
    if (found !== undefined) return found
    const made = createWriting(ports)
    held.set(key, made)
    return made
  }
}

/** What is said of a file while it is being made, waits for 保存 or is being handed over; nothing otherwise. */
const progressText = (working: Working): string | undefined => {
  switch (working.type) {
    case "making":
      return working.report === undefined ? EXPORT_BEGUN : exportReportText(working.report)
    case "ready":
      return EXPORT_READY
    case "handing":
      return EXPORT_HANDING
    case "idle":
    case "failed":
    case "broken":
      return undefined
  }
}

/** A file being made or handed over: what nobody is asked to do anything about. */
const isBusy = (working: Working): boolean => working.type === "making" || working.type === "handing"

/**
 * Under a line, where its file stands while it is anything but idle: how
 * far it has got and 中止, or 保存 for a file made late; why it failed, or
 * that it broke off. The buttons stay put as the words beside them change,
 * so a press is never lost to a report. A file made within the wait's
 * quiet never shows it was made at all, and one that shows it is being
 * made says so long enough to be read, with the last it said; 保存 waits
 * on a press, so it shows at once.
 */
function WritingLine(props: { readonly writing: Writing }): JSX.Element {
  const working = (): Working => props.writing.working()
  const wait = createWait(() => isBusy(working()))
  const lastBusy = createMemo<Working>((before) => (isBusy(working()) ? working() : before), IDLE)
  const shown = (): Working => (working().type === "ready" ? working() : wait().type === "shown" ? lastBusy() : IDLE)
  return (
    <>
      <Show when={progressText(shown()) !== undefined}>
        <div class="flex items-center justify-end gap-2">
          <span class="min-w-0 text-xs text-text-muted" role="status">
            {progressText(shown())}
          </span>
          <Show when={shown().type === "making"}>
            <Button variant="outline" size="small" class="shrink-0" onClick={() => props.writing.stop()}>
              {EXPORT_STOP}
            </Button>
          </Show>
          <Show when={shown().type === "ready"}>
            <Button size="small" class="shrink-0" onClick={() => void props.writing.save()}>
              {EXPORT_SAVE}
            </Button>
          </Show>
        </div>
      </Show>
      <Show when={((current) => (current.type === "failed" ? describeError(current.error) : current.type === "broken" ? EXPORT_BROKEN : undefined))(working())} keyed>
        {(said) => (
          <p role="alert" class="rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-text-primary">
            {said}
          </p>
        )}
      </Show>
    </>
  )
}

/**
 * One book in a line: a tick for taking it into the zip, its title, and at
 * the line's end the three files it is written out as, each a small button
 * its word wide. However many books there are, the ticks stand in a column
 * down the left and the buttons in one down the right. Where the line is
 * too narrow to leave the title room, as on a phone, the buttons go under
 * it to the right, together.
 */
function BookRow(props: { readonly book: ListedBook; readonly writing: Writing; readonly ticked: boolean; readonly onTick: (ticked: boolean) => void }): JSX.Element {
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
          <Button variant="outline" size="small" class="shrink-0" onClick={() => void writing.write((watch) => makeForPrecord(app.services.export, props.book.id, watch))}>
            pRecord
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
function Books(props: { readonly books: readonly ListedBook[]; readonly writingOf: (key: BookId | "together") => Writing }): JSX.Element {
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
        <For each={props.books}>{(book) => <BookRow book={book} writing={props.writingOf(book.id)} ticked={!leftOut().includes(book.id)} onTick={(on) => tick(book.id, on)} />}</For>
      </ul>
    </section>
  )
}

/**
 * Writing a book out as a file other than a backup, each on a press and at
 * no other time: its journals as one, for hledger or any editor, its
 * tallies as a table, for a spreadsheet, and its tallies as pRecord takes
 * them in — a book at a time, or the ticked books' journal and table
 * together in one zip. The book whole, readings and all, is a
 * backup's to carry, and the line under the list is the way there.
 */
export function ExportSettings(props: { readonly place: Place }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const [books] = createResource(() => app.revision(), () => app.services.session.books())
  const writingOf = createWritings(app.services.export)
  return (
    <MainContent header={<ViewHeader place={props.place} title="エクスポート" />}>
      <div class="max-w-5xl">
        <div class="flex flex-col gap-6 p-4">
          <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-text-muted">
            <dt class="font-medium text-text-secondary">journal</dt>
            <dd>仕訳を1本にまとめた hledger のテキストファイル。</dd>
            <dt class="font-medium text-text-secondary">CSV</dt>
            <dd>収支の一覧を1件1行の表に。表計算ソフトで開けます。</dd>
            <dt class="font-medium text-text-secondary">pRecord</dt>
            <dd>収支を pRecord が読める CSV に。pRecord の「その他 → データインポート」で取り込めます。</dd>
            <dt class="font-medium text-text-secondary">zip</dt>
            <dd>選んだ帳簿の journal と CSV をひとつにまとめます。</dd>
          </dl>
          <Loaded outcome={books()}>{(found) => <Books books={found} writingOf={writingOf} />}</Loaded>
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
