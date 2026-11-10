import { createMemo, createResource, createSignal, For, onCleanup, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import type { BookId, ListedBook } from "../../core/book/book"
import { machineMatches } from "../../core/catalog/description"
import { Ok, type Result } from "../../core/result/result"
import { useApp } from "../../ui/context"
import { ViewHeader } from "../../ui/features/shell/ViewHeader"
import type { Place } from "../../ui/navigation/place"
import { Button } from "../../ui/primitives/button"
import { Combobox } from "../../ui/primitives/combobox"
import { Loaded } from "../../ui/primitives/states"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/primitives/tabs"
import { createWait } from "../../ui/primitives/wait"
import { bookTitle } from "../../ui/wording/book"
import { formatCount } from "../../ui/wording/numbers"
import { gameSaidOnly, type Imported, type ImportError, type ImportPorts, type Preview } from "../application/import"
import { secondsLeftOf } from "../core/time-left"
import type { Mapping, Sheet } from "../general/csv-import"
import { generalImport } from "../general/import-tab"
import { maxbetImport } from "../maxbet/tabs"
import { pachiboImport } from "../pachibo/tabs"
import { pachifolioImport } from "../pachifolio/tabs"
import { precordImport } from "../precord/tabs"
import { utf8Of, type ImportSource, type Reading } from "./import-source"
import { describeImportError, IMPORT_BROKEN, IMPORT_READING, IMPORT_STOP, IMPORT_WRITING, importedText, timeLeftText, UNTAGGED_TAKEN, untaggedText, weighedText, writtenText } from "./import-wording"

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
type Taking<P> =
  | { readonly type: "idle" }
  | { readonly type: "reading" }
  | { readonly type: "mapping"; readonly sheet: Sheet }
  | { readonly type: "asking"; readonly preview: Preview }
  | { readonly type: "writing" }
  | { readonly type: "weighing"; readonly written: number; readonly alreadyHere: number; readonly done: number; readonly of: number; readonly beyond: boolean; readonly since: number }
  | { readonly type: "done"; readonly imported: Imported }
  | { readonly type: "failed"; readonly error: ImportError<P> }
  | { readonly type: "broken" }

const IDLE = { type: "idle" } as const

/** Whether a taking in is under way, and a file chosen now would be turned away. */
const isBusy = (taking: Taking<unknown>): boolean => taking.type === "reading" || taking.type === "writing" || taking.type === "weighing"

/** A weighing told how far it has got: since when it is counted from its first report, so the time it has left goes by the tallies weighed alone. */
const weighedOn = <P,>(current: Taking<P>, report: { readonly done: number; readonly of: number; readonly beyond: boolean }): Taking<P> =>
  current.type === "weighing" ? { ...current, ...report, since: report.done === 0 && !report.beyond ? performance.now() : current.since } : current

/** What is said of a taking in under way: the file being read, its tallies being written, or those written and how far their weighing has got, with about how long it has left. */
const takingText = (taking: Taking<unknown>): string => {
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
function TakingLine(props: { readonly taking: Taking<unknown>; readonly onStop: () => void }): JSX.Element {
  const wait = createWait(() => isBusy(props.taking))
  const lastBusy = createMemo<Taking<unknown>>((before) => (isBusy(props.taking) ? props.taking : before), props.taking)
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

/** A file's bytes as Shift_JIS text, or none where they do not read as it either. */
const shiftJisOf = (bytes: ArrayBuffer): string | undefined => {
  try {
    return new TextDecoder("shift_jis", { fatal: true }).decode(bytes)
  } catch {
    return undefined
  }
}

/** A file's bytes as text, as its source reads them: UTF-8, or else Shift_JIS for a person's own file. */
const textOf = <P,>(bytes: ArrayBuffer, reading: Exclude<Reading<P>, { readonly type: "bytes" }>): string | undefined => utf8Of(bytes) ?? (reading.type === "mapped" ? shiftJisOf(bytes) : undefined)

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
function BookRow<P>(props: { readonly source: ImportSource<P>; readonly book: ListedBook; readonly taking: Taking<P>; readonly onTaking: (taking: Taking<P>) => void; readonly begin: () => AbortSignal; readonly onStop: () => void }): JSX.Element {
  const app = useApp()
  const picker: { input: HTMLInputElement | undefined } = { input: undefined }
  const taking = (): Taking<P> => props.taking
  const setTaking = (next: Taking<P>): void => props.onTaking(next)
  /** The machines the person has said the file's unknown names are, by the name as the file wrote it. */
  const [named, setNamed] = createSignal<ReadonlyMap<string, string>>(new Map())
  /** The fields a person's own file's columns are taken in as, by the columns' places. */
  const [mapping, setMapping] = createSignal<Mapping>([])
  /** Whether the file's tallies that say no game are taken in too, where the source asks. */
  const [untaggedTaken, setUntaggedTaken] = createSignal(false)
  /** Whether the person is asked to take in a file's tallies that say no game. */
  const asksUntagged = (preview: Preview): boolean => props.source.asksUntagged && preview.gameUnsaid > 0
  const take = async (looked: Preview, weighing: boolean): Promise<void> => {
    const chosen: Result<Preview, ImportError<P>> = asksUntagged(looked) && !untaggedTaken() ? gameSaidOnly(looked) : Ok(looked)
    if (!chosen.ok) return setTaking({ type: "failed", error: chosen.error })
    const preview = chosen.value
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
      setUntaggedTaken(false)
      if (reading.type === "bytes") return looked(await reading.preview(new Uint8Array(await file.arrayBuffer())))
      const text = textOf(await file.arrayBuffer(), reading)
      if (text === undefined) return setTaking({ type: "failed", error: { type: "import", problem: { type: "not-utf8" } } })
      if (reading.type === "named") return looked(await reading.preview(text))
      const sheet = reading.sheet(text)
      if (!sheet.ok) return setTaking({ type: "failed", error: { type: "unread", problem: sheet.error } })
      setMapping(reading.guess(sheet.value))
      setTaking({ type: "mapping", sheet: sheet.value })
    } catch {
      setTaking({ type: "broken" })
    }
  }
  /** A file looked at: taken in at once where it leaves nothing to ask, and asked of otherwise. */
  const looked = async (preview: Result<Preview, ImportError<P>>): Promise<void> => {
    if (!preview.ok) return setTaking({ type: "failed", error: preview.error })
    if (preview.value.told === 0 && preview.value.unnamed.length === 0 && !asksUntagged(preview.value)) return take(preview.value, false)
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
        {(sheet) => ((reading) => (reading.type === "mapped" ? <reading.Columns sheet={sheet} mapping={mapping()} onMapping={setMapping} onNext={() => void mapped(sheet)} /> : undefined))(props.source.reading)}
      </Show>
      <Show when={((current) => (current.type === "asking" ? current : undefined))(taking())} keyed>
        {(asking) => (
          <div class="flex flex-col gap-3 rounded-md border border-border px-3 py-2">
            <Show when={asking.preview.unnamed.length > 0}>
              <div class="flex flex-col gap-2">
                <p class="text-sm text-text-primary">カタログにない機種名があります</p>
                <p class="text-xs text-text-muted">同じ機種がカタログにあれば選んでください。選ばなければ、{props.source.name}の名前のまま取り込みます。</p>
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
            <Show when={asksUntagged(asking.preview)}>
              <div class="flex flex-col gap-2">
                <p class="text-sm text-text-primary">{untaggedText(asking.preview.gameUnsaid, asking.preview.sources.length)}</p>
                <label class="flex cursor-pointer items-center gap-3">
                  <input type="checkbox" checked={untaggedTaken()} onChange={(event) => setUntaggedTaken(event.currentTarget.checked)} class="size-5 shrink-0 accent-accent" />
                  <span class="min-w-0 flex-1 text-sm text-text-primary">{UNTAGGED_TAKEN}</span>
                </label>
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
      <Show when={((current) => (current.type === "failed" ? describeImportError(current.error, props.source.describe) : current.type === "broken" ? IMPORT_BROKEN : undefined))(taking())} keyed>
        {(said) => (
          <p role="alert" class="rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-text-primary">
            {said}
          </p>
        )}
      </Show>
    </li>
  )
}

/** An app's tab as the screen holds it: the word it goes by, its name, what is said above and below its books, and a book's line, with the taking in it holds for each. */
interface ImportTab {
  readonly from: string
  readonly name: string
  readonly about: string
  readonly kept: string
  readonly row: (book: ListedBook) => JSX.Element
}

/**
 * An app's tab, keeping where each book's taking in from it is — here and
 * not in its row: a taking in changes the books, the list of them is read
 * again, and what the taking in came to must still be said under its row
 * then. Made by the screen, it lasts as the screen does.
 */
const tabOf = <P,>(source: ImportSource<P>, begin: (key: string) => AbortSignal, stop: (key: string) => void): ImportTab => {
  const [takings, setTakings] = createSignal<ReadonlyMap<BookId, Taking<P>>>(new Map())
  return {
    from: source.from,
    name: source.name,
    about: source.about,
    kept: source.kept,
    row: (book) => {
      const key = `${source.from}\u001f${book.id}`
      return <BookRow source={source} book={book} taking={takings().get(book.id) ?? IDLE} onTaking={(taking) => setTakings((before) => new Map([...before, [book.id, taking]]))} begin={() => begin(key)} onStop={() => stop(key)} />
    },
  }
}

/**
 * Taking tallies in from other apps, a tab each, into a book the person
 * chooses, on a press and at no other time: a CSV, a row a tally, kept in
 * yen with what went in and what came back. A file taken in twice writes
 * nothing the second time. Each book's taking in from each app goes on
 * whichever tab is shown. The tabs stand a person's own file first, then
 * each app's, the most used first.
 */
export function ImportSettings(props: { readonly place: Place }): JSX.Element {
  const app = useApp()
  const ports: ImportPorts = { session: app.services.session, catalog: app.services.catalog }
  const [books] = createResource(() => app.revision(), () => app.services.session.books())
  /** Each taking in now under way, to be stopped by its 中止 or by the screen being left: a weighing goes on for minutes, and nobody is there to see it once the screen is gone. */
  const stoppers = new Map<string, AbortController>()
  onCleanup(() => stoppers.forEach((stopper) => stopper.abort()))
  const begin = (key: string): AbortSignal => {
    const stopper = new AbortController()
    stoppers.set(key, stopper)
    return stopper.signal
  }
  const stop = (key: string): void => stoppers.get(key)?.abort()
  const tabs: readonly ImportTab[] = [
    tabOf(generalImport(ports), begin, stop),
    tabOf(precordImport(ports), begin, stop),
    tabOf(pachiboImport(ports), begin, stop),
    tabOf(maxbetImport(ports), begin, stop),
    tabOf(pachifolioImport(ports), begin, stop),
  ]
  const [shown, setShown] = createSignal<string>(tabs[0]?.from ?? "")
  return (
    <MainContent header={<ViewHeader place={props.place} title="インポート" />}>
      <div class="max-w-5xl">
        <Tabs value={shown()} onChange={setShown} label="取り込み元">
          <TabsList>
            <For each={tabs}>{(tab) => <TabsTrigger value={tab.from}>{tab.name}</TabsTrigger>}</For>
          </TabsList>
          <For each={tabs}>
            {(tab) => (
              <TabsContent value={tab.from} class="flex flex-col gap-6 p-4">
                <p class="text-sm text-text-muted">{tab.about}</p>
                <section class="flex flex-col gap-2">
                  <h2 class="px-3 text-xs font-bold tracking-wide text-text-muted">取り込み先の帳簿</h2>
                  <Loaded outcome={books()}>
                    {(found) => (
                      <ul class="flex flex-col gap-1">
                        <For each={found}>{(book) => tab.row(book)}</For>
                      </ul>
                    )}
                  </Loaded>
                </section>
                <p class="text-xs text-text-muted">{tab.kept}</p>
              </TabsContent>
            )}
          </For>
        </Tabs>
      </div>
    </MainContent>
  )
}
