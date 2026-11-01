import type { BookId } from "../core/book/book"
import type { IsoDate } from "../core/calendar/calendar"
import type { Decimal } from "../core/decimal/decimal"
import { actualOf, lastDayOf, secondsOf, statisticTotalOf, yenOf } from "../core/report/figures"
import { EVERY_TALLY, type Narrowing } from "../core/report/narrowing"
import { andThen, mapOk } from "../core/result/result"
import { actualRequest, inferredRequest, playTimeRequest, savingsValueRequest, theoreticalRequest } from "../hledger/query/requests"
import { combine } from "../hledger/query/terms"
import type { BookSession } from "./book-session"
import { narrowedTerm } from "./breakdown"
import type { Outcome } from "./errors"
import { fromHledger, fromReport } from "./lift"

export interface Overview {
  /** What the period's tallies made, each posting at its own day's rate. */
  readonly actual: Decimal
  readonly theoretical: Decimal
  /** The part of `theoretical` that was inferred from what was told of tallies' plays, not measured. */
  readonly inferred: Decimal
  /** The seconds the period's tallies were played for; none where no entry keeps any. */
  readonly playSeconds: Decimal | undefined
  /** Every parlor's savings, at the latest rate the book has. */
  readonly savings: Decimal
  readonly savingsValuedOn: IsoDate | undefined
}

/** The period's results in one view, every figure from hledger, of the tallies a narrowing keeps to: the savings as they stand now, whatever the period or the narrowing, so the whole book is read. */
export const loadOverview = (session: BookSession, bookId: BookId, asked: string, narrowing: Narrowing = EVERY_TALLY): Promise<Outcome<Overview>> =>
  session.read(bookId, async (journal) => {
    const narrowed = await narrowedTerm(journal, narrowing)
    if (!narrowed.ok) return narrowed
    const query = combine(asked, narrowed.value)
    const [statement, theoretical, inferred, time, savings] = await Promise.all([
      journal.ask(actualRequest(query)),
      journal.ask(theoreticalRequest(query)),
      journal.ask(inferredRequest(query)),
      journal.ask(playTimeRequest(query)),
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
          andThen(mapOk(fromHledger(time), secondsOf), (playSeconds) =>
            mapOk(savingsFigure, (savingsValue) => ({
              actual,
              theoretical: theoreticalValue,
              inferred: inferredValue,
              playSeconds,
              savings: savingsValue,
              savingsValuedOn: savingsReport.ok ? lastDayOf(savingsReport.value) : undefined,
            })),
          ),
        ),
      ),
    )
  })
