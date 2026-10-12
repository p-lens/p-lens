import type { BookId } from "../core/book/book"
import type { IsoDate } from "../core/calendar/calendar"
import type { Decimal } from "../core/decimal/decimal"
import { actualOf, lastDayOf, statisticTotalOf, yenOf } from "../core/report/figures"
import { andThen, mapOk } from "../core/result/result"
import { actualRequest, inferredRequest, savingsValueRequest, theoreticalRequest } from "../hledger/query/requests"
import type { BookSession } from "./book-session"
import type { Outcome } from "./errors"
import { fromHledger, fromReport } from "./lift"

export interface Overview {
  /** What the period's plays made, each posting at its own day's rate. */
  readonly actual: Decimal
  readonly theoretical: Decimal
  /** The part of `theoretical` that was inferred from what was told of plays, not measured. */
  readonly inferred: Decimal
  /** Every parlor's savings, at the latest rate the book has. */
  readonly savings: Decimal
  readonly savingsValuedOn: IsoDate | undefined
}

/** The period's results in one view, every figure from hledger. */
export const loadOverview = (session: BookSession, bookId: BookId, query: string): Promise<Outcome<Overview>> =>
  session.read(bookId, async (journal) => {
    const [statement, theoretical, inferred, savings] = await Promise.all([
      journal.ask(actualRequest(query)),
      journal.ask(theoreticalRequest(query)),
      journal.ask(inferredRequest(query)),
      journal.ask(savingsValueRequest("")),
    ])
    const inferredFigure = andThen(fromHledger(inferred), (report) => fromReport(statisticTotalOf(report)))
    const actualFigure = andThen(fromHledger(statement), (report) => fromReport(actualOf(report)))
    const theoreticalFigure = andThen(fromHledger(theoretical), (report) => fromReport(statisticTotalOf(report)))
    const savingsReport = fromHledger(savings)
    const savingsFigure = andThen(savingsReport, (report) => fromReport(yenOf(report.prTotals.prrTotal)))
    return andThen(actualFigure, (actual) =>
      andThen(theoreticalFigure, (theoreticalValue) =>
        andThen(inferredFigure, (inferredValue) =>
        mapOk(savingsFigure, (savingsValue) => ({
          actual,
          theoretical: theoreticalValue,
          inferred: inferredValue,
          savings: savingsValue,
          savingsValuedOn: savingsReport.ok ? lastDayOf(savingsReport.value) : undefined,
        })),
        ),
      ),
    )
  })
