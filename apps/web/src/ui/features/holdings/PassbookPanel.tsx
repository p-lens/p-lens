import { AuxPanel } from "solid-gathering-shell"
import { createResource, createSignal, For, Show, type JSX } from "solid-js"

import { loadRecordingContext } from "../../../application/record-tally"
import { loadPassbook } from "../../../application/savings"
import type { BookId } from "../../../core/book/book"
import type { TokenKind } from "../../../core/commodity/commodity"
import { isZero, ZERO, type Decimal } from "../../../core/decimal/decimal"
import { readSavingsAccount } from "../../../core/journal/accounts"
import type { PassbookDay, PassbookLine } from "../../../core/report/passbook"
import { useApp } from "../../context"
import { CloseIcon } from "../../primitives/icons"
import { EmptyState, Loaded } from "../../primitives/states"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { formatDayOfYear } from "../../wording/dates"
import { formatRate, formatTokens } from "../../wording/numbers"
import { passbookCauseText } from "../../wording/passbook"
import { ForfeitureForm, RateChangeForm } from "./SavingsForms"

const UNITS = { ball: "玉", medal: "枚" } as const

const ROW_BUTTON = "shrink-0 rounded border border-border px-2 py-0.5 text-xs text-text-secondary hover:border-text-secondary hover:text-text-primary"

/** The columns a passbook's rows line up in: the day, then what went out, what came in, and what was left. */
export const COLUMNS = "grid grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,1fr))] items-baseline gap-2"

/** The rate the pool was last set to, where it was ever set: the passbook's newest day that set one. */
const currentRate = (passbook: readonly PassbookDay[]): Decimal | undefined => passbook.find((day) => day.rateSet !== undefined)?.rateSet?.rate

/** Tokens in a column: muted where none moved. */
function Count(props: { readonly value: Decimal; readonly kind: TokenKind; readonly class?: string }): JSX.Element {
  return <span class={`text-right tabular-nums ${isZero(props.value) ? "text-text-muted" : (props.class ?? "text-text-primary")}`}>{formatTokens(props.value, props.kind)}</span>
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
function Day(props: { readonly day: PassbookDay; readonly kind: TokenKind; readonly yearShown: boolean }): JSX.Element {
  const [open, setOpen] = createSignal(false)
  return (
    <li class="flex flex-col gap-1 border-b border-border py-2">
      <Show when={props.yearShown}>
        <span class="text-xs font-bold text-text-muted">{props.day.date.slice(0, 4)}年</span>
      </Show>
      <button type="button" aria-expanded={open()} class={`${COLUMNS} rounded text-left text-sm hover:bg-surface-3`} onClick={() => setOpen((was) => !was)}>
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
      <Show when={open() && props.day.lines.length > 0}>
        <Lines lines={props.day.lines} kind={props.kind} />
      </Show>
    </li>
  )
}

/**
 * One pool's savings as a passbook, beside the book's savings: a row for
 * each day they moved or their rate was set, newest first, with what went
 * out, what came in and what was left, and pressed, what moved them that
 * day, machine by machine. Above, the balance and the rate the pool has
 * now, and the way to set that rate anew; at the end, the way to record
 * savings the parlor took back, kept off the savings' cards since it is
 * seldom wanted.
 */
export function PassbookPanel(props: { readonly place: Place; readonly bookId: BookId; readonly account: string }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const pool = () => readSavingsAccount(props.account)
  const [days] = createResource(
    () => ((found) => (found === undefined ? undefined : { found, bookId: props.bookId, revision: app.revision() }))(pool()),
    (source) => loadPassbook(app.services.session, source.bookId, source.found.parlorName, { kind: source.found.kind, tier: source.found.tier }),
  )
  const [context] = createResource(
    () => ({ bookId: props.bookId, revision: app.revision() }),
    (source) => loadRecordingContext(app.services.session, source.bookId, app.services.member),
  )
  const writable = (): boolean => ((found) => found?.ok === true && found.value.canWrite)(context())
  /** The parlor as the book keeps it, where the book may be written: what recording a forfeiture needs. */
  const keptParlor = (parlorName: string) => ((found) => (found?.ok === true && found.value.canWrite ? found.value.parlors.find((parlor) => parlor.name === parlorName) : undefined))(context())
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
                  <span class="text-lg font-bold tabular-nums text-text-primary">{formatTokens(passbook[0]?.balance ?? ZERO, found.kind)}</span>
                  <span class="flex-1 text-sm text-text-muted">{((rate) => (rate === undefined ? "交換率なし" : `@ ${formatRate(rate)}`))(currentRate(passbook))}</span>
                  <Show when={writable() && !changing()}>
                    <button type="button" class={ROW_BUTTON} onClick={() => setChanging(true)}>
                      交換率を変更
                    </button>
                  </Show>
                </div>
                <Show when={changing()}>
                  <RateChangeForm bookId={props.bookId} parlorName={found.parlorName} pool={{ kind: found.kind, tier: found.tier }} unit={UNITS[found.kind]} current={currentRate(passbook)} onDone={() => setChanging(false)} />
                </Show>
                <Show when={passbook.length > 0} fallback={<EmptyState title="出し入れはまだありません" />}>
                  <div class={`${COLUMNS} border-b border-border pb-1 text-xs text-text-muted`}>
                    <span>日付</span>
                    <span class="text-right">払出</span>
                    <span class="text-right">預入</span>
                    <span class="text-right">残高</span>
                  </div>
                  <ul class="flex flex-col">
                    <For each={passbook}>{(day, at) => <Day day={day} kind={found.kind} yearShown={at() === 0 || passbook[at() - 1]?.date.slice(0, 4) !== day.date.slice(0, 4)} />}</For>
                  </ul>
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
                      <ForfeitureForm bookId={props.bookId} parlor={parlor} pool={{ kind: found.kind, tier: found.tier }} unit={UNITS[found.kind]} held={passbook[0]?.balance ?? ZERO} onDone={() => setForfeiting(false)} />
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
