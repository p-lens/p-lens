import { createResource, For, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { loadBreakdown } from "../../../application/breakdown"
import { loadOverall } from "../../../application/overall"
import { loadOtherGains } from "../../../application/other-gains"
import { keepsTheoreticalValues } from "../../../application/theoretical"
import type { BookId } from "../../../core/book/book"
import { isZero, type Decimal } from "../../../core/decimal/decimal"
import { DIMENSIONS, isBreakdownBy, OVERALL, totalOf, type BreakdownBy, type Dimension, type Group } from "../../../core/report/breakdown"
import { isNarrowed, matchesNothing, type Narrowing } from "../../../core/report/narrowing"
import { hasOtherGains, type OtherGains } from "../../../core/report/other-gains"
import { useApp } from "../../context"
import { ChevronRightIcon } from "../../primitives/icons"
import { Select } from "../../primitives/select"
import { EmptyState, Loaded, Refreshing } from "../../primitives/states"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { DIMENSION_NAMES, GROUP_FIGURES, OVERALL_NAME, groupName, NOT_TALLIED, NOTHING_NARROWED, playTimeText, winsAndLossesText } from "../../wording/breakdown"
import { formatCount, formatSignedYen, formatTheoreticalYen, formatYen, toneOf } from "../../wording/numbers"
import { PeriodPicker } from "../period/PeriodPicker"
import { queryFor } from "../period/periods"
import { ViewHeader } from "../shell/ViewHeader"
import { drilledFrom } from "./drill"
import { bookOffers, NarrowingFilters } from "./NarrowingFilters"
import { OtherGainsSection } from "./OtherGainsSection"
import { OverallCard } from "./OverallCard"
import { shownOrder } from "./shown-order"
import { seal } from "../../../mummer"

const TONES = { positive: "text-positive", negative: "text-negative", neutral: "text-text-primary" } as const

function Yen(props: { readonly value: Decimal }): JSX.Element {
  return <span class={`tabular-nums ${TONES[toneOf(seal.tally(props.value))]}`}>{formatSignedYen(seal.tally(props.value))}</span>
}

/** One figure of a group's card: its name, then the figure set to the right of its column, on one line whatever it says. */
function GroupFigure(props: { readonly label: string; readonly spaced?: boolean; readonly children: JSX.Element }): JSX.Element {
  return (
    <>
      <dt class="whitespace-nowrap text-xs text-text-muted" classList={{ "pl-5": props.spaced === true }}>
        {props.label}
      </dt>
      <dd class="min-w-0 whitespace-nowrap text-right tabular-nums text-text-primary">{props.children}</dd>
    </>
  )
}

/**
 * One group in a card, so that a long name and its figures both fit a
 * phone: what the group is, then its figures in three rows of two, each
 * figure with its name, in the same places on every card whatever they
 * say — how many tallies and how they went, how long they were played for
 * (`--` where none kept it) and what they were worth (or, in a book with
 * no theoretical value written in it, that there is none to sum) on the
 * left, its column a little the wider, as what it says runs the longer;
 * what they made, took in and gave back on the right. A group that
 * can be looked into is pressed as a whole, an arrow head at its end
 * (`onOpen`).
 */
export function GroupRow(props: { readonly name: string; readonly group: Group; readonly strong: boolean; readonly theoreticalKept: boolean; readonly onOpen?: (() => void) | undefined }): JSX.Element {
  return (
    <li class="rounded-md" classList={{ "bg-surface-1": !props.strong, "border border-border": props.strong }}>
      <Show when={props.onOpen} keyed fallback={<GroupFigures {...props} />}>
        {(open) => (
          <button type="button" onClick={() => open()} class="flex w-full items-center gap-2 rounded-md text-left transition-colors hover:bg-surface-3/60">
            <GroupFigures {...props} />
            <span class="mr-2 shrink-0 text-text-muted [&_svg]:size-4">
              <ChevronRightIcon />
            </span>
          </button>
        )}
      </Show>
    </li>
  )
}

/** A group's name over its figures, as `GroupRow` lays them out. */
function GroupFigures(props: { readonly name: string; readonly group: Group; readonly strong: boolean; readonly theoreticalKept: boolean }): JSX.Element {
  const yen = (value: Decimal | undefined): string => (value === undefined ? "--" : formatYen(seal.tally(value)))
  return (
    <div class="flex min-w-0 flex-1 flex-col gap-1 px-3 py-2">
      <span class="min-w-0 break-words text-sm" classList={{ "font-semibold text-text-primary": props.strong, "text-text-primary": !props.strong }}>
        {props.name}
      </span>
      <dl class="grid grid-cols-[auto_minmax(0,7fr)_auto_minmax(0,6fr)] items-baseline gap-x-1.5 gap-y-0.5 text-sm">
        <GroupFigure label={GROUP_FIGURES.plays}>
          <Show when={props.group.tallies} keyed fallback="--">
            {(tallies) => (
              <>
                {formatCount(tallies.plays)}
                <span class="text-xs text-text-muted">{winsAndLossesText(tallies)}</span>
              </>
            )}
          </Show>
        </GroupFigure>
        <GroupFigure label={GROUP_FIGURES.actual} spaced>
          <Yen value={props.group.actual} />
        </GroupFigure>
        <GroupFigure label={GROUP_FIGURES.time}>{isZero(props.group.seconds) ? "--" : playTimeText(props.group.seconds)}</GroupFigure>
        <GroupFigure label={GROUP_FIGURES.spent} spaced>
          {yen(props.group.tallies?.spent)}
        </GroupFigure>
        <GroupFigure label={GROUP_FIGURES.theoretical}>
          <Show when={props.theoreticalKept} fallback={<span class="text-text-muted">{NOT_TALLIED}</span>}>
            {formatTheoreticalYen(seal.tally(props.group.theoretical))}
          </Show>
        </GroupFigure>
        <GroupFigure label={GROUP_FIGURES.returned} spaced>
          {yen(props.group.tallies?.returned)}
        </GroupFigure>
      </dl>
    </div>
  )
}

/** The ways a breakdown is offered: 総合 first, then each grouping. */
export const BREAKDOWN_OPTIONS = [{ value: OVERALL, label: OVERALL_NAME }, ...DIMENSIONS.map((dimension) => ({ value: dimension, label: DIMENSION_NAMES[dimension] }))]

/**
 * A book's results for a period: taken as one, 総合 — what it opens on —
 * or by where they came from, its tallies grouped by machine, parlor, day
 * of the week, game, year, month or day, each group with what its tallies
 * made and were worth. Which and which period are the address's, and so
 * are the games, parlors and machines it is narrowed to: a group of those,
 * a year or a month is pressed to look into it, the breakdown narrowed to
 * it or over its days. hledger does the grouping and the sums; this lays
 * out what it answers. その他損益 is no tally's, and is left out while the
 * breakdown is narrowed.
 */
export function BreakdownView(props: { readonly place: Place; readonly bookId: BookId; readonly by: BreakdownBy; readonly narrowing: Narrowing; readonly query: string }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  /** The dimension the tallies are grouped by; none where they are taken as one. */
  const grouping = (): Dimension | undefined => (props.by === OVERALL ? undefined : props.by)
  const [groups] = createResource(
    () => ((by) => (by === undefined || matchesNothing(props.narrowing) ? undefined : { bookId: props.bookId, by, narrowing: props.narrowing, query: props.query, revision: app.revision() }))(grouping()),
    (source) => loadBreakdown(app.services.session, source.bookId, source.by, queryFor(source.by, source.query), source.narrowing, "tallied"),
  )
  const [overall] = createResource(
    () => (props.by === OVERALL && !matchesNothing(props.narrowing) ? { bookId: props.bookId, narrowing: props.narrowing, query: props.query, revision: app.revision() } : undefined),
    (source) => loadOverall(app.services.session, source.bookId, source.query, source.narrowing),
  )
  const [othered] = createResource(
    () => (props.by === OVERALL && !isNarrowed(props.narrowing) ? { bookId: props.bookId, query: props.query, revision: app.revision() } : undefined),
    (source) => loadOtherGains(app.services.session, source.bookId, source.query),
  )
  /** その他損益 over the period, under 総合 alone and only where there is any: none while it is asked, and none where it could not be read — 総合 stands without it. */
  const otherGains = (): OtherGains | undefined => ((answer) => (props.by === OVERALL && !isNarrowed(props.narrowing) && answer?.ok === true && hasOtherGains(answer.value) ? answer.value : undefined))(othered())
  const [kept] = createResource(() => ({ bookId: props.bookId, revision: app.revision() }), (source) => keepsTheoreticalValues(app.services.session, source.bookId))
  /** Whether the book keeps theoretical values: taken to until hledger says it does not, so a book that does never flashes otherwise. */
  const theoreticalKept = (): boolean => ((answer) => answer?.ok !== true || answer.value)(kept())
  const placed = (by: BreakdownBy, narrowing: Narrowing): Place => ({ kind: "book-breakdown", bookId: props.bookId, by, narrowing })
  const opener = (dimension: Dimension, key: string): (() => void) | undefined =>
    ((drilled) => (drilled === undefined ? undefined : () => moves.go(placed(drilled.by, drilled.narrowing), drilled.query)))(drilledFrom(dimension, key, props.narrowing, props.query))
  return (
    <MainContent header={<ViewHeader place={props.place} title="集計" />}>
      <div class="max-w-5xl">
        <div class="flex flex-col gap-4 p-4">
          <div class="flex flex-wrap items-end gap-3">
            <div class="w-[8.5rem]">
              <Select
                label="切り口"
                options={BREAKDOWN_OPTIONS}
                value={props.by}
                onChange={(by) => {
                  if (isBreakdownBy(by)) moves.go(placed(by, props.narrowing), props.query)
                }}
                placeholder="切り口を選ぶ"
              />
            </div>
            <PeriodPicker by={props.by} query={props.query} today={app.services.businessDay()} onTyped={(query) => moves.refine(props.place, query)} onPressed={(query) => moves.go(props.place, query)} />
          </div>
          <NarrowingFilters scope={props.bookId} offersOf={bookOffers(app.services.session, props.bookId)} query={props.query} narrowing={props.narrowing} onNarrowed={(narrowing) => moves.refine(placed(props.by, narrowing), props.query)} />
          <Show when={matchesNothing(props.narrowing)}>
            <EmptyState title={NOTHING_NARROWED} />
          </Show>
          <Show when={props.by === OVERALL && !matchesNothing(props.narrowing)}>
            <Refreshing loading={overall.state === "refreshing"}>
              <Loaded outcome={overall()}>
                {(found) => (
                  <Show when={found.plays > 0} fallback={<EmptyState title="この期間の収支はありません" />}>
                    <OverallCard overall={found} theoreticalKept={theoreticalKept()} />
                  </Show>
                )}
              </Loaded>
            </Refreshing>
          </Show>
          <Show when={matchesNothing(props.narrowing) ? undefined : grouping()} keyed>
            {(dimension) => (
              <Refreshing loading={groups.state === "refreshing"}>
                <Loaded outcome={groups()}>
                  {(found) => (
                    <Show when={found.length > 0} fallback={<EmptyState title="この期間の収支はありません" />}>
                      <ul class="flex flex-col gap-1">
                        <GroupRow name="合計" group={totalOf(found)} strong theoreticalKept={theoreticalKept()} />
                        <For each={shownOrder(found, dimension)}>
                          {(group) => <GroupRow name={groupName(dimension, group.key, app.machineNames())} group={group} strong={false} theoreticalKept={theoreticalKept()} onOpen={opener(dimension, group.key)} />}
                        </For>
                      </ul>
                    </Show>
                  )}
                </Loaded>
              </Refreshing>
            )}
          </Show>
          <Show when={otherGains()} keyed>
            {(found) => <OtherGainsSection gains={found} />}
          </Show>
        </div>
      </div>
    </MainContent>
  )
}
