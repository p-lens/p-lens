import { createResource, createSignal, For, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import type { Outcome } from "../../application/errors"
import type { ListedBook } from "../../core/book/book"
import { useApp } from "../../ui/context"
import { ViewHeader } from "../../ui/features/shell/ViewHeader"
import type { Place } from "../../ui/navigation/place"
import { Button } from "../../ui/primitives/button"
import { Loaded } from "../../ui/primitives/states"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/primitives/tabs"
import { bookTitle } from "../../ui/wording/book"
import { GENERAL } from "../general/csv-import"
import { GeneralExportTab } from "../general/export-tab"
import { GENERAL_NAME } from "../general/wording"
import { MAXBET_EXPORT } from "../maxbet/tabs"
import { PACHIBO_EXPORT } from "../pachibo/tabs"
import { PACHIFOLIO_EXPORT } from "../pachifolio/tabs"
import { PRECORD_EXPORT } from "../precord/tabs"
import type { AppPress, ExportApp } from "./export-app"
import { createWritings, WritingLine, type Writing, type WritingKey } from "./writing"

/** The other apps' tabs, after the general one, in the order they stand. */
const APPS: readonly ExportApp[] = [PRECORD_EXPORT, PACHIBO_EXPORT, MAXBET_EXPORT, PACHIFOLIO_EXPORT]

/** One book in a line of another app's tab: its title, and at the line's end a press for each file that writes its tallies out for that app. */
function AppBookRow(props: { readonly book: ListedBook; readonly writing: Writing; readonly presses: readonly AppPress[] }): JSX.Element {
  const app = useApp()
  return (
    <li class="flex flex-col gap-2 rounded-md bg-surface-1 py-2 pl-3 pr-2">
      <div class="flex items-center gap-2">
        <span class="min-w-0 flex-1 break-words text-sm font-medium text-text-primary">{bookTitle(props.book)}</span>
        <For each={props.presses}>
          {(press) => (
            <Button variant="outline" size="small" class="shrink-0" onClick={() => void props.writing.write((watch) => press.make(app.services.export, props.book.id, watch))}>
              {press.label}
            </Button>
          )}
        </For>
      </div>
      <WritingLine writing={props.writing} />
    </li>
  )
}

/** Another app's tab: what its files are, and the books, each written out for it by itself. */
function AppTab(props: { readonly app: ExportApp; readonly books: Outcome<readonly ListedBook[]> | undefined; readonly writingOf: (key: WritingKey) => Writing }): JSX.Element {
  return (
    <TabsContent value={props.app.format} class="flex flex-col gap-6 p-4">
      <p class="text-sm text-text-muted">{props.app.about}</p>
      <Loaded outcome={props.books}>
        {(found) => (
          <section class="flex flex-col gap-2">
            <h2 class="px-3 text-xs font-bold tracking-wide text-text-muted">帳簿</h2>
            <ul class="flex flex-col gap-1">
              <For each={found}>{(book) => <AppBookRow book={book} writing={props.writingOf(`${props.app.format}:${book.id}`)} presses={props.app.presses} />}</For>
            </ul>
          </section>
        )}
      </Loaded>
    </TabsContent>
  )
}

/**
 * Writing a book out as a file other than a backup, each on a press and at
 * no other time, a tab a kind of file: the general tab's, files any app or
 * person reads, and each other app's, its tallies as that app takes them in.
 */
export function ExportSettings(props: { readonly place: Place }): JSX.Element {
  const app = useApp()
  const [books] = createResource(() => app.revision(), () => app.services.session.books())
  const writingOf = createWritings(app.services.export)
  const [shown, setShown] = createSignal<string>(GENERAL)
  return (
    <MainContent header={<ViewHeader place={props.place} title="エクスポート" />}>
      <div class="max-w-5xl">
        <Tabs value={shown()} onChange={setShown} label="書き出す形式">
          <TabsList>
            <TabsTrigger value={GENERAL}>{GENERAL_NAME}</TabsTrigger>
            <For each={APPS}>{(each) => <TabsTrigger value={each.format}>{each.name}</TabsTrigger>}</For>
          </TabsList>
          <GeneralExportTab books={books()} writingOf={writingOf} />
          <For each={APPS}>{(each) => <AppTab app={each} books={books()} writingOf={writingOf} />}</For>
        </Tabs>
      </div>
    </MainContent>
  )
}
