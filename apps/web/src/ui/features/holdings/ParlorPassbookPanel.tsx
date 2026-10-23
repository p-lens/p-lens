import { AuxPanel } from "solid-gathering-shell"
import { createResource, createSignal, For, Show, type JSX } from "solid-js"

import { loadRecordingContext } from "../../../application/record-tally"
import { loadParlorPassbook, recordParlorForfeiture, type ParlorPassbookShown } from "../../../application/savings"
import type { BookId } from "../../../core/book/book"
import { parseIsoDate, type IsoDate } from "../../../core/calendar/calendar"
import { isZero, rounded, type Decimal } from "../../../core/decimal/decimal"
import type { Parlor } from "../../../core/parlor/parlor"
import type { ParlorPassbookDay, PoolDay } from "../../../core/report/parlor-passbook"
import { useApp } from "../../context"
import { Button, SWITCHED_ON } from "../../primitives/button"
import { cn } from "../../primitives/cn"
import { ConfirmDialog } from "../../primitives/dialog"
import { CloseIcon } from "../../primitives/icons"
import { TextField } from "../../primitives/text-field"
import { toast } from "../../primitives/toast"
import { EmptyState, Loaded } from "../../primitives/states"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { formatDayOfYear } from "../../wording/dates"
import { describeError } from "../../wording/errors"
import { formatRate, formatTokens, formatYen } from "../../wording/numbers"
import { yearOf } from "../period/periods"
import { COLUMNS, Earlier, Headings, Lines, ROW_BUTTON, toggledDay, type OpenDays } from "./PassbookPanel"
import { seal } from "../../../mummer"
import { parlorNameText } from "../../wording/parlor"
import { Withheld } from "../mummer/Withheld"

/** Yen a token had no rate for: dashes in the figure's shape. */
const UNVALUED = "¥-,---"

/** Yen in a column, rounded half up to whole yen: muted where it comes to none, dashes where some token had no rate. */
function Yen(props: { readonly value: Decimal | undefined; readonly strong?: boolean }): JSX.Element {
  return (
    <span
      class="text-right text-xs tabular-nums"
      classList={{ "text-text-muted": props.value === undefined || isZero(rounded(props.value, 0)), "text-text-primary": props.value !== undefined && !isZero(rounded(props.value, 0)), "font-semibold": props.strong === true }}
    >
      {props.value === undefined ? UNVALUED : formatYen(seal.savings(props.value))}
    </span>
  )
}

/** One pool's part of a parlor's day: its tokens out and in, the rate it was set to that day, and what moved them. */
function PoolPart(props: { readonly part: PoolDay }): JSX.Element {
  return (
    <li class="flex flex-col gap-1">
      <div class={`${COLUMNS} text-xs`}>
        <span class="font-semibold text-text-secondary">{props.part.pool.tier}</span>
        <span class="text-right tabular-nums text-text-secondary">{formatTokens(seal.savings(props.part.day.withdrawn), props.part.pool.kind)}</span>
        <span class="text-right tabular-nums text-text-secondary">{formatTokens(seal.savings(props.part.day.deposited), props.part.pool.kind)}</span>
        <span class="text-right tabular-nums text-text-muted">{formatTokens(seal.savings(props.part.day.balance), props.part.pool.kind)}</span>
      </div>
      <Show when={props.part.day.rateSet} keyed>
        {(set) => (
          <p class="text-xs text-text-muted">
            交換率 {set.before === undefined ? "" : `${formatRate(set.before)}円 → `}
            {formatRate(set.rate)}円
          </p>
        )}
      </Show>
      <Show when={props.part.day.lines.length > 0}>
        <Lines lines={props.part.day.lines} kind={props.part.pool.kind} />
      </Show>
    </li>
  )
}

/** One day of a parlor's passbook: a row in yen that opens, when pressed, onto each pool's tokens that day and what moved them. */
function Day(props: { readonly day: ParlorPassbookDay; readonly yearShown: boolean; readonly open: boolean; readonly onToggle: () => void }): JSX.Element {
  return (
    <li class="flex flex-col gap-1 border-b border-border py-2">
      <Show when={props.yearShown}>
        <span class="text-xs font-bold text-text-muted">{props.day.date.slice(0, 4)}年</span>
      </Show>
      <button type="button" aria-expanded={props.open} class={`${COLUMNS} rounded text-left hover:bg-surface-3`} onClick={() => props.onToggle()}>
        <span class="min-w-0 truncate text-sm text-text-primary">{formatDayOfYear(props.day.date)}</span>
        <Yen value={props.day.withdrawn} />
        <Yen value={props.day.deposited} />
        <Yen value={props.day.balance} strong />
      </button>
      <Show when={props.open}>
        <ul class="flex flex-col gap-2 pt-1">
          <For each={props.day.pools}>{(part) => <PoolPart part={part} />}</For>
        </ul>
      </Show>
    </li>
  )
}

/**
 * Every pool of one parlor as one passbook, beside the book's savings: a
 * row for each day any of them moved or had its rate set, newest first,
 * in whole yen, rounded half up — what went out and came in at the day's rate, and
 * what was held at the day's end at the rate then — and pressed, each
 * pool's tokens that day, machine by machine. It opens on this year,
 * what was held before it under the last row, and goes back a year that
 * moved at a time. Tokens of different pools are never added: only yen,
 * and by hledger. Pressed, the top bar's 遊技を除く leaves the plays'
 * tallies out, so what moved the savings otherwise reads alone. At its
 * foot, where the book may be written, 失効 records everything the parlor
 * holds as forfeited, once the person says yes and on the day they say,
 * today unless they say another.
 */
export function ParlorPassbookPanel(props: { readonly place: Place; readonly bookId: BookId; readonly parlorName: string }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const [from, setFrom] = createSignal<IsoDate | undefined>(yearOf(app.services.businessDay()).from)
  const [openDays, setOpenDays] = createSignal<OpenDays>(new Set())
  const [shown, setShown] = createSignal<ParlorPassbookShown>("every")
  const [days] = createResource(
    () => ({ bookId: props.bookId, parlorName: props.parlorName, from: from(), shown: shown(), revision: app.revision() }),
    (source) => loadParlorPassbook(app.services.session, source.bookId, source.parlorName, source.from, source.shown),
  )
  const [context] = createResource(
    () => ({ bookId: props.bookId, revision: app.revision() }),
    (source) => loadRecordingContext(app.services.session, source.bookId, app.services.member),
  )
  /** The parlor as the book keeps it, where the book may be written: what recording a forfeiture needs. */
  const keptParlor = () => ((found) => (found?.ok === true && found.value.canWrite ? found.value.parlors.find((parlor) => parlor.name === props.parlorName) : undefined))(context())
  /** Whether the person is being asked if everything the parlor holds is forfeited. */
  const [forfeiting, setForfeiting] = createSignal(false)
  /** The day it is forfeited on, as typed. */
  const [forfeitedOn, setForfeitedOn] = createSignal<string>(app.services.businessDay())
  const [forfeitDayMissed, setForfeitDayMissed] = createSignal(false)
  const askForfeiture = (): void => {
    setForfeitedOn(app.services.businessDay())
    setForfeitDayMissed(false)
    setForfeiting(true)
  }
  const forfeit = async (parlor: Parlor): Promise<void> => {
    const on = parseIsoDate(forfeitedOn())
    setForfeitDayMissed(!on.ok)
    if (!on.ok) return
    setForfeiting(false)
    const recorded = await recordParlorForfeiture(app.services.session, props.bookId, parlor, on.value)
    if (!recorded.ok) {
      toast({ title: "失効を記録できませんでした", description: describeError(recorded.error), tone: "error" })
      return
    }
    toast(recorded.value.length === 0 ? { title: "失効する貯玉・貯メダルはありません", description: parlorNameText(seal.parlor(parlor.name)) } : { title: "失効を記録しました", description: recorded.value.map((each) => `${each.pool.tier} ${formatTokens(seal.savings(each.tokens), each.pool.kind)}`).join("、") })
    app.wrote()
  }
  return (
    <AuxPanel
      header={
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <h2 class="min-w-0 flex-1 truncate font-semibold text-text-primary">{parlorNameText(seal.parlor(props.parlorName))}の通帳</h2>
          <Button
            variant="outline"
            size="small"
            class={cn("shrink-0", shown() !== "every" && SWITCHED_ON)}
            aria-pressed={shown() !== "every"}
            onClick={() => setShown((was) => (was === "every" ? "without-tallies" : "every"))}
          >
            遊技を除く
          </Button>
          <button type="button" class="flex size-8 items-center justify-center rounded text-text-secondary hover:bg-surface-3 hover:text-text-primary" onClick={() => moves.up(props.place)}>
            <CloseIcon label="閉じる" />
          </button>
        </div>
      }
      resizeLabel="詳細パネルの幅を変える"
    >
      <Loaded outcome={days()}>
        {(passbook) => (
          <div class="flex flex-col gap-3 p-4">
            <Show when={passbook.days.length > 0 || passbook.before !== undefined} fallback={<EmptyState title="出し入れはまだありません" />}>
              <p class="text-lg font-bold tabular-nums text-text-primary">{((now) => (now === undefined ? UNVALUED : formatYen(seal.savings(now))))(passbook.days.length > 0 ? passbook.days[0]?.balance : passbook.before?.balance)}</p>
              <Headings openable={passbook.days.map((day) => day.date)} open={openDays()} onOpen={setOpenDays} />
              <ul class="flex flex-col">
                <For each={passbook.days}>
                  {(day, at) => (
                    <Day
                      day={day}
                      yearShown={at() === 0 || passbook.days[at() - 1]?.date.slice(0, 4) !== day.date.slice(0, 4)}
                      open={openDays().has(day.date)}
                      onToggle={() => setOpenDays((was) => toggledDay(was, day.date))}
                    />
                  )}
                </For>
              </ul>
              <Show when={passbook.before} keyed>
                {(before) => <Earlier through={before.through} lastMoved={before.lastMoved} balance={<Yen value={before.balance} strong />} onEarlier={setFrom} />}
              </Show>
            </Show>
            <Show when={keptParlor()} keyed>
              {(parlor) => (
                <>
                  <Withheld kind="savings" silent>
                    <div class="flex justify-end">
                      <button type="button" class={ROW_BUTTON} onClick={askForfeiture}>
                        失効
                      </button>
                    </div>
                  </Withheld>
                  <ConfirmDialog open={forfeiting()} title={`${parlorNameText(seal.parlor(parlor.name))}の貯玉・貯メダルをすべて失効しますか？`} confirm="失効する" decline="やめる" onConfirmed={() => void forfeit(parlor)} onDeclined={() => setForfeiting(false)}>
                    <TextField label="日付" type="date" value={forfeitedOn()} onChange={setForfeitedOn} invalid={forfeitDayMissed() && !parseIsoDate(forfeitedOn()).ok} compact />
                    <p>この日に残っている貯玉・貯メダルを、すべて店に戻ったものとして記録します。その日の交換率で、収支とは別のその他損益（失効損）になります。</p>
                  </ConfirmDialog>
                </>
              )}
            </Show>
          </div>
        )}
      </Loaded>
    </AuxPanel>
  )
}
