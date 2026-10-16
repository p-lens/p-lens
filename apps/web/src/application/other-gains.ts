import type { BookId } from "../core/book/book"
import { ACCOUNTS } from "../core/journal/accounts"
import { yenOf } from "../core/report/figures"
import type { OtherGains } from "../core/report/other-gains"
import { revaluationOf } from "../core/report/revaluation"
import { andThen, mapOk } from "../core/result/result"
import { branchRequest, savingsRevaluationRequest } from "../hledger/query/requests"
import type { BookSession } from "./book-session"
import type { Outcome } from "./errors"
import { fromHledger, fromReport } from "./lift"

/**
 * その他損益 over a query's period, both hledger's: 失効損, the forfeited
 * savings at the rate of each one's day, and 評価損益, what a book's
 * savings gained or lost in yen by their rates changing, in all and parlor
 * by parlor. The query says the period, by its dates.
 */
export const loadOtherGains = (session: BookSession, bookId: BookId, query: string): Promise<Outcome<OtherGains>> =>
  session.read(bookId, async (journal) => {
    const [forfeited, revalued] = await Promise.all([journal.ask(branchRequest(ACCOUNTS.forfeiture, query)), journal.ask(savingsRevaluationRequest(query))])
    return andThen(andThen(fromHledger(forfeited), (report) => fromReport(yenOf(report.prTotals.prrTotal))), (forfeitedYen) =>
      andThen(fromHledger(revalued), (report) => mapOk(fromReport(revaluationOf(report)), (revaluation) => ({ forfeited: forfeitedYen, revaluation }))),
    )
  })
