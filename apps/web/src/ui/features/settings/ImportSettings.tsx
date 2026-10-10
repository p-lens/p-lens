import { createResource, createSignal, For, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import type { ApplicationError } from "../../../application/errors"
import { importPrecord, type Imported } from "../../../application/import"
import type { TitledBook } from "../../../core/book/book"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { Loaded } from "../../primitives/states"
import type { Place } from "../../navigation/place"
import { bookTitle } from "../../wording/book"
import { describeError } from "../../wording/errors"
import { importedText } from "../../wording/import"
import { ViewHeader } from "../shell/ViewHeader"

/** Where a taking in is: not asked for, under way, done with what it came to, or failed with why. */
type Taking =
  | { readonly type: "idle" }
  | { readonly type: "working" }
  | { readonly type: "done"; readonly imported: Imported }
  | { readonly type: "failed"; readonly error: ApplicationError }

/**
 * One book in a line: its title, and at the line's end a small button that
 * asks for a pRecord file to take into it. What the taking in came to, or
 * why nothing was taken in, is said under the line.
 */
function BookRow(props: { readonly book: TitledBook }): JSX.Element {
  const app = useApp()
  const picker: { input: HTMLInputElement | undefined } = { input: undefined }
  const [taking, setTaking] = createSignal<Taking>({ type: "idle" })
  const take = async (input: HTMLInputElement): Promise<void> => {
    const file = input.files?.[0]
    input.value = ""
    if (file === undefined || taking().type === "working") return
    setTaking({ type: "working" })
    const imported = await importPrecord({ session: app.services.session, catalog: app.services.catalog }, props.book.id, await file.text())
    setTaking(imported.ok ? { type: "done", imported: imported.value } : { type: "failed", error: imported.error })
    if (imported.ok) app.wrote()
  }
  return (
    <li class="flex flex-col gap-2 rounded-md bg-surface-1 py-2 pl-3 pr-2">
      <div class="flex items-center gap-2">
        <span class="min-w-0 flex-1 break-words text-sm font-medium text-text-primary">{bookTitle(props.book)}</span>
        <Show when={taking().type === "working"}>
          <span class="shrink-0 text-xs text-text-muted" role="status">
            取り込み中…
          </span>
        </Show>
        <Button variant="outline" size="small" class="shrink-0" onClick={() => picker.input?.click()}>
          pRecord
        </Button>
        <input ref={(element) => (picker.input = element)} type="file" accept=".csv,text/csv" class="hidden" onChange={(event) => void take(event.currentTarget)} />
      </div>
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
                  <For each={found}>{(book) => <BookRow book={book} />}</For>
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
