import { createMemo, createResource, createSignal, For, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { loadBreakdown } from "../../../application/breakdown"
import type { Outcome } from "../../../application/errors"
import { keepsTheoreticalValues } from "../../../application/theoretical"
import type { BookId } from "../../../core/book/book"
import { monthOf, type IsoDate, type IsoMonth } from "../../../core/calendar/calendar"
import { totalOf, type Group } from "../../../core/report/breakdown"
import { rangeTerm } from "../../../hledger/query/terms"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { NOT_TALLIED } from "../../wording/breakdown"
import { describeError } from "../../wording/errors"
import { toneOf } from "../../wording/numbers"
import { Figure } from "../plays/Figure"
import { ViewHeader } from "../shell/ViewHeader"
import { EarlierIcon, LaterIcon } from "./icons"
import { byDay, monthAfter, monthBefore, monthQuery, weeksOf, type Cell } from "./month"
import { fittedSize } from "./fit"
import { cellResult, dayNumber, daySays, monthTitle, RESULT_CALENDAR, WEEKDAYS } from "./wording"

const TONES = { positive: "text-positive", negative: "text-negative", neutral: "text-text-secondary" } as const

/** What the calendar asks hledger about: a month of a book, as the book now stands. */
interface Asked {
  readonly bookId: BookId
  readonly month: IsoMonth
  readonly revision: number
}

/** The groups an answer holds: none while it is awaited, and none where it failed, which is said apart. */
const groupsIn = (outcome: Outcome<readonly Group[]> | undefined): readonly Group[] => (outcome?.ok === true ? outcome.value : [])

const CELL = "flex min-h-14 min-w-0 flex-col gap-0.5 rounded-[3px] px-0.5 py-1 text-left sm:px-1"

/**
 * One day of the month: its number, and what its plays made where it had
 * any. A day with plays is pressed to see them; a day without is only its
 * number. The business day it now is wears a ring. The result is written
 * as small as its cell asks (`fittedSize`), so a great win is in smaller
 * figures and never cut short.
 */
function Day(props: { readonly day: IsoDate; readonly figures: Group | undefined; readonly today: boolean; readonly onOpen: () => void }): JSX.Element {
  const number = (): JSX.Element => <span class="text-xs tabular-nums text-text-muted">{dayNumber(props.day)}</span>
  return (
    <Show
      when={props.figures}
      keyed
      fallback={
        <div class={`${CELL} bg-surface-1`} classList={{ "outline outline-2 -outline-offset-2 outline-focus-ring": props.today }} aria-label={daySays(props.day, undefined)}>
          {number()}
        </div>
      }
    >
      {(figures) => (
        <button
          type="button"
          class={`${CELL} bg-surface-2 hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-focus-ring`}
          classList={{ "outline outline-2 -outline-offset-2 outline-focus-ring": props.today }}
          aria-label={daySays(props.day, figures.actual)}
          onClick={() => props.onOpen()}
        >
          {number()}
          <span class="block w-full [container-type:inline-size]">
            <span class={`block whitespace-nowrap text-right font-bold leading-tight tabular-nums ${TONES[toneOf(figures.actual)]}`} style={{ "font-size": fittedSize(cellResult(figures.actual)) }}>
              {cellResult(figures.actual)}
            </span>
          </span>
        </button>
      )}
    </Show>
  )
}

/**
 * A book's results a month at a time, as a calendar: what the month's
 * plays made and were worth above, and under it each day with what its
 * plays made. The month shown is this screen's own and is in no address:
 * it opens on the month of the business day, and a day pressed goes to
 * that day's plays. hledger does every sum: the days are its breakdown by
 * day and the month's two figures its breakdown by month, both asked for
 * the one month, and nothing here adds a day to another.
 */
export function ResultCalendarView(props: { readonly place: Place; readonly bookId: BookId }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const [month, setMonth] = createSignal<IsoMonth>(monthOf(app.services.businessDay()))
  const asked = (): Asked => ({ bookId: props.bookId, month: month(), revision: app.revision() })
  const [days] = createResource(asked, (source) => loadBreakdown(app.services.session, source.bookId, "day", monthQuery(source.month)))
  const [whole] = createResource(asked, (source) => loadBreakdown(app.services.session, source.bookId, "month", monthQuery(source.month)))
  const [kept] = createResource(() => ({ bookId: props.bookId, revision: app.revision() }), (source) => keepsTheoreticalValues(app.services.session, source.bookId))
  /** Whether the book keeps theoretical values: taken to until hledger says it does not. */
  const theoreticalKept = (): boolean => ((answer) => answer?.ok !== true || answer.value)(kept())
  const figures = createMemo(() => byDay(groupsIn(days())))
  const total = createMemo(() => totalOf(groupsIn(whole())))
  const failure = (): string | undefined => [days(), whole()].flatMap((outcome) => (outcome?.ok === false ? [describeError(outcome.error)] : [])).at(0)
  const weeks = createMemo(() => weeksOf(month()))
  return (
    <MainContent header={<ViewHeader place={props.place} title={RESULT_CALENDAR} />}>
      <div class="max-w-3xl">
        <div class="flex flex-col gap-4 p-2 sm:p-4">
          <div class="flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon" onClick={() => setMonth(monthBefore(month()))}>
              <EarlierIcon label="前の月" />
            </Button>
            <h2 class="min-w-28 text-center text-base font-bold tabular-nums text-text-primary">{monthTitle(month())}</h2>
            <Button type="button" variant="ghost" size="icon" onClick={() => setMonth(monthAfter(month()))}>
              <LaterIcon label="次の月" />
            </Button>
            <div class="flex-1" />
            <Button type="button" variant="outline" size="small" onClick={() => setMonth(monthOf(app.services.businessDay()))}>
              今月
            </Button>
          </div>
          <dl class="grid grid-cols-2 gap-2">
            <Figure label="実収支" value={total().actual} kind="result" />
            <Figure label="期待値" value={total().theoretical} kind="result" instead={theoreticalKept() ? undefined : NOT_TALLIED} />
          </dl>
          <Show when={failure()} keyed>
            {(words) => (
              <p role="alert" class="rounded-md border border-negative/40 bg-negative/10 px-4 py-3 text-sm text-text-primary">
                {words}
              </p>
            )}
          </Show>
          <div class="flex flex-col gap-1">
            <div class="grid grid-cols-7 gap-1">
              <For each={WEEKDAYS}>{(weekday) => <span class="text-center text-xs font-bold text-text-muted">{weekday}</span>}</For>
            </div>
            <For each={weeks()}>
              {(week) => (
                <div class="grid grid-cols-7 gap-1">
                  <For each={week}>
                    {(cell: Cell) => (
                      <Show when={cell} keyed fallback={<div />}>
                        {(day) => (
                          <Day
                            day={day}
                            figures={figures().get(day)}
                            today={day === app.services.businessDay()}
                            onOpen={() => moves.go({ kind: "book-view", bookId: props.bookId, view: "plays" }, rangeTerm(day, day))}
                          />
                        )}
                      </Show>
                    )}
                  </For>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>
    </MainContent>
  )
}
