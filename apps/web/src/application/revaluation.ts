import type { BookId } from "../core/book/book"
import { revaluationOf, type Revaluation } from "../core/report/revaluation"
import { andThen } from "../core/result/result"
import { savingsRevaluationRequest } from "../hledger/query/requests"
import type { BookSession } from "./book-session"
import type { Outcome } from "./errors"
import { fromHledger, fromReport } from "./lift"

/** 評価損益 over a query's period: what a book's savings gained or lost in yen by their rates changing, in all and parlor by parlor. The query says the period, by its dates. */
export const loadRevaluation = (session: BookSession, bookId: BookId, query: string): Promise<Outcome<Revaluation>> =>
  session.read(bookId, async (journal) => andThen(fromHledger(await journal.ask(savingsRevaluationRequest(query))), (report) => fromReport(revaluationOf(report))))
