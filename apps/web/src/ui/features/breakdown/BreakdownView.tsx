import { createResource, For, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { loadBreakdown } from "../../../application/breakdown"
import type { BookId } from "../../../core/book/book"
import type { Decimal } from "../../../core/decimal/decimal"
import { DIMENSIONS, isDimension, totalOf, type Dimension, type Group } from "../../../core/report/breakdown"
import { useApp } from "../../context"
import { Select } from "../../primitives/select"
import { EmptyState, Loaded } from "../../primitives/states"
import { ToggleGroup, ToggleGroupItem } from "../../primitives/toggle-group"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { DIMENSION_NAMES, groupName } from "../../wording/breakdown"
import { formatSignedYen, toneOf } from "../../wording/numbers"
import { periodsOn, type Period } from "./periods"
import { ViewHeader } from "../shell/ViewHeader"

const TONES = { positive: "text-positive", negative: "text-negative", neutral: "text-text-primary" } as const

function Yen(props: { readonly value: Decimal }): JSX.Element {
  return <span class={`tabular-nums ${TONES[toneOf(props.value)]}`}>{formatSignedYen(props.value)}</span>
}

/**
 * One group in two lines, so that a long name and its figures both fit a
 * phone: what the group is, then what its plays made and what they were
 * worth.
 */
export function GroupRow(props: { readonly name: string; readonly group: Group; readonly strong: boolean }): JSX.Element {
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
          <Yen value={props.group.theoretical} />
        </span>
      </div>
    </li>
  )
}

/**
 * A book's results by where they came from: its plays grouped by machine,
 * parlor, day of the week, game, maker, year, month or day, each group with
 * what its plays made and were worth. Which grouping and which period are
 * the address's. hledger does the grouping and the sums; this lays out what
 * it answers.
 */
export function BreakdownView(props: { readonly place: Place; readonly bookId: BookId; readonly by: Dimension; readonly query: string }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const periods = (): readonly Period[] => periodsOn(app.services.businessDay())
  const chosenPeriod = (): Period | undefined => periods().find((period) => period.query === props.query)
  const [groups] = createResource(
    () => ({ bookId: props.bookId, by: props.by, query: props.query, revision: app.revision() }),
    (source) => loadBreakdown(app.services.session, source.bookId, source.by, source.query),
  )
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
            <ToggleGroup
              value={chosenPeriod()?.id ?? null}
              onChange={(id: string | null) => {
                const period = periods().find((candidate) => candidate.id === id)
                if (period !== undefined) moves.go(props.place, period.query)
              }}
              aria-label="期間"
            >
              {periods().map((period) => (
                <ToggleGroupItem value={period.id}>{period.label}</ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <Loaded outcome={groups()}>
            {(found) => (
              <Show when={found.length > 0} fallback={<EmptyState title="この期間の稼働はありません" />}>
                <ul class="flex flex-col gap-1">
                  <GroupRow name="合計" group={totalOf(found)} strong />
                  <For each={found}>{(group) => <GroupRow name={groupName(props.by, group.key)} group={group} strong={false} />}</For>
                </ul>
              </Show>
            )}
          </Loaded>
        </div>
      </div>
    </MainContent>
  )
}
