import { createMemo, createResource, For, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { consolidationKeepsTheoreticalValues, loadConsolidation, type ConsolidatedBook, type ConsolidatedBy } from "../../../application/consolidation"
import type { MachineNames } from "../../../core/catalog/catalog"
import type { BookId } from "../../../core/book/book"
import { bestFirst, DIMENSIONS, inOrder, isDimension, merged, totalOf, type Group } from "../../../core/report/breakdown"
import { useApp } from "../../context"
import { Select } from "../../primitives/select"
import { EmptyState, Loaded } from "../../primitives/states"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { bookTitle } from "../../wording/book"
import { BY_BOOK, DIMENSION_NAMES, groupName } from "../../wording/breakdown"
import { GroupRow } from "../breakdown/BreakdownView"
import { PeriodPicker } from "../period/PeriodPicker"
import { queryFor } from "../period/periods"
import { ViewHeader } from "../shell/ViewHeader"
import { ConsolidatedBooks } from "./ConsolidatedBooks"
import { readOf, unreadIn } from "./read"

/** A group as the list shows it: what it is called, and its figures. */
interface Named {
  readonly name: string
  readonly group: Group
}

/** The books' results as the list shows them: book by book, each under its title, best first; or the books' groups of one key added together, in the order a book's own breakdown is read in. */
const grouped = (books: readonly ConsolidatedBook<readonly Group[]>[], by: ConsolidatedBy, machineNames: MachineNames): readonly Named[] =>
  by === "book"
    ? bestFirst(readOf(books).flat()).map((group) => ({ name: ((book) => (book === undefined ? group.key : bookTitle(book.book)))(books.find((each) => each.book.id === group.key)), group }))
    : inOrder(merged(readOf(books)), by).map((group) => ({ name: groupName(by, group.key, machineNames), group }))

/**
 * Several books as one: the results of the books ticked, for a period,
 * grouped as a book's own breakdown groups them — and, first, book by
 * book, which is what several books are consolidated to see. Which books,
 * which grouping and which period are the address's — every book until
 * some are left out — so a consolidation is an address like any other
 * view. Where none of the books keeps theoretical values there is no sum
 * of them to show, as in a book that keeps none.
 */
export function ConsolidatedBreakdownView(props: { readonly place: Place; readonly by: ConsolidatedBy; readonly bookIds: readonly BookId[] | undefined; readonly query: string }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const [consolidation] = createResource(
    () => ({ bookIds: props.bookIds, by: props.by, query: props.query, revision: app.revision() }),
    (source) => loadConsolidation(app.services.session, source.bookIds, source.by, queryFor(source.by, source.query)),
  )
  const [kept] = createResource(() => ({ bookIds: props.bookIds, revision: app.revision() }), (source) => consolidationKeepsTheoreticalValues(app.services.session, source.bookIds))
  /** Whether any of the books keeps theoretical values: taken to until hledger says none does. */
  const theoreticalKept = (): boolean => ((answer) => answer?.ok !== true || answer.value)(kept())
  const groups = createMemo(() => ((found) => (found?.ok === true ? grouped(found.value, props.by, app.machineNames()) : undefined))(consolidation()))
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
                  <GroupRow name="合計" group={totalOf((groups() ?? []).map((each) => each.group))} strong theoreticalKept={theoreticalKept()} />
                  <For each={groups() ?? []}>{(each) => <GroupRow name={each.name} group={each.group} strong={false} theoreticalKept={theoreticalKept()} />}</For>
                </ul>
              </Show>
            )}
          </Loaded>
          <ConsolidatedBooks bookIds={props.bookIds} unread={(id) => unreadIn(consolidation(), id)} onChosen={(bookIds) => moves.go({ kind: "consolidated-breakdown", by: props.by, bookIds }, props.query)} />
        </div>
      </div>
    </MainContent>
  )
}
