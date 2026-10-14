import { createResource, createSignal, For, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { loadHoldings } from "../../../application/holdings"
import { loadRecordingContext } from "../../../application/record-tally"
import type { BookId } from "../../../core/book/book"
import { parseIsoDate } from "../../../core/calendar/calendar"
import type { Parlor } from "../../../core/parlor/parlor"
import type { ParlorHolding, TokenHolding } from "../../../core/report/holdings"
import { untilTerm } from "../../../hledger/query/terms"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { EmptyState, Loaded } from "../../primitives/states"
import { TextField } from "../../primitives/text-field"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { formatDay } from "../../wording/dates"
import { formatRate, formatTokens, formatYen } from "../../wording/numbers"
import { createOffered } from "../parlor-offers/offered"
import { ViewHeader } from "../shell/ViewHeader"
import { BalanceAdjustmentForm, ForfeitureForm, PrizeExchangeForm, OpeningBalanceForm } from "./SavingsForms"

const UNITS = { ball: "玉", medal: "枚" } as const

/** What is open under a pool's row: nothing, the form that records a prize exchange, the one that puts the count right, or the one that records what a parlor took back. */
type Opened = "none" | "prize-exchange" | "adjustment" | "forfeiture"

const ROW_BUTTON = "shrink-0 rounded border border-border px-2 py-0.5 text-xs text-text-secondary hover:border-text-secondary hover:text-text-primary"

/** One pool's savings on a line: how many, at what rate, worth what. */
export function TokenFigures(props: { readonly token: TokenHolding }): JSX.Element {
  return (
    <div class="flex items-baseline justify-between gap-3">
      <span class="w-12 shrink-0 text-xs text-text-muted">{props.token.tier}</span>
      <span class="tabular-nums text-text-primary">{formatTokens(props.token.quantity, props.token.kind)}</span>
      <span class="flex-1 text-sm text-text-muted">{props.token.rate === undefined ? "交換率なし" : `@ ${formatRate(props.token.rate.rate)}`}</span>
      <span class="tabular-nums text-text-secondary">{formatYen(props.token.value)}</span>
    </div>
  )
}

/**
 * One pool's savings and, where the book knows whose they are, the ways
 * to record a prize exchange and to put the count right, each opened
 * under the row. The figures keep a line of their own and the two small
 * buttons the end of the next, so neither is squeezed on a phone.
 */
function TokenRow(props: { readonly bookId: BookId; readonly parlor: Parlor | undefined; readonly token: TokenHolding }): JSX.Element {
  const [opened, setOpened] = createSignal<Opened>("none")
  const pool = () => ({ kind: props.token.kind, tier: props.token.tier })
  return (
    <li class="flex flex-col gap-2 py-1.5">
      <TokenFigures token={props.token} />
      <Show when={props.parlor !== undefined && opened() === "none"}>
        <div class="flex justify-end gap-2">
          <button type="button" class={ROW_BUTTON} onClick={() => setOpened("prize-exchange")}>
            交換払出
          </button>
          <button type="button" class={ROW_BUTTON} onClick={() => setOpened("adjustment")}>
            残高調整
          </button>
          <button type="button" class={ROW_BUTTON} onClick={() => setOpened("forfeiture")}>
            失効
          </button>
        </div>
      </Show>
      <Show when={opened() === "prize-exchange" ? props.parlor : undefined} keyed>
        {(parlor) => <PrizeExchangeForm bookId={props.bookId} parlor={parlor} pool={pool()} unit={UNITS[props.token.kind]} onDone={() => setOpened("none")} />}
      </Show>
      <Show when={opened() === "adjustment" ? props.parlor : undefined} keyed>
        {(parlor) => <BalanceAdjustmentForm bookId={props.bookId} parlor={parlor} pool={pool()} unit={UNITS[props.token.kind]} held={props.token.quantity} onDone={() => setOpened("none")} />}
      </Show>
      <Show when={opened() === "forfeiture" ? props.parlor : undefined} keyed>
        {(parlor) => <ForfeitureForm bookId={props.bookId} parlor={parlor} pool={pool()} unit={UNITS[props.token.kind]} held={props.token.quantity} onDone={() => setOpened("none")} />}
      </Show>
    </li>
  )
}

/** One parlor's savings: its name and what they are worth, over its pools, each drawn as whoever shows the card draws a pool. */
export function ParlorCard(props: { readonly holding: ParlorHolding; readonly children: (token: TokenHolding) => JSX.Element }): JSX.Element {
  return (
    <article class="rounded-lg bg-surface-1 px-4 py-3">
      <header class="flex items-baseline justify-between gap-3 border-b border-border pb-2">
        <h2 class="font-semibold text-text-primary">{props.holding.parlorName}</h2>
        <span class="text-lg font-bold tabular-nums text-text-primary">{formatYen(props.holding.value)}</span>
      </header>
      <ul>
        <For each={props.holding.tokens}>{(token) => props.children(token)}</For>
      </ul>
    </article>
  )
}

/**
 * Savings at every parlor, valued at the rate in force on the day shown,
 * with the ways to set them — the savings a person already had when they
 * began the book, registered once, and a pool's count put right — and to
 * record a pool's savings exchanged for prizes.
 * Choosing a day writes `date:..` into the query, so a past valuation is an
 * address like any other.
 */
export function HoldingsView(props: { readonly place: Place; readonly bookId: BookId; readonly query: string }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const [holdings] = createResource(
    () => ({ bookId: props.bookId, query: props.query, revision: app.revision() }),
    (source) => loadHoldings(app.services.session, source.bookId, source.query),
  )
  const valuedOn = (): string => {
    const found = holdings()
    return found?.ok === true ? (found.value.valuedOn ?? "") : ""
  }
  const [context] = createResource(
    () => ({ bookId: props.bookId, revision: app.revision() }),
    (source) => loadRecordingContext(app.services.session, source.bookId, app.services.member),
  )
  const offered = createOffered()
  const [opening, setOpening] = createSignal(false)
  /** What registering savings needs of the book, once it is read and the book may be written. */
  const writable = () => {
    const found = context()
    return found?.ok === true && found.value.canWrite ? found.value : undefined
  }
  const chooseDay = (text: string): void => {
    const day = parseIsoDate(text)
    if (day.ok) moves.go(props.place, untilTerm(day.value))
  }

  return (
    <MainContent header={<ViewHeader place={props.place} title="貯玉・貯メダル" />}>
      <div class="max-w-5xl">
        <div class="flex flex-col gap-4 p-4">
          <div class="flex flex-wrap items-end gap-3">
            <div class="w-48">
              <TextField label="評価日" type="date" value={valuedOn()} onChange={chooseDay} />
            </div>
            <Show when={props.query !== ""}>
              <Button variant="secondary" onClick={() => moves.go(props.place)}>
                最新に戻す
              </Button>
            </Show>
            <Show when={writable() !== undefined && !opening()}>
              <Button onClick={() => setOpening(true)}>
                開始残高を登録
              </Button>
            </Show>
          </div>
          <Show when={opening() ? writable() : undefined} keyed>
            {(found) => <OpeningBalanceForm bookId={props.bookId} context={found} list={offered.list()} submissions={offered.submissions()} onDone={() => setOpening(false)} />}
          </Show>
          <Loaded outcome={holdings()}>
            {(found) => (
              <Show
                when={found.parlors.length > 0}
                fallback={<EmptyState title="貯玉・貯メダルはありません">収支を記録するか、開始残高を登録すると、店舗ごとの残高がここに並びます。</EmptyState>}
              >
                <p class="text-sm text-text-muted">
                  合計 <span class="font-semibold tabular-nums text-text-primary">{formatYen(found.total)}</span>
                  {found.valuedOn === undefined ? "" : `（${formatDay(found.valuedOn)}時点の交換率）`}
                </p>
                <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <For each={found.parlors}>{(holding) => <ParlorCard holding={holding}>{(token) => <TokenRow bookId={props.bookId} parlor={holding.parlor} token={token} />}</ParlorCard>}</For>
                </div>
              </Show>
            )}
          </Loaded>
        </div>
      </div>
    </MainContent>
  )
}
