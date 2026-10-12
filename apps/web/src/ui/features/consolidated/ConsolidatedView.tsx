import { createMemo, createResource, For, Show, type JSX } from "solid-js"
import { MainContent, SidePanel } from "solid-gathering-shell"

import { loadConsolidation, type ConsolidatedBook, type ConsolidatedBy } from "../../../application/consolidation"
import type { BookId } from "../../../core/book/book"
import { bestFirst, DIMENSIONS, inOrder, isDimension, merged, totalOf, type Group } from "../../../core/report/breakdown"
import { useApp } from "../../context"
import { BreakdownIcon } from "../../primitives/icons"
import { Select } from "../../primitives/select"
import { EmptyState, Loaded } from "../../primitives/states"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { bookTitle } from "../../wording/book"
import { BY_BOOK, DIMENSION_NAMES, groupName } from "../../wording/breakdown"
import { describeError } from "../../wording/errors"
import { GroupRow } from "../breakdown/BreakdownView"
import { PeriodPicker } from "../period/PeriodPicker"
import { queryFor } from "../period/periods"
import { SideList } from "../shell/SideList"
import { ViewHeader } from "../shell/ViewHeader"

/** A group as the list shows it: what it is called, and its figures. */
interface Named {
  readonly name: string
  readonly group: Group
}

/** The groups of the books that could be read, a list a book. */
const read = (books: readonly ConsolidatedBook[]): readonly (readonly Group[])[] => books.flatMap((each) => (each.groups.ok ? [each.groups.value] : []))

/** The books' results as the list shows them: book by book, each under its title, best first; or the books' groups of one key added together, in the order a book's own breakdown is read in. */
const grouped = (books: readonly ConsolidatedBook[], by: ConsolidatedBy): readonly Named[] =>
  by === "book"
    ? bestFirst(read(books).flat()).map((group) => ({ name: ((book) => (book === undefined ? group.key : bookTitle(book.book)))(books.find((each) => each.book.id === group.key)), group }))
    : inOrder(merged(read(books)), by).map((group) => ({ name: groupName(by, group.key), group }))

/**
 * Several books as one: the results of the books ticked, for a period,
 * grouped as a book's own breakdown groups them — and, first, book by
 * book, which is what several books are consolidated to see. Which books,
 * which grouping and which period are the address's — every book until
 * some are left out — so a consolidation is an address like any other
 * view.
 */
export function ConsolidatedView(props: { readonly place: Place; readonly by: ConsolidatedBy; readonly bookIds: readonly BookId[] | undefined; readonly query: string }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const [listed] = createResource(() => app.revision(), () => app.services.session.books())
  const [consolidation] = createResource(
    () => ({ bookIds: props.bookIds, by: props.by, query: props.query, revision: app.revision() }),
    (source) => loadConsolidation(app.services.session, source.bookIds, source.by, queryFor(source.by, source.query)),
  )
  const every = (): readonly BookId[] => ((found) => (found?.ok === true ? found.value.map((book) => book.id) : []))(listed())
  const ticked = (id: BookId): boolean => props.bookIds === undefined || props.bookIds.includes(id)
  const tick = (id: BookId, on: boolean): void => {
    const next = every().filter((each) => (each === id ? on : ticked(each)))
    moves.go({ kind: "consolidated-breakdown", by: props.by, bookIds: next.length === every().length ? undefined : next }, props.query)
  }
  const unread = (id: BookId): string | undefined => {
    const found = consolidation()
    const book = found?.ok === true ? found.value.find((each) => each.book.id === id) : undefined
    return book === undefined || book.groups.ok ? undefined : describeError(book.groups.error)
  }
  const groups = createMemo(() => ((found) => (found?.ok === true ? grouped(found.value, props.by) : undefined))(consolidation()))
  return (
    <MainContent header={<ViewHeader place={props.place} title="集計" />}>
      <div class="max-w-5xl">
        <div class="flex flex-col gap-4 p-4">
          <div class="flex flex-wrap items-end gap-3">
            <div class="w-48">
              <Select
                label="切り口"
                options={[{ value: "book", label: BY_BOOK }, ...DIMENSIONS.map((dimension) => ({ value: dimension, label: DIMENSION_NAMES[dimension] }))]}
                value={props.by}
                onChange={(by) => {
                  if (by === "book" || isDimension(by)) moves.go({ kind: "consolidated-breakdown", by, bookIds: props.bookIds }, props.query)
                }}
                placeholder="切り口を選ぶ"
              />
            </div>
            <PeriodPicker by={props.by} query={props.query} today={app.services.businessDay()} onTyped={(query) => moves.refine(props.place, query)} onPressed={(query) => moves.go(props.place, query)} />
          </div>
          <Loaded outcome={consolidation()}>
            {() => (
              <Show when={(groups() ?? []).length > 0} fallback={<EmptyState title="この期間の稼働はありません" />}>
                <ul class="flex flex-col gap-1">
                  <GroupRow name="合計" group={totalOf((groups() ?? []).map((each) => each.group))} strong theoreticalKept />
                  <For each={groups() ?? []}>{(each) => <GroupRow name={each.name} group={each.group} strong={false} theoreticalKept />}</For>
                </ul>
              </Show>
            )}
          </Loaded>
          <section class="flex flex-col gap-2">
            <h2 class="px-3 text-xs font-bold tracking-wide text-text-muted">連結する帳簿</h2>
            <Loaded outcome={listed()}>
              {(books) => (
                <ul class="flex flex-col gap-1">
                  <For each={books}>
                    {(book) => (
                      <li class="flex items-start gap-2 rounded-md bg-surface-1 py-2 pl-3 pr-3">
                        <input type="checkbox" aria-label={`${bookTitle(book)} を連結に入れる`} checked={ticked(book.id)} onChange={(event) => tick(book.id, event.currentTarget.checked)} class="mt-0.5 size-5 shrink-0 accent-accent" />
                        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span class="break-words text-sm font-medium" classList={{ "text-text-primary": ticked(book.id), "text-text-muted": !ticked(book.id) }}>
                            {bookTitle(book)}
                          </span>
                          <Show when={ticked(book.id) ? unread(book.id) : undefined} keyed>
                            {(why) => <span class="text-xs text-negative">{why}（合計に入っていません）</span>}
                          </Show>
                        </div>
                      </li>
                    )}
                  </For>
                </ul>
              )}
            </Loaded>
          </section>
        </div>
      </div>
    </MainContent>
  )
}

/** The side panel of the consolidation: its views, listed as a book's are. Which books, which grouping and which period are chosen in a view itself. */
export function ConsolidatedSide(props: { readonly place: Place }): JSX.Element {
  const moves = useMoves()
  return (
    <SidePanel header={<span class="font-semibold text-text-primary">連結</span>} resizeLabel="サイドパネルの幅を変える">
      <SideList
        heading="ビュー"
        items={[
          {
            id: "breakdown",
            label: "集計",
            icon: <BreakdownIcon />,
            selected: props.place.kind === "consolidated-breakdown",
            onSelect: () => moves.go({ kind: "consolidated-breakdown", by: "book", bookIds: undefined }),
          },
        ]}
      />
    </SidePanel>
  )
}
