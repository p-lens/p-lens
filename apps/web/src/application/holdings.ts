import type { BookId } from "../core/book/book"
import { parlorsFromDeclarations } from "../core/parlor/parlor"
import { holdingsOf, type Holdings } from "../core/report/holdings"
import { andThen } from "../core/result/result"
import { accountsRequest, pricesRequest, savingsQuantityRequest, savingsValueRequest } from "../hledger/query/requests"
import type { BookSession } from "./book-session"
import type { Outcome } from "./errors"
import { fromHledger, fromReport } from "./lift"

/**
 * Savings at every parlor, as of the end of the query's period: four hledger
 * answers over the same query, read together.
 */
export const loadHoldings = (session: BookSession, bookId: BookId, query: string): Promise<Outcome<Holdings>> =>
  session.read(bookId, async (journal) => {
    const [accounts, quantities, values, prices] = await Promise.all([
      journal.ask(accountsRequest),
      journal.ask(savingsQuantityRequest(query)),
      journal.ask(savingsValueRequest(query)),
      journal.ask(pricesRequest(query)),
    ])
    return andThen(fromHledger(accounts), (declared) =>
      andThen(fromHledger(quantities), (quantityReport) =>
        andThen(fromHledger(values), (valueReport) =>
          andThen(fromHledger(prices), (directives) =>
            fromReport(holdingsOf(quantityReport, valueReport, directives, parlorsFromDeclarations(declared))),
          ),
        ),
      ),
    )
  })
