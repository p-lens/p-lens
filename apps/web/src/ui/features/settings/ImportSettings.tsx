import { createResource, createSignal, For, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import type { ApplicationError } from "../../../application/errors"
import { importPrecord, previewPrecord, type Imported, type Preview } from "../../../application/import"
import { machineMatches } from "../../../core/catalog/description"
import type { BookId, ListedBook } from "../../../core/book/book"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { Combobox } from "../../primitives/combobox"
import { Loaded } from "../../primitives/states"
import type { Place } from "../../navigation/place"
import { bookTitle } from "../../wording/book"
import { describeError } from "../../wording/errors"
import { formatCount } from "../../wording/numbers"
import { importedText, weighedText } from "../../wording/import"
import { ViewHeader } from "../shell/ViewHeader"

/**
 * Where a taking in is: not asked for; a file chosen that leaves
 * something to ask — which machines its unknown names are, whether its
 * plays that say their hours are to be weighed — and the person asked;
 * under way,
 * with how far a weighing has got where there is one; done with what it
 * came to; or failed with why.
 */
type Taking =
  | { readonly type: "idle" }
  | { readonly type: "asking"; readonly text: string; readonly preview: Preview }
  | { readonly type: "working"; readonly weighed: { readonly done: number; readonly of: number; readonly beyond: boolean } | undefined }
  | { readonly type: "done"; readonly imported: Imported }
  | { readonly type: "failed"; readonly error: ApplicationError }

const IDLE: Taking = { type: "idle" }

/**
 * One book in a line: its title, and at the line's end a small button that
 * asks for a pRecord file to take into it. A file that names machines the
 * catalog does not know is taken in only after the person has been shown
 * them, each to say which machine it is or to leave as it is written; one
 * whose plays say how long they lasted, only after they have said whether
 * those are to be weighed for what they were worth, which takes a while.
 * A file that leaves nothing to ask is taken in at once. What the taking
 * in came to, or why nothing was taken in, is said under the line.
 */
function BookRow(props: { readonly book: ListedBook; readonly taking: Taking; readonly onTaking: (taking: Taking) => void }): JSX.Element {
  const app = useApp()
  const picker: { input: HTMLInputElement | undefined } = { input: undefined }
  const taking = (): Taking => props.taking
  const setTaking = (next: Taking): void => props.onTaking(next)
  /** The machines the person has said the file's unknown names are, by the name as the file wrote it. */
  const [named, setNamed] = createSignal<ReadonlyMap<string, string>>(new Map())
  const take = async (text: string, weighing: boolean): Promise<void> => {
    setTaking({ type: "working", weighed: undefined })
    const imported = await importPrecord(
      { session: app.services.session, catalog: app.services.catalog },
      props.book.id,
      text,
      named(),
      weighing ? { engine: app.services.pachinko, onWeighed: (done, of, beyond) => setTaking({ type: "working", weighed: { done, of, beyond } }) } : undefined,
    )
    setTaking(imported.ok ? { type: "done", imported: imported.value } : { type: "failed", error: imported.error })
    if (imported.ok) app.wrote()
  }
  const chosen = async (input: HTMLInputElement): Promise<void> => {
    const file = input.files?.[0]
    input.value = ""
    if (file === undefined || taking().type === "working") return
    const text = await file.text()
    setNamed(new Map())
    const preview = await previewPrecord({ catalog: app.services.catalog }, text)
    if (!preview.ok) {
      setTaking({ type: "failed", error: preview.error })
      return
    }
    if (preview.value.told === 0 && preview.value.unnamed.length === 0) return take(text, false)
    setTaking({ type: "asking", text, preview: preview.value })
  }
  return (
    <li class="flex flex-col gap-2 rounded-md bg-surface-1 py-2 pl-3 pr-2">
      <div class="flex items-center gap-2">
        <span class="min-w-0 flex-1 break-words text-sm font-medium text-text-primary">{bookTitle(props.book)}</span>
        <Show when={((current) => (current.type === "working" ? current : undefined))(taking())} keyed>
          {(working) => (
            <span class="shrink-0 text-xs tabular-nums" classList={{ "text-text-muted": working.weighed?.beyond !== true, "text-warning": working.weighed?.beyond === true }} role="status">
              {working.weighed === undefined || working.weighed.of === 0 ? "取り込み中…" : weighedText(working.weighed.done, working.weighed.of, working.weighed.beyond)}
            </span>
          )}
        </Show>
        <Button variant="outline" size="small" class="shrink-0" onClick={() => picker.input?.click()}>
          pRecord
        </Button>
        <input ref={(element) => (picker.input = element)} type="file" accept=".csv,text/csv" class="hidden" onChange={(event) => void chosen(event.currentTarget)} />
      </div>
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
                        <span class="text-xs text-text-muted">（{formatCount(unnamed.plays)}件）</span>
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
                  <Button size="small" onClick={() => void take(asking.text, false)}>
                    取り込む
                  </Button>
                </div>
              }
            >
              <div class="flex flex-col gap-2">
                <p class="text-sm text-text-primary">推定期待値を出しますか？</p>
                <p class="text-xs text-text-muted">稼働時間のある{formatCount(asking.preview.told)}件のうち、機種がカタログにあるパチンコの稼働を、稼働時間と投資額・回収額から推定します。件数が多いと時間がかかります。</p>
                <div class="flex flex-wrap justify-end gap-2">
                  <Button variant="secondary" size="small" onClick={() => void take(asking.text, false)}>
                    出さずに取り込む
                  </Button>
                  <Button size="small" onClick={() => void take(asking.text, true)}>
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
      <Show when={((current) => (current.type === "failed" ? current.error : undefined))(taking())} keyed>
        {(error) => (
          <p role="alert" class="rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-text-primary">
            {describeError(error)}
          </p>
        )}
      </Show>
    </li>
  )
}

/**
 * Taking plays in from another app, into a book the person chooses, on a
 * press and at no other time: pRecord's CSV, a row a play, kept in yen with
 * what went in and what came back. A file taken in twice writes nothing
 * the second time.
 */
export function ImportSettings(props: { readonly place: Place }): JSX.Element {
  const app = useApp()
  const [books] = createResource(() => app.revision(), () => app.services.session.books())
  /** Where each book's taking in is, kept here and not in its row: a taking in changes the books, the list of them is read again, and what the taking in came to must still be said under its row then. */
  const [takings, setTakings] = createSignal<ReadonlyMap<BookId, Taking>>(new Map())
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
                  <For each={found}>{(book) => <BookRow book={book} taking={takings().get(book.id) ?? IDLE} onTaking={(taking) => setTakings((before) => new Map([...before, [book.id, taking]]))} />}</For>
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
