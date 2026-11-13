import { createMemo, createResource, For, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import {
  consolidationKeepsTheoreticalValues,
  loadConsolidatedOtherGains,
  loadConsolidatedOverall,
  loadConsolidatedRates,
  loadConsolidatedSenderNames,
  loadConsolidation,
  type ConsolidatedBook,
  type ConsolidatedBy,
  type ConsolidatedGrouping,
  type ConsolidationPorts,
} from "../../../application/consolidation"
import type { MachineNames } from "../../../core/catalog/catalog"
import type { BookId } from "../../../core/book/book"
import { inOrder, isDimension, merged, OVERALL, totalOf, UNSAID, type Group } from "../../../core/report/breakdown"
import { isNarrowed, matchesNothing, type Narrowing } from "../../../core/report/narrowing"
import { mapOk } from "../../../core/result/result"
import { hasOtherGains, mergedOtherGains, type OtherGains } from "../../../core/report/other-gains"
import { mergedOverall } from "../../../core/report/overall"
import type { SenderNames } from "../../../core/report/senders"
import { useApp } from "../../context"
import { Select } from "../../primitives/select"
import { EmptyState, Loaded, Refreshing } from "../../primitives/states"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { bookTitle } from "../../wording/book"
import { BY_BOOK, BY_SENDER, groupName, NOTHING_NARROWED, senderName, unsentName } from "../../wording/breakdown"
import { BREAKDOWN_OPTIONS, GroupRow } from "../breakdown/BreakdownView"
import { OtherGainsSection } from "../breakdown/OtherGainsSection"
import { OverallCard } from "../breakdown/OverallCard"
import { drilledFrom } from "../breakdown/drill"
import { NarrowingFilters, type OffersOf } from "../breakdown/NarrowingFilters"
import { byShownResult, shownBestFirst, shownOrder } from "../breakdown/shown-order"
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

const byBest = (left: Named, right: Named): number => byShownResult(left.group, right.group) || left.name.localeCompare(right.name)

/**
 * The books' results by who played them, best first: each sender's over
 * every book added, under the name on their last tally, and each book's
 * tallies that name no sender apart, under its title — a book's own
 * owner plays it too, and six books' owners are six people.
 */
const bySender = (books: readonly ConsolidatedBook<readonly Group[]>[], names: SenderNames): readonly Named[] => [
  ...merged(readOf(books).map((groups) => groups.filter((group) => group.key !== UNSAID))).map((group) => ({ name: senderName(names, group.key), group })),
  ...books.flatMap((each) => (each.read.ok ? each.read.value.filter((group) => group.key === UNSAID).map((group) => ({ name: unsentName(bookTitle(each.book)), group })) : [])),
].toSorted(byBest)

/** The books' results as the list shows them: book by book, each under its title, best first; by who played them; or the books' groups of one key added together, in the order a book's own breakdown is read in. */
const grouped = (books: readonly ConsolidatedBook<readonly Group[]>[], by: ConsolidatedGrouping, machineNames: MachineNames, names: SenderNames): readonly Named[] => {
  if (by === "book") return shownBestFirst(readOf(books).flat()).map((group) => ({ name: ((book) => (book === undefined ? group.key : bookTitle(book.book)))(books.find((each) => each.book.id === group.key)), group }))
  return by === "sender" ? bySender(books, names) : shownOrder(inOrder(merged(readOf(books)), by), by).map((group) => ({ name: groupName(by, group.key, machineNames), group }))
}

const NO_NAMES: SenderNames = new Map()

/** What a consolidation can be narrowed to: the rates its books keep savings at, and the parlors and machines their tallies of the period say, added and best first. */
const consolidatedOffers =
  (ports: ConsolidationPorts, bookIds: readonly BookId[] | undefined): OffersOf =>
  async (by, query) =>
    by === "rate"
      ? loadConsolidatedRates(ports, bookIds)
      : mapOk(await loadConsolidation(ports, bookIds, by, queryFor(by, query)), (books) => inOrder(merged(readOf(books)), by).map((group) => group.key).filter((key) => key !== UNSAID))

/**
 * Several books as one: the results of the books ticked, for a period,
 * taken as one, 総合 — what it opens on — or grouped book by book, by who
 * played them, or as a book's own breakdown groups them. Which books,
 * which grouping and which period are the address's — every book until
 * some are left out — so a consolidation is an address like any other
 * view, and so is what it is narrowed to, as a book's breakdown is: a
 * group of a game, a parlor, a machine, a year or a month is pressed to
 * look into it, a book's and a player's are not. Where none of the books
 * keeps theoretical values there is no sum of them to show, as in a book
 * that keeps none. その他損益 is left out while narrowed.
 */
export function ConsolidatedBreakdownView(props: { readonly place: Place; readonly by: ConsolidatedBy; readonly bookIds: readonly BookId[] | undefined; readonly narrowing: Narrowing; readonly query: string }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  /** What the books' tallies are grouped by; none where they are taken as one. */
  const grouping = (): ConsolidatedGrouping | undefined => (props.by === OVERALL ? undefined : props.by)
  const [consolidation] = createResource(
    () =>
      ((by) => (by === undefined || matchesNothing(props.narrowing) ? undefined : { bookIds: props.bookIds, by, narrowing: props.narrowing, query: props.query, revision: app.revision(), outdated: app.consolidationOutdated() }))(
        grouping(),
      ),
    (source) => loadConsolidation(app.services.consolidation, source.bookIds, source.by, queryFor(source.by, source.query), source.narrowing, "tallied"),
  )
  const [overall] = createResource(
    () =>
      props.by === OVERALL && !matchesNothing(props.narrowing) ? { bookIds: props.bookIds, narrowing: props.narrowing, query: props.query, revision: app.revision(), outdated: app.consolidationOutdated() } : undefined,
    (source) => loadConsolidatedOverall(app.services.consolidation, source.bookIds, source.query, source.narrowing),
  )
  const [kept] = createResource(() => ({ bookIds: props.bookIds, revision: app.revision(), outdated: app.consolidationOutdated() }), (source) => consolidationKeepsTheoreticalValues(app.services.consolidation, source.bookIds))
  /** Whether any of the books keeps theoretical values: taken to until hledger says none does. */
  const theoreticalKept = (): boolean => ((answer) => answer?.ok !== true || answer.value)(kept())
  const [named] = createResource(
    () => (props.by === "sender" ? { bookIds: props.bookIds, revision: app.revision(), outdated: app.consolidationOutdated() } : undefined),
    (source) => loadConsolidatedSenderNames(app.services.consolidation, source.bookIds),
  )
  /** Who sent the plays, by their last names, while the tallies are grouped by who played them and once they are read. */
  const names = (): SenderNames => ((answer) => (answer?.ok === true ? answer.value : NO_NAMES))(named())
  const [othered] = createResource(
    () => (props.by === OVERALL && !isNarrowed(props.narrowing) ? { bookIds: props.bookIds, query: props.query, revision: app.revision(), outdated: app.consolidationOutdated() } : undefined),
    (source) => loadConsolidatedOtherGains(app.services.consolidation, source.bookIds, source.query),
  )
  /** その他損益 over the books, added, under 総合 alone and only where there is any: 総合 stands without it. */
  const otherGains = (): OtherGains | undefined => ((answer) => (props.by === OVERALL && !isNarrowed(props.narrowing) && answer?.ok === true ? ((gains) => (hasOtherGains(gains) ? gains : undefined))(mergedOtherGains(readOf(answer.value))) : undefined))(othered())
  const placed = (by: ConsolidatedBy, narrowing: Narrowing): Place => ({ kind: "consolidated-breakdown", by, bookIds: props.bookIds, narrowing })
  const opener = (key: string): (() => void) | undefined =>
    ((by) =>
      by === undefined || by === "book" || by === "sender"
        ? undefined
        : ((drilled) => (drilled === undefined ? undefined : () => moves.go(placed(drilled.by, drilled.narrowing), drilled.query)))(drilledFrom(by, key, props.narrowing, props.query)))(grouping())
  const groups = createMemo(() => ((found, by) => (found?.ok === true && by !== undefined ? grouped(found.value, by, app.machineNames(), names()) : undefined))(consolidation(), grouping()))
  return (
    <MainContent header={<ViewHeader place={props.place} title="集計" />}>
      <div class="max-w-5xl">
        <div class="flex flex-col gap-4 p-4">
          <div class="flex flex-wrap items-end gap-3">
            <div class="w-[8.5rem]">
              <Select
                label="切り口"
                options={[...BREAKDOWN_OPTIONS.slice(0, 1), { value: "book", label: BY_BOOK }, { value: "sender", label: BY_SENDER }, ...BREAKDOWN_OPTIONS.slice(1)]}
                value={props.by}
                onChange={(by) => {
                  if (by === OVERALL || by === "book" || by === "sender" || isDimension(by)) moves.go(placed(by, props.narrowing), props.query)
                }}
                placeholder="切り口を選ぶ"
              />
            </div>
            <PeriodPicker by={props.by} query={props.query} today={app.services.businessDay()} onTyped={(query) => moves.refine(props.place, query)} onPressed={(query) => moves.go(props.place, query)} />
            <ConsolidatedBooks bookIds={props.bookIds} unread={(id) => (props.by === OVERALL ? unreadIn(overall(), id) : unreadIn(consolidation(), id))} onChosen={(bookIds) => moves.go({ kind: "consolidated-breakdown", by: props.by, bookIds, narrowing: props.narrowing }, props.query)} />
          </div>
          <NarrowingFilters
            scope={(props.bookIds ?? []).join(",")}
            offersOf={consolidatedOffers(app.services.consolidation, props.bookIds)}
            query={props.query}
            narrowing={props.narrowing}
            onNarrowed={(narrowing) => moves.refine(placed(props.by, narrowing), props.query)}
          />
          <Show when={matchesNothing(props.narrowing)}>
            <EmptyState title={NOTHING_NARROWED} />
          </Show>
          <Show when={props.by === OVERALL && !matchesNothing(props.narrowing)}>
            <Refreshing loading={overall.state === "refreshing"}>
              <Loaded outcome={overall()}>
                {(books) => (
                  <Show when={mergedOverall(readOf(books)).plays > 0} fallback={<EmptyState title="この期間の収支はありません" />}>
                    <OverallCard overall={mergedOverall(readOf(books))} theoreticalKept={theoreticalKept()} />
                  </Show>
                )}
              </Loaded>
            </Refreshing>
          </Show>
          <Show when={grouping() !== undefined && !matchesNothing(props.narrowing)}>
            <Refreshing loading={consolidation.state === "refreshing"}>
              <Loaded outcome={consolidation()}>
                {() => (
                  <Show when={(groups() ?? []).length > 0} fallback={<EmptyState title="この期間の収支はありません" />}>
                    <ul class="flex flex-col gap-1">
                      <GroupRow name="合計" group={totalOf((groups() ?? []).map((each) => each.group))} strong theoreticalKept={theoreticalKept()} />
                      <For each={groups() ?? []}>
                        {(each) => <GroupRow name={each.name} group={each.group} strong={false} theoreticalKept={theoreticalKept()} onOpen={opener(each.group.key)} />}
                      </For>
                    </ul>
                  </Show>
                )}
              </Loaded>
            </Refreshing>
          </Show>
          <Show when={otherGains()} keyed>
            {(found) => <OtherGainsSection gains={found} />}
          </Show>
        </div>
      </div>
    </MainContent>
  )
}
