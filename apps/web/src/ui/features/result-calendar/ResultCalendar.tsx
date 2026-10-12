import { createMemo, For, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import type { Outcome } from "../../../application/errors"
import { monthOf, type IsoDate, type IsoMonth } from "../../../core/calendar/calendar"
import { totalOf, type Group } from "../../../core/report/breakdown"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import type { Place } from "../../navigation/place"
import { NOT_TALLIED } from "../../wording/breakdown"
import { describeError } from "../../wording/errors"
import { toneOf } from "../../wording/numbers"
import { Figure } from "../plays/Figure"
import { ViewHeader } from "../shell/ViewHeader"
import { EarlierIcon, LaterIcon } from "./icons"
import { byDay, monthAfter, monthBefore, weeksOf, type Cell } from "./month"
import { fittedSize } from "./fit"
import { cellResult, dayNumber, daySays, monthTitle, RESULT_CALENDAR, WEEKDAYS } from "./wording"

const TONES = { positive: "text-positive", negative: "text-negative", neutral: "text-text-secondary" } as const

/** The groups an answer holds: none while it is awaited, and none where it failed, which is said apart. */
const groupsIn = (outcome: Outcome<readonly Group[]> | undefined): readonly Group[] => (outcome?.ok === true ? outcome.value : [])

const CELL = "flex min-h-14 min-w-0 flex-col gap-0.5 rounded-[3px] px-0.5 py-1 text-left sm:px-1"

/**
 * One day of the month: its number, and what its plays made where it had
 * any. A day with plays is pressed to see them; a day without is only its
 * number. The business day it now is wears a ring. The result is written
 * as small as its cell asks (`fittedSize`), in one size up to six digits,
 * so only a great win is in smaller figures, and none is cut short.
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
 * Results a month at a time, as a calendar: what the month's plays made
 * and were worth above, and under it each day with what its plays made.
 * Whose results they are — a book's, or several books' together — is the
 * caller's: it holds the month, asks for the month's days and for the
 * month as a whole, and says where a day pressed goes. Nothing here adds
 * a day to another. What the caller puts inside stands under the
 * calendar.
 */
export function ResultCalendar(props: {
  readonly place: Place
  readonly month: IsoMonth
  readonly onMonth: (month: IsoMonth) => void
  readonly days: Outcome<readonly Group[]> | undefined
  readonly whole: Outcome<readonly Group[]> | undefined
  readonly theoreticalKept: boolean
  readonly onOpen: (day: IsoDate) => void
  readonly children?: JSX.Element
}): JSX.Element {
  const app = useApp()
  const figures = createMemo(() => byDay(groupsIn(props.days)))
  const total = createMemo(() => totalOf(groupsIn(props.whole)))
  const failure = (): string | undefined => [props.days, props.whole].flatMap((outcome) => (outcome?.ok === false ? [describeError(outcome.error)] : [])).at(0)
  const weeks = createMemo(() => weeksOf(props.month))
  return (
    <MainContent header={<ViewHeader place={props.place} title={RESULT_CALENDAR} />}>
      <div class="max-w-3xl">
        <div class="flex flex-col gap-4 p-2 sm:p-4">
          <div class="flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon" onClick={() => props.onMonth(monthBefore(props.month))}>
              <EarlierIcon label="前の月" />
            </Button>
            <h2 class="min-w-28 text-center text-base font-bold tabular-nums text-text-primary">{monthTitle(props.month)}</h2>
            <Button type="button" variant="ghost" size="icon" onClick={() => props.onMonth(monthAfter(props.month))}>
              <LaterIcon label="次の月" />
            </Button>
            <div class="flex-1" />
            <Button type="button" variant="outline" size="small" onClick={() => props.onMonth(monthOf(app.services.businessDay()))}>
              今月
            </Button>
          </div>
          <dl class="grid grid-cols-2 gap-2">
            <Figure label="実収支" value={total().actual} kind="actual" />
            <Figure label="期待値" value={total().theoretical} kind="theoretical" instead={props.theoreticalKept ? undefined : NOT_TALLIED} />
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
                        {(day) => <Day day={day} figures={figures().get(day)} today={day === app.services.businessDay()} onOpen={() => props.onOpen(day)} />}
                      </Show>
                    )}
                  </For>
                </div>
              )}
            </For>
          </div>
          {props.children}
        </div>
      </div>
    </MainContent>
  )
}
