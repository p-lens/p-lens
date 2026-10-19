import type { BookId } from "../core/book/book"
import { ZERO } from "../core/decimal/decimal"
import { parlorsFromDeclarations, type Parlor } from "../core/parlor/parlor"
import { holdingsOf, type Holdings } from "../core/report/holdings"
import { andThen, Ok } from "../core/result/result"
import { accountsRequest, pricesRequest, savingsEntriesRequest, savingsQuantityRequest, savingsValueRequest } from "../hledger/query/requests"
import { lastMovedOf } from "../core/report/parlor-order"
import type { IsoDate } from "../core/calendar/calendar"
import { mapOk } from "../core/result/result"
import { savingsAtTerm, savingsTerm } from "../hledger/query/terms"
import type { BookSession } from "./book-session"
import { viewedFor } from "./book-views"
import type { Outcome } from "./errors"
import { fromHledger, fromReport } from "./lift"

const NO_HOLDINGS: Holdings = { parlors: [], total: ZERO, valuedOn: undefined }

/** The parlors whose savings are asked about, of those the book declares: every one, or those named. */
const amongDeclared = (parlors: readonly Parlor[], names: readonly string[] | undefined): readonly Parlor[] => (names === undefined ? parlors : parlors.filter((parlor) => names.includes(parlor.name)))

/**
 * Savings as of the end of the query's period, at every parlor or at
 * those named (by the names the book keeps them under): four hledger
 * answers over the same query, read together, hledger summing only the
 * accounts of the parlors asked about. Where none is named, there is
 * nothing to ask.
 */
export const loadHoldings = (session: BookSession, bookId: BookId, query: string, parlorNames?: readonly string[]): Promise<Outcome<Holdings>> => {
  const accounts = parlorNames === undefined ? savingsTerm : savingsAtTerm(parlorNames)
  if (accounts === undefined) return Promise.resolve(Ok(NO_HOLDINGS))
  return viewedFor(session, query, "stood").read(bookId, async (journal) => {
    const [declarations, quantities, values, prices] = await Promise.all([
      journal.ask(accountsRequest),
      journal.ask(savingsQuantityRequest(query, accounts)),
      journal.ask(savingsValueRequest(query, accounts)),
      journal.ask(pricesRequest(query)),
    ])
    return andThen(fromHledger(declarations), (declared) =>
      andThen(fromHledger(quantities), (quantityReport) =>
        andThen(fromHledger(values), (valueReport) =>
          andThen(fromHledger(prices), (directives) =>
            fromReport(holdingsOf(quantityReport, valueReport, directives, amongDeclared(parlorsFromDeclarations(declared), parlorNames))),
          ),
        ),
      ),
    )
  })
}

/** The last day each parlor's savings moved within the query's period, by its name: what the savings are shown in the order of. */
export const loadLastMoved = (session: BookSession, bookId: BookId, query: string): Promise<Outcome<ReadonlyMap<string, IsoDate>>> =>
  viewedFor(session, query, "stood").read(bookId, async (journal) => mapOk(fromHledger(await journal.ask(savingsEntriesRequest(query))), (page) => lastMovedOf(page.items)))
