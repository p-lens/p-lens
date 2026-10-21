import { AuxPanel } from "solid-gathering-shell"
import { createResource, createSignal, For, Show, type JSX } from "solid-js"

import { loadParlorPassbook, type ParlorPassbookShown } from "../../../application/savings"
import type { BookId } from "../../../core/book/book"
import type { IsoDate } from "../../../core/calendar/calendar"
import { isZero, type Decimal } from "../../../core/decimal/decimal"
import type { ParlorPassbookDay, PoolDay } from "../../../core/report/parlor-passbook"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { CloseIcon } from "../../primitives/icons"
import { EmptyState, Loaded } from "../../primitives/states"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { formatDayOfYear } from "../../wording/dates"
import { formatRate, formatTokens, formatYenToHundredths } from "../../wording/numbers"
import { yearOf } from "../period/periods"
import { COLUMNS, Earlier, Lines } from "./PassbookPanel"

/** Yen a token had no rate for: dashes in the figure's shape. */
const UNVALUED = "¥--.--"

/** Yen in a column, to two places: muted where none moved, dashes where some token had no rate. */
function Yen(props: { readonly value: Decimal | undefined; readonly strong?: boolean }): JSX.Element {
  return (
    <span
      class="text-right text-xs tabular-nums"
      classList={{ "text-text-muted": props.value === undefined || isZero(props.value), "text-text-primary": props.value !== undefined && !isZero(props.value), "font-semibold": props.strong === true }}
    >
      {props.value === undefined ? UNVALUED : formatYenToHundredths(props.value)}
    </span>
  )
}

/** One pool's part of a parlor's day: its tokens out and in, the rate it was set to that day, and what moved them. */
function PoolPart(props: { readonly part: PoolDay }): JSX.Element {
  return (
    <li class="flex flex-col gap-1">
      <div class={`${COLUMNS} text-xs`}>
        <span class="font-semibold text-text-secondary">{props.part.pool.tier}</span>
        <span class="text-right tabular-nums text-text-secondary">{formatTokens(props.part.day.withdrawn, props.part.pool.kind)}</span>
        <span class="text-right tabular-nums text-text-secondary">{formatTokens(props.part.day.deposited, props.part.pool.kind)}</span>
        <span class="text-right tabular-nums text-text-muted">{formatTokens(props.part.day.balance, props.part.pool.kind)}</span>
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
function Day(props: { readonly day: ParlorPassbookDay; readonly yearShown: boolean }): JSX.Element {
  const [open, setOpen] = createSignal(false)
  return (
    <li class="flex flex-col gap-1 border-b border-border py-2">
      <Show when={props.yearShown}>
        <span class="text-xs font-bold text-text-muted">{props.day.date.slice(0, 4)}年</span>
      </Show>
      <button type="button" aria-expanded={open()} class={`${COLUMNS} rounded text-left hover:bg-surface-3`} onClick={() => setOpen((was) => !was)}>
        <span class="min-w-0 truncate text-sm text-text-primary">{formatDayOfYear(props.day.date)}</span>
        <Yen value={props.day.withdrawn} />
        <Yen value={props.day.deposited} />
        <Yen value={props.day.balance} strong />
      </button>
      <Show when={open()}>
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
 * in yen to two places — what went out and came in at the day's rate, and
 * what was held at the day's end at the rate then — and pressed, each
 * pool's tokens that day, machine by machine. It opens on this year,
 * what was held before it under the last row, and goes back a year that
 * moved at a time. Tokens of different pools are never added: only yen,
 * and by hledger. Pressed, the top bar's 遊技を除く leaves the plays'
 * tallies out, so what moved the savings otherwise reads alone.
 */
export function ParlorPassbookPanel(props: { readonly place: Place; readonly bookId: BookId; readonly parlorName: string }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const [from, setFrom] = createSignal<IsoDate | undefined>(yearOf(app.services.businessDay()).from)
  const [shown, setShown] = createSignal<ParlorPassbookShown>("every")
  const [days] = createResource(
    () => ({ bookId: props.bookId, parlorName: props.parlorName, from: from(), shown: shown(), revision: app.revision() }),
    (source) => loadParlorPassbook(app.services.session, source.bookId, source.parlorName, source.from, source.shown),
  )
  return (
    <AuxPanel
      header={
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <h2 class="min-w-0 flex-1 truncate font-semibold text-text-primary">{props.parlorName}の通帳</h2>
          <Button variant={shown() === "every" ? "outline" : "primary"} size="small" class="shrink-0" aria-pressed={shown() !== "every"} onClick={() => setShown((was) => (was === "every" ? "without-tallies" : "every"))}>
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
              <p class="text-lg font-bold tabular-nums text-text-primary">{((now) => (now === undefined ? UNVALUED : formatYenToHundredths(now)))(passbook.days.length > 0 ? passbook.days[0]?.balance : passbook.before?.balance)}</p>
              <div class={`${COLUMNS} border-b border-border pb-1 text-xs text-text-muted`}>
                <span>日付</span>
                <span class="text-right">払出</span>
                <span class="text-right">預入</span>
                <span class="text-right">残高</span>
              </div>
              <ul class="flex flex-col">
                <For each={passbook.days}>{(day, at) => <Day day={day} yearShown={at() === 0 || passbook.days[at() - 1]?.date.slice(0, 4) !== day.date.slice(0, 4)} />}</For>
              </ul>
              <Show when={passbook.before} keyed>
                {(before) => <Earlier through={before.through} lastMoved={before.lastMoved} balance={<Yen value={before.balance} strong />} onEarlier={setFrom} />}
              </Show>
            </Show>
          </div>
        )}
      </Loaded>
    </AuxPanel>
  )
}
