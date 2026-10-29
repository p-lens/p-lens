import { createMemo, createResource, createSignal, For, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { loadDaysAndWhole, type DaysAndWhole } from "../../../application/breakdown"
import { recordDayResults } from "../../../application/day-results"
import type { ApplicationError, Outcome } from "../../../application/errors"
import type { BookId } from "../../../core/book/book"
import { monthOf, type IsoDate, type IsoMonth } from "../../../core/calendar/calendar"
import type { Decimal } from "../../../core/decimal/decimal"
import type { Group } from "../../../core/report/breakdown"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { createNudge, redText } from "../../primitives/nudge"
import { TextField } from "../../primitives/text-field"
import { toast } from "../../primitives/toast"
import { ToggleGroup, ToggleGroupItem } from "../../primitives/toggle-group"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { describeError } from "../../wording/errors"
import { toneOf } from "../../wording/numbers"
import { ViewHeader } from "../shell/ViewHeader"
import { dayAfter, enteredOf, enteredTotal, typedResult, type Sign, type Typed } from "./day-entry"
import { FITTED_SIZE } from "./fit"
import { EarlierIcon, LaterIcon } from "./icons"
import { byDay, monthAfter, monthBefore, monthQuery, weeksOf, type Cell } from "./month"
import { cellResult, DAY_ENTRY, dayNumber, dayTitle, enteredText, enteredToast, monthTitle, NOT_A_SUM, WEEKDAYS } from "./wording"
import { seal } from "../../../mummer"

const TONES = { positive: "text-positive", negative: "text-negative", neutral: "text-text-secondary" } as const

const CELL = "flex min-h-[3.75rem] min-w-0 flex-col gap-0.5 rounded-[3px] px-0.5 py-1 text-left sm:px-1"

/** Where writing the days typed stands: being typed, being written, or refused with why. */
type Writing = { readonly type: "typing" } | { readonly type: "writing" } | { readonly type: "failed"; readonly error: ApplicationError }

const NOTHING_TYPED: Typed = { sign: "loss", amount: "" }

/** The days the book already has in the month: none while they are awaited or could not be read. */
const keptDaysIn = (answer: Outcome<DaysAndWhole> | undefined): readonly Group[] => (answer?.ok === true ? answer.value.days : [])

/**
 * One day of the month as it is typed: its number, what the book already
 * has for it, faint, so a day is not typed twice, and what is typed for it,
 * in the colour of the way it went. The day being typed wears a ring, and
 * a day whose sum is no whole yen is red.
 */
function Day(props: { readonly day: IsoDate; readonly kept: Decimal | undefined; readonly typed: Typed | undefined; readonly chosen: boolean; readonly onChoose: () => void }): JSX.Element {
  const read = () => (props.typed === undefined ? undefined : typedResult(props.typed))
  const figure = (value: Decimal, faint: boolean): JSX.Element => (
    <span
      class={`block whitespace-nowrap text-right font-figures leading-tight tracking-[-0.02em] tabular-nums ${faint ? "text-text-muted" : `font-bold ${TONES[toneOf(seal.tally(value))]}`}`}
      style={{ "font-size": FITTED_SIZE.book(cellResult(value)) }}
    >
      {cellResult(value)}
    </span>
  )
  return (
    <button
      type="button"
      class={`${CELL} bg-surface-1 hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-focus-ring`}
      classList={{ "outline outline-2 -outline-offset-2 outline-focus-ring": props.chosen, "bg-negative/10": read()?.ok === false }}
      aria-label={dayTitle(props.day)}
      aria-pressed={props.chosen}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => props.onChoose()}
    >
      <span class="text-xs tabular-nums text-text-muted">{dayNumber(props.day)}</span>
      <span class="block w-full [container-type:inline-size]">
        <Show when={props.kept} keyed>
          {(kept) => figure(kept, true)}
        </Show>
        <Show when={((found) => (found?.ok === true ? found.value : undefined))(read())} keyed>
          {(typed) => figure(typed, false)}
        </Show>
      </span>
    </button>
  )
}

/**
 * A month's days' 収支 typed in at a time (まとめて入力), for a book whose
 * plays were kept somewhere with nothing to write them out, or by nobody:
 * a day of the calendar pressed is the day typed in the one field under
 * it, ＋ or − beside it, and 次の日 or Enter goes on to the next, into the
 * next month where the last day is passed. What the book already has for a
 * day stands faint in its cell. 記帳する writes every day typed that came
 * to something, in whichever month, a tally a day in one commit, and goes
 * back to the calendar; pressed with a day's sum no whole yen, it goes to
 * that day, and with nothing typed, the count beside it turns red.
 */
export function DayEntryView(props: { readonly place: Place; readonly bookId: BookId }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const [month, setMonth] = createSignal<IsoMonth>(monthOf(app.services.businessDay()))
  const [chosen, setChosen] = createSignal<IsoDate>(app.services.businessDay())
  const [typed, setTyped] = createSignal<ReadonlyMap<IsoDate, Typed>>(new Map())
  const [sign, setSign] = createSignal<Sign>("loss")
  const [writing, setWriting] = createSignal<Writing>({ type: "typing" })
  const [kept] = createResource(
    () => ({ month: month(), revision: app.revision() }),
    (source) => loadDaysAndWhole(app.services.session, props.bookId, monthQuery(source.month), { chosen: undefined, offered: [] }),
  )
  const keptByDay = createMemo(() => byDay(keptDaysIn(kept())))
  const weeks = createMemo(() => weeksOf(month()))
  const entered = createMemo(() => enteredOf(typed()))
  const typedOn = (day: IsoDate): Typed => typed().get(day) ?? { ...NOTHING_TYPED, sign: sign() }
  const put = (day: IsoDate, next: Typed): void => {
    setTyped((before) => new Map([...before, [day, next]]))
  }
  const choose = (day: IsoDate): void => {
    setChosen(day)
    setMonth(monthOf(day))
    setSign(typedOn(day).amount === "" ? sign() : typedOn(day).sign)
  }
  const unread = (): boolean => typedOn(chosen()).amount !== "" && !typedResult(typedOn(chosen())).ok
  const nudge = createNudge()
  const write = async (): Promise<void> => {
    const days = entered().days
    const firstUnread = entered().unread.at(0)
    if (writing().type === "writing") return
    if (firstUnread !== undefined) return choose(firstUnread)
    if (days.length === 0) return nudge.nudge()
    setWriting({ type: "writing" })
    const written = await recordDayResults(app.services.session, props.bookId, days, app.services.newPlayId)
    if (!written.ok) {
      setWriting({ type: "failed", error: written.error })
      return
    }
    app.wrote()
    toast({ title: enteredToast(days.length) })
    moves.up(props.place)
  }
  return (
    <MainContent header={<ViewHeader place={props.place} title={DAY_ENTRY} framed="3xl" />}>
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
          </div>
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
                        {(day) => <Day day={day} kept={keptByDay().get(day)?.actual} typed={typed().get(day)} chosen={day === chosen()} onChoose={() => choose(day)} />}
                      </Show>
                    )}
                  </For>
                </div>
              )}
            </For>
          </div>
          <form
            class="flex flex-col gap-2 rounded-md bg-surface-1 p-3"
            onSubmit={(event) => {
              event.preventDefault()
              choose(dayAfter(chosen()))
            }}
          >
            <div class="flex flex-wrap items-end gap-2">
              <ToggleGroup
                value={sign()}
                onChange={(value: string | null) => {
                  if (value !== "gain" && value !== "loss") return
                  setSign(value)
                  if (typedOn(chosen()).amount !== "") put(chosen(), { ...typedOn(chosen()), sign: value })
                }}
                aria-label="勝ち負け"
              >
                <ToggleGroupItem value="gain">＋</ToggleGroupItem>
                <ToggleGroupItem value="loss">−</ToggleGroupItem>
              </ToggleGroup>
              <div class="min-w-0 flex-1 basis-32">
                <TextField
                  label={dayTitle(chosen())}
                  value={typedOn(chosen()).amount}
                  onChange={(amount) => put(chosen(), { sign: sign(), amount })}
                  inputMode="numeric"
                  suffix="円"
                  error={unread() ? NOT_A_SUM : undefined}
                />
              </div>
              <Button type="submit" variant="outline" size="small" class="shrink-0">
                次の日
              </Button>
            </div>
          </form>
          <Show when={((current) => (current.type === "failed" ? describeError(current.error) : undefined))(writing())} keyed>
            {(said) => (
              <p role="alert" class="rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-text-primary">
                {said}
              </p>
            )}
          </Show>
          <div class="flex items-center justify-end gap-3">
            <span class="min-w-0 text-sm tabular-nums" classList={{ ...redText(nudge.red()), "text-text-secondary": !nudge.red() }}>{enteredText(entered().days.length, enteredTotal(entered().days))}</span>
            <Button type="button" size="small" class="shrink-0" onClick={() => void write()}>
              記帳する
            </Button>
          </div>
        </div>
      </div>
    </MainContent>
  )
}
