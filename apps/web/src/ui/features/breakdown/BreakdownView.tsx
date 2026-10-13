import { createResource, For, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { loadBreakdown } from "../../../application/breakdown"
import { loadRevaluation } from "../../../application/revaluation"
import { keepsTheoreticalValues } from "../../../application/theoretical"
import type { BookId } from "../../../core/book/book"
import { isZero, type Decimal } from "../../../core/decimal/decimal"
import { DIMENSIONS, isDimension, totalOf, type Dimension, type Group } from "../../../core/report/breakdown"
import type { Revaluation } from "../../../core/report/revaluation"
import { useApp } from "../../context"
import { Select } from "../../primitives/select"
import { EmptyState, Loaded } from "../../primitives/states"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { DIMENSION_NAMES, groupName, inferredShareText, NOT_TALLIED, REVALUATION, REVALUATION_NOTE } from "../../wording/breakdown"
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
 * 評価損益 under a breakdown, where there is any: what the period's
 * savings gained or lost by their rates changing, which is no play's
 * result and so stands apart from every group above it — and, where the
 * plays are grouped by parlor, each parlor's own. A rate seldom changes,
 * so in most periods there is none and nothing is shown.
 */
function RevaluationRow(props: { readonly revaluation: Revaluation; readonly byParlor: boolean }): JSX.Element {
  return (
    <section aria-label={REVALUATION} class="flex flex-col gap-1 rounded-md border border-border px-3 py-2">
      <div class="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-sm">
        <span class="font-semibold text-text-primary">{REVALUATION}</span>
        <Yen value={props.revaluation.total} />
      </div>
      <Show when={props.byParlor}>
        <ul class="flex flex-col gap-0.5">
          <For each={[...props.revaluation.byParlor]}>
            {([parlor, yen]) => (
              <li class="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-sm">
                <span class="min-w-0 break-words text-text-primary">{parlor}</span>
                <Yen value={yen} />
              </li>
            )}
          </For>
        </ul>
      </Show>
      <p class="text-xs text-text-muted">{REVALUATION_NOTE}</p>
    </section>
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
  const [revalued] = createResource(
    () => ({ bookId: props.bookId, by: props.by, query: props.query, revision: app.revision() }),
    (source) => loadRevaluation(app.services.session, source.bookId, queryFor(source.by, source.query)),
  )
  /** 評価損益 over the period, only where savings gained or lost any: none while it is asked, and none where it could not be read — the breakdown above it stands without it. */
  const revaluation = (): Revaluation | undefined => ((answer) => (answer?.ok === true && (!isZero(answer.value.total) || answer.value.byParlor.size > 0) ? answer.value : undefined))(revalued())
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
                  <For each={found}>{(group) => <GroupRow name={groupName(props.by, group.key, app.machineNames())} group={group} strong={false} theoreticalKept={theoreticalKept()} />}</For>
                </ul>
              </Show>
            )}
          </Loaded>
          <Show when={revaluation()} keyed>
            {(found) => <RevaluationRow revaluation={found} byParlor={props.by === "parlor"} />}
          </Show>
        </div>
      </div>
    </MainContent>
  )
}
