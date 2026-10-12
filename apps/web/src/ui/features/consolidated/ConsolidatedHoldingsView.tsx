import { createMemo, createResource, For, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { loadConsolidatedHoldings } from "../../../application/consolidation"
import type { BookId } from "../../../core/book/book"
import { parseIsoDate } from "../../../core/calendar/calendar"
import { latestValuedOn, totalAcross } from "../../../core/report/holdings"
import { untilTerm } from "../../../hledger/query/terms"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { EmptyState, Loaded } from "../../primitives/states"
import { TextField } from "../../primitives/text-field"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { bookTitle } from "../../wording/book"
import { formatDay } from "../../wording/dates"
import { formatYen } from "../../wording/numbers"
import { ParlorCard, TokenFigures } from "../holdings/HoldingsView"
import { ViewHeader } from "../shell/ViewHeader"
import { ConsolidatedBooks } from "./ConsolidatedBooks"
import { readOf, unreadIn } from "./read"

/**
 * Several books' savings together: what the books ticked hold, book by
 * book, each book's pools at its own rates and worth what hledger says of
 * that book, and above them the books' totals added. Nothing is valued
 * again across books, so a parlor two books keep is in each as that book
 * keeps it. Choosing a day writes `date:..` into the query, as it does in
 * a book, and every book is valued as of it. Savings are only read here:
 * a pool's count is put right, and a prize exchange recorded, in the book
 * whose it is.
 */
export function ConsolidatedHoldingsView(props: { readonly place: Place; readonly bookIds: readonly BookId[] | undefined; readonly query: string }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const [holdings] = createResource(
    () => ({ bookIds: props.bookIds, query: props.query, revision: app.revision() }),
    (source) => loadConsolidatedHoldings(app.services.session, source.bookIds, source.query),
  )
  const read = createMemo(() => ((found) => (found?.ok === true ? readOf(found.value) : []))(holdings()))
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
              <TextField label="評価日" type="date" value={latestValuedOn(read()) ?? ""} onChange={chooseDay} />
            </div>
            <Show when={props.query !== ""}>
              <Button variant="secondary" onClick={() => moves.go(props.place)}>
                最新に戻す
              </Button>
            </Show>
          </div>
          <Loaded outcome={holdings()}>
            {(books) => (
              <Show when={read().some((book) => book.parlors.length > 0)} fallback={<EmptyState title="貯玉・貯メダルはありません">連結する帳簿のどれかに貯玉・貯メダルがあると、帳簿ごとの残高がここに並びます。</EmptyState>}>
                <p class="text-sm text-text-muted">
                  合計 <span class="font-semibold tabular-nums text-text-primary">{formatYen(totalAcross(read()))}</span>
                </p>
                <For each={books}>
                  {(each) => (
                    <Show when={each.read.ok && each.read.value.parlors.length > 0 ? each.read.value : undefined} keyed>
                      {(found) => (
                        <section class="flex flex-col gap-2">
                          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-1">
                            <h2 class="min-w-0 break-words text-sm font-bold text-text-primary">{bookTitle(each.book)}</h2>
                            <p class="text-sm text-text-muted">
                              <span class="font-semibold tabular-nums text-text-primary">{formatYen(found.total)}</span>
                              {found.valuedOn === undefined ? "" : `（${formatDay(found.valuedOn)}時点の交換率）`}
                            </p>
                          </div>
                          <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
                            <For each={found.parlors}>
                              {(holding) => (
                                <ParlorCard holding={holding}>
                                  {(token) => (
                                    <li class="py-1.5">
                                      <TokenFigures token={token} />
                                    </li>
                                  )}
                                </ParlorCard>
                              )}
                            </For>
                          </div>
                        </section>
                      )}
                    </Show>
                  )}
                </For>
                <p class="text-xs text-text-muted">残高調整と交換払出は、それぞれの帳簿の「貯玉・貯メダル」で行います。</p>
              </Show>
            )}
          </Loaded>
          <ConsolidatedBooks bookIds={props.bookIds} unread={(id) => unreadIn(holdings(), id)} onChosen={(bookIds) => moves.go({ kind: "consolidated-holdings", bookIds }, props.query)} />
        </div>
      </div>
    </MainContent>
  )
}
