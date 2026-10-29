import { createMemo, createResource, createSignal, For, onCleanup, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import type { ApplicationError } from "../../../application/errors"
import { importPrecord, previewPrecord, type Imported, type Preview } from "../../../application/import"
import { machineMatches } from "../../../core/catalog/description"
import type { BookId, ListedBook } from "../../../core/book/book"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { Combobox } from "../../primitives/combobox"
import { Loaded } from "../../primitives/states"
import { createWait } from "../../primitives/wait"
import type { Place } from "../../navigation/place"
import { bookTitle } from "../../wording/book"
import { describeError } from "../../wording/errors"
import { formatCount } from "../../wording/numbers"
import { IMPORT_BROKEN, IMPORT_READING, IMPORT_STOP, IMPORT_WRITING, importedText, timeLeftText, weighedText, writtenText } from "../../wording/import"
import { secondsLeftOf } from "../../../core/import/time-left"
import { ViewHeader } from "../shell/ViewHeader"

/**
 * Where a taking in is: not asked for; a file chosen being read; a file
 * that leaves something to ask — which machines its unknown names are,
 * whether its tallies that say their plays' hours are to be weighed — and
 * the person asked; its tallies being written; written and being weighed,
 * with how far it has got and since when, for the time it has left; done
 * with what it came to; failed with why; or broken off with nothing said
 * of why.
 */
type Taking =
  | { readonly type: "idle" }
  | { readonly type: "reading" }
  | { readonly type: "asking"; readonly preview: Preview }
  | { readonly type: "writing" }
  | { readonly type: "weighing"; readonly written: number; readonly alreadyHere: number; readonly done: number; readonly of: number; readonly beyond: boolean; readonly since: number }
  | { readonly type: "done"; readonly imported: Imported }
  | { readonly type: "failed"; readonly error: ApplicationError }
  | { readonly type: "broken" }

const IDLE: Taking = { type: "idle" }

/** Whether a taking in is under way, and a file chosen now would be turned away. */
const isBusy = (taking: Taking): boolean => taking.type === "reading" || taking.type === "writing" || taking.type === "weighing"

/** A weighing told how far it has got: since when it is counted from its first report, so the time it has left goes by the tallies weighed alone. */
const weighedOn = (current: Taking, report: { readonly done: number; readonly of: number; readonly beyond: boolean }): Taking =>
  current.type === "weighing" ? { ...current, ...report, since: report.done === 0 && !report.beyond ? performance.now() : current.since } : current

/** What is said of a taking in under way: the file being read, its tallies being written, or those written and how far their weighing has got, with about how long it has left. */
const takingText = (taking: Taking): string => {
  switch (taking.type) {
    case "reading":
      return IMPORT_READING
    case "weighing":
      return [writtenText(taking.written, taking.alreadyHere), weighedText(taking.done, taking.of, taking.beyond), ((left) => (left === undefined ? "" : timeLeftText(left)))(secondsLeftOf(taking.done, taking.of, performance.now() - taking.since))]
        .filter((part) => part !== "")
        .join(" ")
    case "idle":
    case "asking":
    case "writing":
    case "done":
    case "failed":
    case "broken":
      return IMPORT_WRITING
  }
}

/**
 * Under a book's line while its taking in is under way: how far it has
 * got, and 中止 while it is weighed. A taking in done within the wait's
 * quiet never shows it was under way, and one that shows it says so long
 * enough to be read, with the last it said.
 */
function TakingLine(props: { readonly taking: Taking; readonly onStop: () => void }): JSX.Element {
  const wait = createWait(() => isBusy(props.taking))
  const lastBusy = createMemo<Taking>((before) => (isBusy(props.taking) ? props.taking : before), props.taking)
  const beyond = (): boolean => ((taking) => taking.type === "weighing" && taking.beyond)(lastBusy())
  return (
    <Show when={wait().type === "shown" && isBusy(lastBusy())}>
      <div class="flex items-center justify-end gap-2">
        <span class="min-w-0 text-xs tabular-nums" classList={{ "text-text-muted": !beyond(), "text-warning": beyond() }} role="status">
          {takingText(lastBusy())}
        </span>
        <Show when={lastBusy().type === "weighing"}>
          <Button variant="outline" size="small" class="shrink-0" onClick={() => props.onStop()}>
            {IMPORT_STOP}
          </Button>
        </Show>
      </div>
    </Show>
  )
}

/** A file's bytes as UTF-8 text, or none where they do not read as UTF-8: a character made up in its place would be written into the book. */
const utf8Of = (bytes: ArrayBuffer): string | undefined => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return undefined
  }
}

/**
 * One book in a line: its title, and at the line's end a small button that
 * asks for a pRecord file to take into it. A file that names machines the
 * catalog does not know is taken in only after the person has been shown
 * them, each to say which machine it is or to leave as it is written; one
 * whose tallies say how long their plays lasted, only after they have said whether
 * those are to be weighed for what they were worth, which takes a while.
 * A file that leaves nothing to ask is taken in at once. What the taking
 * in came to, or why nothing was taken in, is said under the line.
 */
function BookRow(props: { readonly book: ListedBook; readonly taking: Taking; readonly onTaking: (taking: Taking) => void; readonly begin: () => AbortSignal; readonly onStop: () => void }): JSX.Element {
  const app = useApp()
  const picker: { input: HTMLInputElement | undefined } = { input: undefined }
  const taking = (): Taking => props.taking
  const setTaking = (next: Taking): void => props.onTaking(next)
  /** The machines the person has said the file's unknown names are, by the name as the file wrote it. */
  const [named, setNamed] = createSignal<ReadonlyMap<string, string>>(new Map())
  const take = async (preview: Preview, weighing: boolean): Promise<void> => {
    const stopped = props.begin()
    setTaking({ type: "writing" })
    try {
      const imported = await importPrecord(
        { session: app.services.session, catalog: app.services.catalog },
        props.book.id,
        preview,
        named(),
        weighing
          ? {
              engine: app.services.pachinko,
              stopped,
              weighedBefore: app.services.preferences,
              onReport: (report) => {
                if (report.type === "written") {
                  setTaking({ type: "weighing", written: report.written, alreadyHere: report.alreadyHere, done: 0, of: 0, beyond: false, since: performance.now() })
                  app.wrote()
                }
                if (report.type === "weighing") setTaking(weighedOn(taking(), report))
                if (report.type === "kept") app.wrote()
              },
            }
          : undefined,
      )
      setTaking(imported.ok ? { type: "done", imported: imported.value } : { type: "failed", error: imported.error })
      if (imported.ok) app.wrote()
    } catch {
      setTaking({ type: "broken" })
    }
  }
  const chosen = async (input: HTMLInputElement): Promise<void> => {
    const file = input.files?.[0]
    input.value = ""
    if (file === undefined || isBusy(taking())) return
    setTaking({ type: "reading" })
    try {
      const text = utf8Of(await file.arrayBuffer())
      if (text === undefined) return setTaking({ type: "failed", error: { type: "import", problem: { type: "not-utf8" } } })
      setNamed(new Map())
      const preview = await previewPrecord({ catalog: app.services.catalog }, text)
      if (!preview.ok) return setTaking({ type: "failed", error: preview.error })
      if (preview.value.told === 0 && preview.value.unnamed.length === 0) return take(preview.value, false)
      setTaking({ type: "asking", preview: preview.value })
    } catch {
      setTaking({ type: "broken" })
    }
  }
  return (
    <li class="flex flex-col gap-2 rounded-md bg-surface-1 py-2 pl-3 pr-2">
      <div class="flex items-center gap-2">
        <span class="min-w-0 flex-1 break-words text-sm font-medium text-text-primary">{bookTitle(props.book)}</span>
        <Button variant="outline" size="small" class="shrink-0" onClick={() => picker.input?.click()}>
          pRecord
        </Button>
        <input ref={(element) => (picker.input = element)} type="file" accept=".csv,text/csv" class="hidden" onChange={(event) => void chosen(event.currentTarget)} />
      </div>
      <TakingLine taking={taking()} onStop={props.onStop} />
      <Show when={((current) => (current.type === "asking" ? current : undefined))(taking())} keyed>
        {(asking) => (
          <div class="flex flex-col gap-3 rounded-md border border-border px-3 py-2">
            <Show when={asking.preview.unnamed.length > 0}>
              <div class="flex flex-col gap-2">
                <p class="text-sm text-text-primary">カタログにない機種名があります</p>
                <p class="text-xs text-text-muted">同じ機種がカタログにあれば選んでください。選ばなければ、pRecord の名前のまま取り込みます。</p>
                <For each={asking.preview.unnamed}>
                  {(unnamed) => (
                    <div class="flex flex-col gap-1">
                      <p class="break-words text-sm text-text-primary">
                        {unnamed.name}
                        <span class="text-xs text-text-muted">（{formatCount(unnamed.tallies)}件）</span>
                      </p>
                      <Combobox
                        label="カタログの機種"
                        placeholder="選ばない"
                        options={asking.preview.machines.map((machine) => ({ value: machine.id, label: machine.name, ...(machine.hitChance === undefined ? {} : { note: machine.hitChance }) }))}
                        value={named().get(unnamed.name)}
                        onChange={(machineId) => setNamed((before) => new Map([...before].filter(([name]) => name !== unnamed.name).concat(machineId === undefined ? [] : [[unnamed.name, machineId]])))}
                        matches={(machineId, typed) => asking.preview.machines.some((machine) => machine.id === machineId && machineMatches(machine, typed))}
                      />
                    </div>
                  )}
                </For>
              </div>
            </Show>
            <Show
              when={asking.preview.told > 0}
              fallback={
                <div class="flex justify-end">
                  <Button size="small" onClick={() => void take(asking.preview, false)}>
                    取り込む
                  </Button>
                </div>
              }
            >
              <div class="flex flex-col gap-2">
                <p class="text-sm text-text-primary">推定期待値を出しますか？</p>
                <p class="text-xs text-text-muted">稼働時間のある{formatCount(asking.preview.told)}件のうち、機種がカタログにあるパチンコの稼働を、稼働時間と収支から推定します。件数が多いと時間がかかります。</p>
                <div class="flex flex-wrap justify-end gap-2">
                  <Button variant="secondary" size="small" onClick={() => void take(asking.preview, false)}>
                    出さずに取り込む
                  </Button>
                  <Button size="small" onClick={() => void take(asking.preview, true)}>
                    推定して取り込む
                  </Button>
                </div>
              </div>
            </Show>
          </div>
        )}
      </Show>
      <Show when={((current) => (current.type === "done" ? current.imported : undefined))(taking())} keyed>
        {(imported) => (
          <p class="text-sm text-text-secondary" role="status">
            {importedText(imported)}
          </p>
        )}
      </Show>
      <Show when={((current) => (current.type === "failed" ? describeError(current.error) : current.type === "broken" ? IMPORT_BROKEN : undefined))(taking())} keyed>
        {(said) => (
          <p role="alert" class="rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-text-primary">
            {said}
          </p>
        )}
      </Show>
    </li>
  )
}

/**
 * Taking tallies in from another app, into a book the person chooses, on a
 * press and at no other time: pRecord's CSV, a row a tally, kept in yen with
 * what went in and what came back. A file taken in twice writes nothing
 * the second time.
 */
export function ImportSettings(props: { readonly place: Place }): JSX.Element {
  const app = useApp()
  const [books] = createResource(() => app.revision(), () => app.services.session.books())
  /** Where each book's taking in is, kept here and not in its row: a taking in changes the books, the list of them is read again, and what the taking in came to must still be said under its row then. */
  const [takings, setTakings] = createSignal<ReadonlyMap<BookId, Taking>>(new Map())
  /** Each book's taking in now under way, to be stopped by its 中止 or by the screen being left: a weighing goes on for minutes, and nobody is there to see it once the screen is gone. */
  const stoppers = new Map<BookId, AbortController>()
  onCleanup(() => stoppers.forEach((stopper) => stopper.abort()))
  const begin = (bookId: BookId): AbortSignal => {
    const stopper = new AbortController()
    stoppers.set(bookId, stopper)
    return stopper.signal
  }
  return (
    <MainContent header={<ViewHeader place={props.place} title="インポート" />}>
      <div class="max-w-5xl">
        <div class="flex flex-col gap-6 p-4">
          <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-text-muted">
            <dt class="font-medium text-text-secondary">pRecord</dt>
            <dd>pRecord で書き出した CSV から、過去の収支を取り込みます。</dd>
          </dl>
          <section class="flex flex-col gap-2">
            <h2 class="px-3 text-xs font-bold tracking-wide text-text-muted">取り込み先の帳簿</h2>
            <Loaded outcome={books()}>
              {(found) => (
                <ul class="flex flex-col gap-1">
                  <For each={found}>{(book) => <BookRow book={book} taking={takings().get(book.id) ?? IDLE} onTaking={(taking) => setTakings((before) => new Map([...before, [book.id, taking]]))} begin={() => begin(book.id)} onStop={() => stoppers.get(book.id)?.abort()} />}</For>
                </ul>
              )}
            </Loaded>
          </section>
          <p class="text-xs text-text-muted">店舗名・機種名は pRecord のまま残します。同じファイルを2回選んでも、二重には入りません。貯玉は取り込みません。</p>
        </div>
      </div>
    </MainContent>
  )
}
