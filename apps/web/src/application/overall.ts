import type { BookId } from "../core/book/book"
import { SECONDS } from "../core/commodity/commodity"
import { ZERO, compare, negate, type Decimal } from "../core/decimal/decimal"
import { ACCOUNTS, EXPENSE_ROOT, REVENUE_ROOT } from "../core/journal/accounts"
import { byColumn, byRow } from "../core/report/breakdown"
import { actualOf, quantityIn, rowTotalOf, yenOf, type ReportError } from "../core/report/figures"
import type { Overall } from "../core/report/overall"
import { tallyDaysOf } from "../core/report/tallies"
import { andThen, collect, mapOk, type Result } from "../core/result/result"
import { TALLY_TAGS } from "../core/tally/tally"
import type { JournalAccess } from "../hledger/client/client"
import type { BalanceReport } from "../hledger/protocol/wire"
import { actualCutRequest, actualRequest, periodTotalsRequest, rentalSpreadRequest, savingsDrawnRequest, tallyHeadsRequest } from "../hledger/query/requests"
import { combine, talliesTerm } from "../hledger/query/terms"
import type { BookSession } from "./book-session"
import type { Outcome } from "./errors"
import { fromHledger, fromReport } from "./lift"

/** A balance's total in yen, as hledger sums it. */
const totalOf = (report: Outcome<BalanceReport>): Outcome<Decimal> => andThen(report, (found) => fromReport(yenOf(found.prTotals.prrTotal)))

/** The tallies of a period that made something, by what hledger sums each to: an income statement pivoted on the play's id, its rows turned over as it is read. */
const wonOf = (statement: BalanceReport): Result<number, ReportError> =>
  mapOk(byRow(statement), (rows) => [...rows.values()].filter((total) => compare(negate(total), ZERO) > 0).length)

/**
 * A book's period taken as one, every figure hledger's. It finds the
 * period's tallies, which are counted, and their days; it sums what they
 * made — over all, each tally on its own, and each day on its own — what
 * they were worth, what they took in and gave back at each day's rate,
 * the loss on renting tokens, the fee on replaying them, the time they were played for, the cash
 * spent, the special and odd prizes taken home and the part of a yen beside them, and the savings tallies
 * drew on, each at the rate of its own day. What the app does is count:
 * the tallies, the days, and those of each that made something.
 */
export const loadOverall = (session: BookSession, bookId: BookId, query: string): Promise<Outcome<Overall>> =>
  session.read(bookId, async (journal: JournalAccess) => {
    const played = combine(talliesTerm, query)
    const [entries, statement, perTally, perDay, totals, ...yen] = await Promise.all([
      journal.ask(tallyHeadsRequest(query)),
      journal.ask(actualRequest(query)),
      journal.ask(actualCutRequest(played, { pivot: TALLY_TAGS.playId })),
      journal.ask(actualCutRequest(played, { interval: "daily", totalsOnly: true })),
      journal.ask(periodTotalsRequest(query)),
      journal.ask(savingsDrawnRequest(query)),
      journal.ask(rentalSpreadRequest(query)),
    ])
    const tallies = mapOk(fromHledger(entries), (page) => tallyDaysOf(page.items))
    const days = andThen(fromHledger(perDay), (report) => fromReport(byColumn(report, "daily")))
    const totalled = fromHledger(totals)
    const yenIn = (account: string): Outcome<Decimal> => andThen(totalled, (report) => fromReport(yenOf(rowTotalOf(report, account) ?? [])))
    const accounts = [ACCOUNTS.theoreticalValue, ACCOUNTS.inferredTheoreticalValue, ACCOUNTS.cash, ACCOUNTS.specialPrizes, ACCOUNTS.oddPrizes, ACCOUNTS.translationAdjustment, EXPENSE_ROOT, REVENUE_ROOT, ACCOUNTS.replayFee]
    return andThen(tallies, (found) =>
      andThen(andThen(fromHledger(statement), (report) => fromReport(actualOf(report))), (actual) =>
        andThen(andThen(fromHledger(perTally), (report) => fromReport(wonOf(report))), (playsWon) =>
          andThen(days, (byDay) =>
            andThen(collect(accounts.map(yenIn)), ([theoreticalValue = ZERO, inferredValue = ZERO, cash = ZERO, specialPrizes = ZERO, oddPrizes = ZERO, translationAdjustment = ZERO, spent = ZERO, credited = ZERO, replayFee = ZERO]) =>
              andThen(mapOk(totalled, (report) => ((time) => (time === undefined ? undefined : quantityIn(time, SECONDS)))(rowTotalOf(report, ACCOUNTS.playTime))), (playSeconds) =>
                mapOk(collect(yen.map((report) => totalOf(fromHledger(report)))), ([drawn = ZERO, rentalSpread = ZERO]) => ({
                  plays: found.length,
                  playsWon,
                  days: [...new Set(found.map((tally) => tally.date))].toSorted().map((day) => ({ day, actual: negate(byDay.get(day) ?? ZERO) })),
                  actual,
                  theoretical: theoreticalValue,
                  inferred: inferredValue,
                  cash: negate(cash),
                  spent,
                  returned: negate(credited),
                  rentalSpread,
                  replayFee,
                  playSeconds,
                  specialPrizes,
                  oddPrizes,
                  translationAdjustment,
                  savingsDrawn: negate(drawn),
                })),
              ),
            ),
          ),
        ),
      ),
    )
  })
