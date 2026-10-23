import { AuxPanel } from "solid-gathering-shell"
import { createResource, createSignal, For, Show, type JSX } from "solid-js"

import { loadRecordingContext } from "../../../application/record-tally"
import { loadPassbook, type PoolPassbookFrom } from "../../../application/savings"
import type { BookId } from "../../../core/book/book"
import type { IsoDate } from "../../../core/calendar/calendar"
import type { TokenKind } from "../../../core/commodity/commodity"
import { isZero, ZERO, type Decimal } from "../../../core/decimal/decimal"
import { readSavingsAccount } from "../../../core/journal/accounts"
import type { PassbookDay, PassbookLine } from "../../../core/report/passbook"
import { useApp } from "../../context"
import { CloseIcon, FoldIcon, UnfoldIcon } from "../../primitives/icons"
import { EmptyState, Loaded } from "../../primitives/states"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { formatDay, formatDayOfYear } from "../../wording/dates"
import { formatRate, formatTokens } from "../../wording/numbers"
import { passbookCauseText } from "../../wording/passbook"
import { yearOf } from "../period/periods"
import { ForfeitureForm, RateChangeForm } from "./SavingsForms"

const UNITS = { ball: "玉", medal: "枚" } as const

/** A small framed button at a row's end, as the passbooks' own actions are. */
export const ROW_BUTTON = "shrink-0 rounded border border-border px-2 py-0.5 text-xs text-text-secondary hover:border-text-secondary hover:text-text-primary"

/** The columns a passbook's rows line up in: the day, then what went out, what came in, and what was left. */
export const COLUMNS = "grid grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,1fr))] items-baseline gap-2"

/** The days a passbook shows open, by date. */
export type OpenDays = ReadonlySet<IsoDate>

/** The days open with one more pressed: closed where it was open, open where it was closed. */
export const toggledDay = (open: OpenDays, date: IsoDate): OpenDays => (open.has(date) ? new Set([...open].filter((each) => each !== date)) : new Set([...open, date]))

/** Whether every day that opens onto anything is open. */
const everyDayOpen = (open: OpenDays, openable: readonly IsoDate[]): boolean => openable.every((date) => open.has(date))

/**
 * A passbook's column headings. Beside 日付, where the day column has room
 * to spare, a small button opens every day that opens onto anything, or
 * closes them all where they are open: it takes no row and no width from
 * the figures.
 */
export function Headings(props: { readonly openable: readonly IsoDate[]; readonly open: OpenDays; readonly onOpen: (open: OpenDays) => void }): JSX.Element {
  const allOpen = (): boolean => everyDayOpen(props.open, props.openable)
  return (
    <div class={`${COLUMNS} border-b border-border pb-1 text-xs text-text-muted`}>
      <span class="flex items-center gap-1">
        日付
        <Show when={props.openable.length > 0}>
          <button
            type="button"
            title={allOpen() ? "すべて閉じる" : "すべて展開"}
            aria-pressed={allOpen()}
            class="-my-1 flex size-5 items-center justify-center rounded text-text-muted hover:bg-surface-3 hover:text-text-primary [&_svg]:size-3.5"
            onClick={() => props.onOpen(allOpen() ? new Set() : new Set(props.openable))}
          >
            <Show when={allOpen()} fallback={<UnfoldIcon label="すべて展開" />}>
              <FoldIcon label="すべて閉じる" />
            </Show>
          </button>
        </Show>
      </span>
      <span class="text-right">払出</span>
      <span class="text-right">預入</span>
      <span class="text-right">残高</span>
    </div>
  )
}

/** What the pool holds now: its newest day's balance, or what it held before the days shown where none moved since. */
const heldNow = (passbook: PoolPassbookFrom): Decimal => passbook.days[0]?.balance ?? passbook.before?.balance ?? ZERO

/** Tokens in a column: muted where none moved. */
function Count(props: { readonly value: Decimal; readonly kind: TokenKind; readonly class?: string }): JSX.Element {
  return <span class={`text-right tabular-nums ${isZero(props.value) ? "text-text-muted" : (props.class ?? "text-text-primary")}`}>{formatTokens(props.value, props.kind)}</span>
}

/**
 * The end of a passbook shown from a day: what was held at the end of the
 * day before, and the way to the year anything last moved in before then,
 * shown from that year's first day.
 */
export function Earlier(props: { readonly through: IsoDate; readonly lastMoved: IsoDate; readonly balance: JSX.Element; readonly onEarlier: (from: IsoDate) => void }): JSX.Element {
  const year = (): string => props.lastMoved.slice(0, 4)
  return (
    <div class="flex flex-col gap-2">
      <div class={`${COLUMNS} text-sm`}>
        <span class="col-span-3 min-w-0 truncate text-text-secondary">{formatDay(props.through)}までの残高</span>
        {props.balance}
      </div>
      <div class="flex justify-end">
        <button type="button" class={ROW_BUTTON} onClick={() => props.onEarlier(`${year()}-01-01` as IsoDate)}>
          {Number(year())}年も見る
        </button>
      </div>
    </div>
  )
}

/** What moved a day's savings, a cause to a line: what it took out and put in, and how many entries it was where more than one. */
export function Lines(props: { readonly lines: readonly PassbookLine[]; readonly kind: TokenKind }): JSX.Element {
  const app = useApp()
  return (
    <ul class="flex flex-col gap-1 border-l-2 border-border py-1 pl-2">
      <For each={props.lines}>
        {(line) => (
          <li class={`${COLUMNS} text-xs`}>
            <span class="min-w-0 truncate text-text-secondary">
              {passbookCauseText(line.cause, app.machineNames())}
              {line.entries > 1 ? ` ×${String(line.entries)}` : ""}
            </span>
            <Count value={line.withdrawn} kind={props.kind} class="text-text-secondary" />
            <Count value={line.deposited} kind={props.kind} class="text-text-secondary" />
            <span />
          </li>
        )}
      </For>
    </ul>
  )
}

/** One day of the passbook: a row that opens, when pressed, onto what moved the savings that day; a rate set that day said under it. */
function Day(props: { readonly day: PassbookDay; readonly kind: TokenKind; readonly yearShown: boolean; readonly open: boolean; readonly onToggle: () => void }): JSX.Element {
  return (
    <li class="flex flex-col gap-1 border-b border-border py-2">
      <Show when={props.yearShown}>
        <span class="text-xs font-bold text-text-muted">{props.day.date.slice(0, 4)}年</span>
      </Show>
      <button type="button" aria-expanded={props.open} class={`${COLUMNS} rounded text-left text-sm hover:bg-surface-3`} onClick={() => props.onToggle()}>
        <span class="min-w-0 truncate text-text-primary">{formatDayOfYear(props.day.date)}</span>
        <Count value={props.day.withdrawn} kind={props.kind} />
        <Count value={props.day.deposited} kind={props.kind} />
        <span class="text-right font-semibold tabular-nums text-text-primary">{formatTokens(props.day.balance, props.kind)}</span>
      </button>
      <Show when={props.day.rateSet} keyed>
        {(set) => (
          <p class="text-xs text-text-muted">
            交換率 {set.before === undefined ? "" : `${formatRate(set.before)}円 → `}
            {formatRate(set.rate)}円
          </p>
        )}
      </Show>
      <Show when={props.open && props.day.lines.length > 0}>
        <Lines lines={props.day.lines} kind={props.kind} />
      </Show>
    </li>
  )
}

/**
 * One pool's savings as a passbook, beside the book's savings: a row for
 * each day they moved or their rate was set, newest first, with what went
 * out, what came in and what was left, and pressed, what moved them that
 * day, machine by machine. It opens on this year, what was held before
 * it under the last row, and goes back a year that moved at a time. Above, the balance and the rate the pool has
 * now, and the way to set that rate anew; at the end, the way to record
 * savings the parlor took back, kept off the savings' cards since it is
 * seldom wanted.
 */
export function PassbookPanel(props: { readonly place: Place; readonly bookId: BookId; readonly account: string }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const pool = () => readSavingsAccount(props.account)
  const [from, setFrom] = createSignal<IsoDate | undefined>(yearOf(app.services.businessDay()).from)
  const [days] = createResource(
    () => ((found) => (found === undefined ? undefined : { found, bookId: props.bookId, from: from(), revision: app.revision() }))(pool()),
    (source) => loadPassbook(app.services.session, source.bookId, source.found.parlorName, { kind: source.found.kind, tier: source.found.tier }, source.from),
  )
  const [context] = createResource(
    () => ({ bookId: props.bookId, revision: app.revision() }),
    (source) => loadRecordingContext(app.services.session, source.bookId, app.services.member),
  )
  const writable = (): boolean => ((found) => found?.ok === true && found.value.canWrite)(context())
  /** The parlor as the book keeps it, where the book may be written: what recording a forfeiture needs. */
  const keptParlor = (parlorName: string) => ((found) => (found?.ok === true && found.value.canWrite ? found.value.parlors.find((parlor) => parlor.name === parlorName) : undefined))(context())
  const [openDays, setOpenDays] = createSignal<OpenDays>(new Set())
  const [changing, setChanging] = createSignal(false)
  const [forfeiting, setForfeiting] = createSignal(false)
  return (
    <AuxPanel
      header={
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <h2 class="min-w-0 flex-1 truncate font-semibold text-text-primary">{((found) => (found === undefined ? "通帳" : `${found.parlorName} ${found.tier}の通帳`))(pool())}</h2>
          <button type="button" class="flex size-8 items-center justify-center rounded text-text-secondary hover:bg-surface-3 hover:text-text-primary" onClick={() => moves.up(props.place)}>
            <CloseIcon label="閉じる" />
          </button>
        </div>
      }
      resizeLabel="詳細パネルの幅を変える"
    >
      <Show when={pool()} keyed fallback={<EmptyState title="この貯玉・貯メダルは見つかりません" />}>
        {(found) => (
          <Loaded outcome={days()}>
            {(passbook) => (
              <div class="flex flex-col gap-3 p-4">
                <div class="flex items-baseline gap-3">
                  <span class="text-lg font-bold tabular-nums text-text-primary">{formatTokens(heldNow(passbook), found.kind)}</span>
                  <span class="flex-1 text-sm text-text-muted">{((rate) => (rate === undefined ? "交換率なし" : `@ ${formatRate(rate)}`))(passbook.rate)}</span>
                  <Show when={writable() && !changing()}>
                    <button type="button" class={ROW_BUTTON} onClick={() => setChanging(true)}>
                      交換率を変更
                    </button>
                  </Show>
                </div>
                <Show when={changing()}>
                  <RateChangeForm bookId={props.bookId} parlorName={found.parlorName} pool={{ kind: found.kind, tier: found.tier }} unit={UNITS[found.kind]} current={passbook.rate} onDone={() => setChanging(false)} />
                </Show>
                <Show when={passbook.days.length > 0 || passbook.before !== undefined} fallback={<EmptyState title="出し入れはまだありません" />}>
                  <Headings openable={passbook.days.filter((day) => day.lines.length > 0).map((day) => day.date)} open={openDays()} onOpen={setOpenDays} />
                  <ul class="flex flex-col">
                    <For each={passbook.days}>
                      {(day, at) => (
                        <Day
                          day={day}
                          kind={found.kind}
                          yearShown={at() === 0 || passbook.days[at() - 1]?.date.slice(0, 4) !== day.date.slice(0, 4)}
                          open={openDays().has(day.date)}
                          onToggle={() => setOpenDays((was) => toggledDay(was, day.date))}
                        />
                      )}
                    </For>
                  </ul>
                  <Show when={passbook.before} keyed>
                    {(before) => <Earlier through={before.through} lastMoved={before.lastMoved} balance={<span class="text-right font-semibold tabular-nums text-text-primary">{formatTokens(before.balance, found.kind)}</span>} onEarlier={setFrom} />}
                  </Show>
                </Show>
                <Show when={keptParlor(found.parlorName)} keyed>
                  {(parlor) => (
                    <Show
                      when={forfeiting()}
                      fallback={
                        <div class="flex justify-end">
                          <button type="button" class={ROW_BUTTON} onClick={() => setForfeiting(true)}>
                            失効
                          </button>
                        </div>
                      }
                    >
                      <ForfeitureForm bookId={props.bookId} parlor={parlor} pool={{ kind: found.kind, tier: found.tier }} unit={UNITS[found.kind]} held={heldNow(passbook)} onDone={() => setForfeiting(false)} />
                    </Show>
                  )}
                </Show>
              </div>
            )}
          </Loaded>
        )}
      </Show>
    </AuxPanel>
  )
}
