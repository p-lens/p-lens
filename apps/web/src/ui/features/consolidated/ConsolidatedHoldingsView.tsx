import { createMemo, createResource, For, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { loadConsolidatedHoldings } from "../../../application/consolidation"
import type { BookId } from "../../../core/book/book"
import { parseIsoDate } from "../../../core/calendar/calendar"
import { latestValuedOn, parlorsAcross, totalAcross, type ParlorAcross } from "../../../core/report/holdings"
import { untilTerm } from "../../../hledger/query/terms"
import { useApp } from "../../context"
import { EmptyState, Loaded } from "../../primitives/states"
import { TextField } from "../../primitives/text-field"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { formatDay } from "../../wording/dates"
import { formatRate, formatTokens, formatYen } from "../../wording/numbers"
import { booksKeptText, ratesText } from "../../wording/passbook"
import { ViewHeader } from "../shell/ViewHeader"
import { ConsolidatedBooks } from "./ConsolidatedBooks"
import { readOf, unreadIn } from "./read"

/**
 * One parlor's savings across the books ticked, as a book's own are shown:
 * its name, and beside it how many books keep savings there where it is
 * more than one; what they are worth together; and each pool's tokens,
 * the rate or rates the books valued them at, and their worth.
 */
function ParlorAcrossCard(props: { readonly parlor: ParlorAcross }): JSX.Element {
  return (
    <article class="rounded-lg bg-surface-1 px-4 py-3">
      <header class="flex items-baseline justify-between gap-3 border-b border-border pb-2">
        <h2 class="min-w-0 break-words font-semibold text-text-primary">
          {props.parlor.parlorName}
          <Show when={props.parlor.books > 1}>
            <span class="ml-1.5 text-xs font-normal text-text-muted">{booksKeptText(props.parlor.books)}</span>
          </Show>
        </h2>
        <span class="text-lg font-bold tabular-nums text-text-primary">{formatYen(props.parlor.value)}</span>
      </header>
      <ul>
        <For each={props.parlor.pools}>
          {(pool) => (
            <li class="flex items-baseline justify-between gap-3 py-1.5">
              <span class="w-12 shrink-0 text-xs text-text-muted">{pool.tier}</span>
              <span class="tabular-nums text-text-primary">{formatTokens(pool.quantity, pool.kind)}</span>
              <span class="flex-1 text-sm text-text-muted">{ratesText(pool.rates.map(formatRate))}</span>
              <span class="tabular-nums text-text-secondary">{formatYen(pool.value)}</span>
            </li>
          )}
        </For>
      </ul>
    </article>
  )
}

/**
 * Several books' savings together, parlor by parlor: a parlor the books
 * ticked keep is one card, its pools' tokens and what each book valued them
 * at added, and above them the books' totals added. Nothing is valued again
 * across books, so a pool two books value at two rates is worth what each
 * says, and both rates are told. Choosing a day writes `date:..` into the query, as it does in
 * a book, and every book is valued as of it. Savings are only read here:
 * a pool's count is put right, and a prize exchange recorded, in the book
 * whose it is.
 */
export function ConsolidatedHoldingsView(props: { readonly place: Place; readonly bookIds: readonly BookId[] | undefined; readonly query: string }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const [holdings] = createResource(
    () => ({ bookIds: props.bookIds, query: props.query, revision: app.revision(), outdated: app.consolidationOutdated() }),
    (source) => loadConsolidatedHoldings(app.services.consolidation, source.bookIds, source.query),
  )
  const read = createMemo(() => ((found) => (found?.ok === true ? readOf(found.value) : []))(holdings()))
  const parlors = createMemo(() => parlorsAcross(read()))
  /** A day chosen to value the savings on, and the field emptied to value them as they stand now. */
  const chooseDay = (text: string): void => {
    if (text.trim() === "") return void moves.go(props.place)
    const day = parseIsoDate(text)
    if (day.ok) moves.go(props.place, untilTerm(day.value))
  }
  return (
    <MainContent header={<ViewHeader place={props.place} title="貯玉・貯メダル" />}>
      <div class="max-w-5xl">
        <div class="flex flex-col gap-4 p-4">
          <div class="flex flex-wrap items-end gap-3">
            <div class="w-[8.5rem]">
              <TextField label="評価日" type="date" value={latestValuedOn(read()) ?? ""} onChange={chooseDay} />
            </div>
            <ConsolidatedBooks bookIds={props.bookIds} unread={(id) => unreadIn(holdings(), id)} onChosen={(bookIds) => moves.go({ kind: "consolidated-holdings", bookIds }, props.query)} />
          </div>
          <Loaded outcome={holdings()}>
            {() => (
              <Show when={parlors().length > 0} fallback={<EmptyState title="貯玉・貯メダルはありません">連結する帳簿のどれかに貯玉・貯メダルがあると、店ごとの残高がここに並びます。</EmptyState>}>
                <p class="text-sm text-text-muted">
                  合計 <span class="font-semibold tabular-nums text-text-primary">{formatYen(totalAcross(read()))}</span>
                  {((valuedOn) => (valuedOn === undefined ? "" : `（${formatDay(valuedOn)}時点の交換率）`))(latestValuedOn(read()))}
                </p>
                <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <For each={parlors()}>{(parlor) => <ParlorAcrossCard parlor={parlor} />}</For>
                </div>
                <p class="text-xs text-text-muted">残高調整と交換払出は、それぞれの帳簿の「貯玉・貯メダル」で行います。</p>
              </Show>
            )}
          </Loaded>
        </div>
      </div>
    </MainContent>
  )
}
