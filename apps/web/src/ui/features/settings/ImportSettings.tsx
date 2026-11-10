import { createMemo, createResource, createSignal, For, Index, onCleanup, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import type { ApplicationError, ImportProblem, Outcome } from "../../../application/errors"
import { importGeneral, importPachibo, importPachifolio, importPrecord, previewGeneral, previewPachibo, previewPachifolio, previewPrecord, type Imported, type ImportPorts, type Named, type Preview, type Weighing } from "../../../application/import"
import { FIELDS, GENERAL, guessedMapping, missingOf, sheetOf, withColumn, type Mapping, type Sheet } from "../../../core/import/general"
import { PACHIBO } from "../../../core/import/pachibo"
import { PACHIFOLIO } from "../../../core/import/pachifolio"
import type { Result } from "../../../core/result/result"
import { PRECORD } from "../../../core/import/precord"
import { machineMatches } from "../../../core/catalog/description"
import type { BookId, ListedBook } from "../../../core/book/book"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { Combobox } from "../../primitives/combobox"
import { Select } from "../../primitives/select"
import { Loaded } from "../../primitives/states"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../primitives/tabs"
import { createWait } from "../../primitives/wait"
import type { Place } from "../../navigation/place"
import { bookTitle } from "../../wording/book"
import { describeError } from "../../wording/errors"
import { formatCount } from "../../wording/numbers"
import { describeImportProblem, FIELD_NAMES, NOT_TAKEN, IMPORT_BROKEN, IMPORT_CHOOSE, IMPORT_CHOOSE_PCB, IMPORT_NEXT, IMPORT_READING, IMPORT_STOP, IMPORT_WRITING, importedText, sourceName, timeLeftText, weighedText, writtenText } from "../../wording/import"
import { secondsLeftOf } from "../../../core/import/time-left"
import { ViewHeader } from "../shell/ViewHeader"

/**
 * Where a taking in is: not asked for; a file chosen being read; a file of
 * a person's own making read, its columns being tied to this app's fields;
 * a file that leaves something to ask — which machines its unknown names are,
 * whether its tallies that say their plays' hours are to be weighed — and
 * the person asked; its tallies being written; written and being weighed,
 * with how far it has got and since when, for the time it has left; done
 * with what it came to; failed with why; or broken off with nothing said
 * of why.
 */
type Taking =
  | { readonly type: "idle" }
  | { readonly type: "reading" }
  | { readonly type: "mapping"; readonly sheet: Sheet }
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
    case "mapping":
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

/**
 * An app tallies are taken in from, as this screen offers it: the word it
 * goes by, what is said of it above its books and below them, the press
 * that asks for one of its files and the files offered — any, where its
 * files carry a name a phone's picker does not know — how one of its files
 * is looked at, and how what was looked at is taken into a book.
 */
interface Source {
  readonly from: string
  readonly about: string
  readonly kept: string
  readonly choose: string
  readonly accept: string | undefined
  readonly reading: Reading
  readonly take: (bookId: BookId, preview: Preview, named: Named, weighing: Weighing | undefined) => Promise<Outcome<Imported>>
}

/**
 * How a source's file is looked at: an app's, whose columns it names
 * itself, read as UTF-8 and looked at at once; an app's of its own kind,
 * looked at at once as its bytes; or a person's own, read as UTF-8 or else
 * as Shift_JIS, as a desk's spreadsheet saves one, and looked at once its
 * columns are tied to this app's fields.
 */
type Reading =
  | { readonly type: "bytes"; readonly preview: (bytes: Uint8Array) => Promise<Outcome<Preview>> }
  | { readonly type: "named"; readonly preview: (text: string) => Promise<Outcome<Preview>> }
  | { readonly type: "mapped"; readonly sheet: (text: string) => Result<Sheet, ImportProblem>; readonly preview: (sheet: Sheet, mapping: Mapping) => Promise<Outcome<Preview>> }

/** The sources tallies are taken in from, a tab each, in the order the tabs stand: a person's own file first, then each app's, the most used first. */
const sourcesOf = (ports: ImportPorts): readonly Source[] => [
  {
    from: GENERAL,
    about: "CSV の列を、どの項目として取り込むか選んで取り込みます。1行目は見出しとして読みます。",
    kept: "店舗名・機種名・タグはファイルのまま残します。「投資」と「回収」を選ぶと「収支」は使いません。同じファイルを2回選んでも、二重には入りません。",
    choose: IMPORT_CHOOSE,
    accept: ".csv,text/csv",
    reading: { type: "mapped", sheet: sheetOf, preview: (sheet, mapping) => previewGeneral(ports, sheet, mapping) },
    take: (bookId, preview, named, weighing) => importGeneral(ports, bookId, preview, named, weighing),
  },
  {
    from: PRECORD,
    about: "pRecord で書き出した CSV から、過去の収支を取り込みます。",
    kept: "店舗名・機種名は pRecord のまま残します。同じファイルを2回選んでも、二重には入りません。貯玉は取り込みません。",
    choose: IMPORT_CHOOSE,
    accept: ".csv,text/csv",
    reading: { type: "named", preview: (text) => previewPrecord(ports, text) },
    take: (bookId, preview, named, weighing) => importPrecord(ports, bookId, preview, named, weighing),
  },
  {
    from: PACHIBO,
    about: "ぱち簿で書き出した pcb ファイルから、過去の収支を取り込みます。ぱち簿の CSV も汎用形式で取り込めますが、貯玉を使った日の現金の投資・回収や台番号・タグが入らないため、pcb ファイルでの取り込みをおすすめします。",
    kept: "店舗名・機種名・タグはぱち簿のまま残します。投資と回収は、貯玉と現金を合わせた額で取り込みます。同じファイルを2回選んでも、二重には入りません。貯玉の残高は取り込みません。",
    choose: IMPORT_CHOOSE_PCB,
    accept: undefined,
    reading: { type: "bytes", preview: (bytes) => previewPachibo(ports, bytes, utf8Of) },
    take: (bookId, preview, named, weighing) => importPachibo(ports, bookId, preview, named, weighing),
  },
  {
    from: PACHIFOLIO,
    about: "パチフォリオで書き出した CSV から、過去の収支を取り込みます。",
    kept: "店舗名・機種名・タグはパチフォリオのまま残します。回転数・大当りも取り込みます。同じファイルを2回選んでも、二重には入りません。",
    choose: IMPORT_CHOOSE,
    accept: ".csv,text/csv",
    reading: { type: "named", preview: (text) => previewPachifolio(ports, text) },
    take: (bookId, preview, named) => importPachifolio(ports, bookId, preview, named),
  },
]

/** A file's bytes as UTF-8 text, or none where they do not read as UTF-8: a character made up in its place would be written into the book. */
const utf8Of = (bytes: ArrayBuffer | Uint8Array): string | undefined => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return undefined
  }
}

/** A file's bytes as Shift_JIS text, or none where they do not read as it either. */
const shiftJisOf = (bytes: ArrayBuffer): string | undefined => {
  try {
    return new TextDecoder("shift_jis", { fatal: true }).decode(bytes)
  } catch {
    return undefined
  }
}

/** A file's bytes as text, as its source reads them: UTF-8, or else Shift_JIS for a person's own file. */
const textOf = (bytes: ArrayBuffer, reading: Exclude<Reading, { readonly type: "bytes" }>): string | undefined => utf8Of(bytes) ?? (reading.type === "mapped" ? shiftJisOf(bytes) : undefined)

/** How many of a sheet's rows are shown under each column's name, for the person to tell what the column holds. */
const SAMPLE_ROWS = 3

/** A cell shown as a sample: an empty one as two hyphens, so that it is seen to be empty. */
const sampleText = (cell: string | undefined): string => (cell === undefined || cell.trim() === "" ? "--" : cell)

/**
 * A sheet's columns, each by its name and the first rows under it, beside
 * the choice of the field it is taken in as — left out unless chosen, a
 * field chosen for one column taken from any other — and the press that
 * goes on with the mapping, which says what it still lacks rather than
 * going on without it.
 */
function ColumnsMapping(props: { readonly sheet: Sheet; readonly mapping: Mapping; readonly onMapping: (mapping: Mapping) => void; readonly onNext: () => void }): JSX.Element {
  const [lacking, setLacking] = createSignal(false)
  const missing = (): readonly ("date" | "sides")[] => missingOf(props.mapping)
  const options = [{ value: "none", label: NOT_TAKEN }, ...FIELDS.map((field) => ({ value: field, label: FIELD_NAMES[field] }))]
  return (
    <div class="flex flex-col gap-3 rounded-md border border-border px-3 py-2">
      <p class="text-sm text-text-primary">各列をどの項目として取り込むか選んでください</p>
      <ul class="flex flex-col gap-2">
        <Index each={Array.from({ length: props.sheet.width }, (_, index) => index)}>
          {(index) => (
            <li class="flex items-start gap-2 border-t border-border pt-2 first:border-t-0 first:pt-0">
              <div class="flex min-w-0 flex-1 flex-col">
                <span class="break-words text-sm font-medium text-text-primary">{props.sheet.header[index()] === undefined || props.sheet.header[index()] === "" ? `${index() + 1}列目` : props.sheet.header[index()]}</span>
                <For each={props.sheet.rows.slice(0, SAMPLE_ROWS)}>{(row) => <span class="truncate text-xs text-text-muted">{sampleText(row[index()])}</span>}</For>
              </div>
              <div class="w-40 shrink-0">
                <Select
                  label={`${props.sheet.header[index()] ?? `${index() + 1}列目`} の取り込み先`}
                  labelHidden
                  placeholder={NOT_TAKEN}
                  options={options}
                  value={props.mapping[index()] ?? "none"}
                  onChange={(value) => {
                    setLacking(false)
                    props.onMapping(withColumn(props.mapping, index(), FIELDS.find((field) => field === value)))
                  }}
                />
              </div>
            </li>
          )}
        </Index>
      </ul>
      <Show when={lacking() && missing().length > 0}>
        <p role="alert" class="text-xs text-negative">
          {describeImportProblem({ type: "unmapped", missing: missing() })}
        </p>
      </Show>
      <div class="flex justify-end">
        <Button
          size="small"
          onClick={() => {
            if (missing().length > 0) setLacking(true)
            else props.onNext()
          }}
        >
          {IMPORT_NEXT}
        </Button>
      </div>
    </div>
  )
}

/**
 * One book in a line: its title, and at the line's end a small button that
 * asks for a file of the tab's app to take into it. A file that names machines the
 * catalog does not know is taken in only after the person has been shown
 * them, each to say which machine it is or to leave as it is written; one
 * whose tallies say how long their plays lasted, only after they have said whether
 * those are to be weighed for what they were worth, which takes a while.
 * A file that leaves nothing to ask is taken in at once. What the taking
 * in came to, or why nothing was taken in, is said under the line.
 */
function BookRow(props: { readonly source: Source; readonly book: ListedBook; readonly taking: Taking; readonly onTaking: (taking: Taking) => void; readonly begin: () => AbortSignal; readonly onStop: () => void }): JSX.Element {
  const app = useApp()
  const picker: { input: HTMLInputElement | undefined } = { input: undefined }
  const taking = (): Taking => props.taking
  const setTaking = (next: Taking): void => props.onTaking(next)
  /** The machines the person has said the file's unknown names are, by the name as the file wrote it. */
  const [named, setNamed] = createSignal<ReadonlyMap<string, string>>(new Map())
  /** The fields a person's own file's columns are taken in as, by the columns' places. */
  const [mapping, setMapping] = createSignal<Mapping>([])
  const take = async (preview: Preview, weighing: boolean): Promise<void> => {
    const stopped = props.begin()
    setTaking({ type: "writing" })
    try {
      const imported = await props.source.take(
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
      const reading = props.source.reading
      setNamed(new Map())
      if (reading.type === "bytes") return looked(await reading.preview(new Uint8Array(await file.arrayBuffer())))
      const text = textOf(await file.arrayBuffer(), reading)
      if (text === undefined) return setTaking({ type: "failed", error: { type: "import", problem: { type: "not-utf8" } } })
      if (reading.type === "named") return looked(await reading.preview(text))
      const sheet = reading.sheet(text)
      if (!sheet.ok) return setTaking({ type: "failed", error: { type: "import", problem: sheet.error } })
      setMapping(guessedMapping(sheet.value))
      setTaking({ type: "mapping", sheet: sheet.value })
    } catch {
      setTaking({ type: "broken" })
    }
  }
  /** A file looked at: taken in at once where it leaves nothing to ask, and asked of otherwise. */
  const looked = async (preview: Outcome<Preview>): Promise<void> => {
    if (!preview.ok) return setTaking({ type: "failed", error: preview.error })
    if (preview.value.told === 0 && preview.value.unnamed.length === 0) return take(preview.value, false)
    setTaking({ type: "asking", preview: preview.value })
  }
  /** A person's own file looked at by the mapping they chose. */
  const mapped = async (sheet: Sheet): Promise<void> => {
    const reading = props.source.reading
    if (reading.type !== "mapped") return
    setTaking({ type: "reading" })
    try {
      await looked(await reading.preview(sheet, mapping()))
    } catch {
      setTaking({ type: "broken" })
    }
  }
  return (
    <li class="flex flex-col gap-2 rounded-md bg-surface-1 py-2 pl-3 pr-2">
      <div class="flex items-center gap-2">
        <span class="min-w-0 flex-1 break-words text-sm font-medium text-text-primary">{bookTitle(props.book)}</span>
        <Button variant="outline" size="small" class="shrink-0" onClick={() => picker.input?.click()}>
          {props.source.choose}
        </Button>
        <input ref={(element) => (picker.input = element)} type="file" accept={props.source.accept} class="hidden" onChange={(event) => void chosen(event.currentTarget)} />
      </div>
      <TakingLine taking={taking()} onStop={props.onStop} />
      <Show when={((current) => (current.type === "mapping" ? current.sheet : undefined))(taking())} keyed>
        {(sheet) => <ColumnsMapping sheet={sheet} mapping={mapping()} onMapping={setMapping} onNext={() => void mapped(sheet)} />}
      </Show>
      <Show when={((current) => (current.type === "asking" ? current : undefined))(taking())} keyed>
        {(asking) => (
          <div class="flex flex-col gap-3 rounded-md border border-border px-3 py-2">
            <Show when={asking.preview.unnamed.length > 0}>
              <div class="flex flex-col gap-2">
                <p class="text-sm text-text-primary">カタログにない機種名があります</p>
                <p class="text-xs text-text-muted">同じ機種がカタログにあれば選んでください。選ばなければ、{sourceName(props.source.from)}の名前のまま取り込みます。</p>
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
                        options={asking.preview.machines.filter((machine) => unnamed.gameKind === undefined || machine.gameKind === unnamed.gameKind).map((machine) => ({ value: machine.id, label: machine.name, ...(machine.hitChance === undefined ? {} : { note: machine.hitChance }) }))}
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

/** Where a book's taking in from an app is kept, the two together: the same book is taken into from each tab apart. */
const takingKey = (from: string, bookId: BookId): string => `${from}\u001f${bookId}`

/**
 * Taking tallies in from other apps, a tab each, into a book the person
 * chooses, on a press and at no other time: a CSV, a row a tally, kept in
 * yen with what went in and what came back. A file taken in twice writes
 * nothing the second time. Each book's taking in from each app goes on
 * whichever tab is shown.
 */
export function ImportSettings(props: { readonly place: Place }): JSX.Element {
  const app = useApp()
  const sources = sourcesOf({ session: app.services.session, catalog: app.services.catalog })
  const [books] = createResource(() => app.revision(), () => app.services.session.books())
  const [shown, setShown] = createSignal<string>(GENERAL)
  /** Where each book's taking in from each app is, kept here and not in its row: a taking in changes the books, the list of them is read again, and what the taking in came to must still be said under its row then — and a tab not shown is let go of. */
  const [takings, setTakings] = createSignal<ReadonlyMap<string, Taking>>(new Map())
  /** Each taking in now under way, to be stopped by its 中止 or by the screen being left: a weighing goes on for minutes, and nobody is there to see it once the screen is gone. */
  const stoppers = new Map<string, AbortController>()
  onCleanup(() => stoppers.forEach((stopper) => stopper.abort()))
  const begin = (key: string): AbortSignal => {
    const stopper = new AbortController()
    stoppers.set(key, stopper)
    return stopper.signal
  }
  return (
    <MainContent header={<ViewHeader place={props.place} title="インポート" />}>
      <div class="max-w-5xl">
        <Tabs value={shown()} onChange={setShown} label="取り込み元">
          <TabsList>
            <For each={sources}>{(source) => <TabsTrigger value={source.from}>{sourceName(source.from)}</TabsTrigger>}</For>
          </TabsList>
          <For each={sources}>
            {(source) => (
              <TabsContent value={source.from} class="flex flex-col gap-6 p-4">
                <p class="text-sm text-text-muted">{source.about}</p>
                <section class="flex flex-col gap-2">
                  <h2 class="px-3 text-xs font-bold tracking-wide text-text-muted">取り込み先の帳簿</h2>
                  <Loaded outcome={books()}>
                    {(found) => (
                      <ul class="flex flex-col gap-1">
                        <For each={found}>
                          {(book) => {
                            const key = takingKey(source.from, book.id)
                            return <BookRow source={source} book={book} taking={takings().get(key) ?? IDLE} onTaking={(taking) => setTakings((before) => new Map([...before, [key, taking]]))} begin={() => begin(key)} onStop={() => stoppers.get(key)?.abort()} />
                          }}
                        </For>
                      </ul>
                    )}
                  </Loaded>
                </section>
                <p class="text-xs text-text-muted">{source.kept}</p>
              </TabsContent>
            )}
          </For>
        </Tabs>
      </div>
    </MainContent>
  )
}
