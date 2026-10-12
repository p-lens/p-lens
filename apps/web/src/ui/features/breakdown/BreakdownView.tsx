import { createResource, For, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { loadBreakdown } from "../../../application/breakdown"
import { keepsTheoreticalValues } from "../../../application/theoretical"
import type { BookId } from "../../../core/book/book"
import { isZero, type Decimal } from "../../../core/decimal/decimal"
import { DIMENSIONS, isDimension, totalOf, type Dimension, type Group } from "../../../core/report/breakdown"
import { useApp } from "../../context"
import { Select } from "../../primitives/select"
import { EmptyState, Loaded } from "../../primitives/states"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { DIMENSION_NAMES, groupName, inferredShareText, NOT_TALLIED } from "../../wording/breakdown"
import { formatSignedYen, formatTheoreticalYen, toneOf } from "../../wording/numbers"
import { PeriodPicker } from "../period/PeriodPicker"
import { queryFor } from "../period/periods"
import { ViewHeader } from "../shell/ViewHeader"

const TONES = { positive: "text-positive", negative: "text-negative", neutral: "text-text-primary" } as const

function Yen(props: { readonly value: Decimal }): JSX.Element {
  return <span class={`tabular-nums ${TONES[toneOf(props.value)]}`}>{formatSignedYen(props.value)}</span>
}

/**
 * One group in two lines, so that a long name and its figures both fit a
 * phone: what the group is, then what its plays made and what they were
 * worth — or, in a book with no theoretical value written in it, that
 * there is none to sum — and, where part of that worth was inferred, how
 * much, so a figure nobody measured is not taken for one somebody did.
 */
export function GroupRow(props: { readonly name: string; readonly group: Group; readonly strong: boolean; readonly theoreticalKept: boolean }): JSX.Element {
  return (
    <li class="flex flex-col gap-0.5 rounded-md px-3 py-2" classList={{ "bg-surface-1": !props.strong, "border border-border": props.strong }}>
      <span class="min-w-0 break-words text-sm" classList={{ "font-semibold text-text-primary": props.strong, "text-text-primary": !props.strong }}>
        {props.name}
      </span>
      <div class="flex flex-wrap gap-x-4 gap-y-0.5 text-sm">
        <span class="flex items-baseline gap-1.5">
          <span class="text-xs text-text-muted">実収支</span>
          <Yen value={props.group.actual} />
        </span>
        <span class="flex items-baseline gap-1.5">
          <span class="text-xs text-text-muted">期待値</span>
          <Show when={props.theoreticalKept} fallback={<span class="text-text-muted">{NOT_TALLIED}</span>}>
            <span class="tabular-nums text-text-primary">{formatTheoreticalYen(props.group.theoretical)}</span>
          </Show>
        </span>
        <Show when={props.theoreticalKept && !isZero(props.group.inferred)}>
          <span class="text-xs tabular-nums text-text-muted">{inferredShareText(props.group.inferred)}</span>
        </Show>
      </div>
    </li>
  )
}

/**
 * A book's results by where they came from: its plays grouped by machine,
 * parlor, day of the week, game, year, month or day, each group with
 * what its plays made and were worth. Which grouping and which period are
 * the address's. hledger does the grouping and the sums; this lays out what
 * it answers.
 */
export function BreakdownView(props: { readonly place: Place; readonly bookId: BookId; readonly by: Dimension; readonly query: string }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const [groups] = createResource(
    () => ({ bookId: props.bookId, by: props.by, query: props.query, revision: app.revision() }),
    (source) => loadBreakdown(app.services.session, source.bookId, source.by, queryFor(source.by, source.query)),
  )
  const [kept] = createResource(() => ({ bookId: props.bookId, revision: app.revision() }), (source) => keepsTheoreticalValues(app.services.session, source.bookId))
  /** Whether the book keeps theoretical values: taken to until hledger says it does not, so a book that does never flashes otherwise. */
  const theoreticalKept = (): boolean => ((answer) => answer?.ok !== true || answer.value)(kept())
  return (
    <MainContent header={<ViewHeader place={props.place} title="集計" />}>
      <div class="max-w-5xl">
        <div class="flex flex-col gap-4 p-4">
          <div class="flex flex-wrap items-end gap-3">
            <div class="w-48">
              <Select
                label="切り口"
                options={DIMENSIONS.map((dimension) => ({ value: dimension, label: DIMENSION_NAMES[dimension] }))}
                value={props.by}
                onChange={(by) => {
                  if (isDimension(by)) moves.go({ kind: "book-breakdown", bookId: props.bookId, by }, props.query)
                }}
                placeholder="切り口を選ぶ"
              />
            </div>
            <PeriodPicker by={props.by} query={props.query} today={app.services.businessDay()} onTyped={(query) => moves.refine(props.place, query)} onPressed={(query) => moves.go(props.place, query)} />
          </div>
          <Loaded outcome={groups()}>
            {(found) => (
              <Show when={found.length > 0} fallback={<EmptyState title="この期間の稼働はありません" />}>
                <ul class="flex flex-col gap-1">
                  <GroupRow name="合計" group={totalOf(found)} strong theoreticalKept={theoreticalKept()} />
                  <For each={found}>{(group) => <GroupRow name={groupName(props.by, group.key)} group={group} strong={false} theoreticalKept={theoreticalKept()} />}</For>
                </ul>
              </Show>
            )}
          </Loaded>
        </div>
      </div>
    </MainContent>
  )
}
