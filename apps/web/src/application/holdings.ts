import type { BookId } from "../core/book/book"
import { ZERO } from "../core/decimal/decimal"
import { parlorsFromDeclarations, samePool, type Parlor, type SavingsPool } from "../core/parlor/parlor"
import { holdingsOf, type Holdings } from "../core/report/holdings"
import { andThen, Ok } from "../core/result/result"
import { accountsRequest, pricesRequest, savingsEntriesRequest, savingsQuantityRequest, savingsValueRequest } from "../hledger/query/requests"
import { lastMovedOf } from "../core/report/parlor-order"
import type { IsoDate } from "../core/calendar/calendar"
import { mapOk } from "../core/result/result"
import { savingsAtTerm, savingsOfRatesTerm, savingsTerm } from "../hledger/query/terms"
import type { BookSession } from "./book-session"
import { viewedFor } from "./book-views"
import type { Outcome } from "./errors"
import { fromHledger, fromReport } from "./lift"

const NO_HOLDINGS: Holdings = { parlors: [], total: ZERO, valuedOn: undefined }

/** Which savings are asked about, where not every parlor's: some parlors', by the names the book keeps them under, or some rates', at whichever parlor. */
type SavingsAmong = { readonly by: "parlor"; readonly names: readonly string[] } | { readonly by: "rate"; readonly pools: readonly SavingsPool[] }

/** The accounts hledger is asked of: every savings account, or those of what is chosen; none where nothing is. */
const accountsAmong = (among: SavingsAmong | undefined): string | undefined => {
  if (among === undefined) return savingsTerm
  switch (among.by) {
    case "parlor":
      return savingsAtTerm(among.names)
    case "rate":
      return savingsOfRatesTerm(among.pools)
  }
}

/** Whether a pool is among those asked about: every pool, but where rates are chosen, those of the rates chosen alone. */
const isAsked = (among: SavingsAmong | undefined, pool: SavingsPool): boolean => among?.by !== "rate" || among.pools.some((chosen) => samePool(chosen, pool))

/** The parlors whose savings are asked about, of those the book declares: every one, those named, or those keeping a rate chosen. */
const amongDeclared = (parlors: readonly Parlor[], among: SavingsAmong | undefined): readonly Parlor[] =>
  parlors.filter((parlor) => (among?.by === "parlor" ? among.names.includes(parlor.name) : parlor.pools.some((pool) => isAsked(among, pool))))

/** Savings with the pools of the rates not asked about left out, a parlor keeping none of those asked about going with them; hledger's total stands, being asked of those alone. */
const keptToAsked = (holdings: Holdings, among: SavingsAmong | undefined): Holdings => ({
  ...holdings,
  parlors: holdings.parlors.map((holding) => ({ ...holding, tokens: holding.tokens.filter((token) => isAsked(among, token)) })).filter((holding) => holding.tokens.length > 0),
})

/**
 * Savings as of the end of the query's period, at every parlor, at those
 * named (by the names the book keeps them under) or at some rates: four
 * hledger answers over the same query, read together, hledger summing
 * only the accounts asked about. Where nothing is chosen, there is
 * nothing to ask.
 */
export const loadHoldings = (session: BookSession, bookId: BookId, query: string, among?: SavingsAmong): Promise<Outcome<Holdings>> => {
  const accounts = accountsAmong(among)
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
            mapOk(fromReport(holdingsOf(quantityReport, valueReport, directives, amongDeclared(parlorsFromDeclarations(declared), among))), (holdings) => keptToAsked(holdings, among)),
          ),
        ),
      ),
    )
  })
}

/** The last day each parlor's savings moved within the query's period, by its name: what the savings are shown in the order of. */
export const loadLastMoved = (session: BookSession, bookId: BookId, query: string): Promise<Outcome<ReadonlyMap<string, IsoDate>>> =>
  viewedFor(session, query, "stood").read(bookId, async (journal) => mapOk(fromHledger(await journal.ask(savingsEntriesRequest(query))), (page) => lastMovedOf(page.items)))
