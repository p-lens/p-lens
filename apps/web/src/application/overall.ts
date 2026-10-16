import type { BookId } from "../core/book/book"
import { ZERO, compare, negate, type Decimal } from "../core/decimal/decimal"
import { ACCOUNTS } from "../core/journal/accounts"
import { byColumn, byRow } from "../core/report/breakdown"
import { actualOf, statisticTotalOf, yenOf, type ReportError } from "../core/report/figures"
import type { Overall } from "../core/report/overall"
import { tallySummariesOf } from "../core/report/tallies"
import { andThen, mapOk, type Result } from "../core/result/result"
import { TALLY_TAGS } from "../core/tally/tally"
import type { JournalAccess } from "../hledger/client/client"
import type { BalanceReport } from "../hledger/protocol/wire"
import { accountRequest, actualCutRequest, actualRequest, inferredRequest, savingsDrawnRequest, talliesRequest, theoreticalRequest } from "../hledger/query/requests"
import { combine, talliesTerm } from "../hledger/query/terms"
import type { BookSession } from "./book-session"
import type { Outcome } from "./errors"
import { fromHledger, fromReport } from "./lift"

/** Every tally of a period at once: they are counted, never summed here. */
const EVERY_TALLY = { limit: 1_000_000, offset: 0 } as const

/** A balance's total in yen, as hledger sums it. */
const totalOf = (report: Outcome<BalanceReport>): Outcome<Decimal> => andThen(report, (found) => fromReport(yenOf(found.prTotals.prrTotal)))

/** The tallies of a period that made something, by what hledger sums each to: an income statement pivoted on the play's id, its rows turned over as it is read. */
const wonOf = (statement: BalanceReport): Result<number, ReportError> =>
  mapOk(byRow(statement), (rows) => [...rows.values()].filter((total) => compare(negate(total), ZERO) > 0).length)

/**
 * A book's period taken as one, every figure hledger's. It finds the
 * period's tallies, which are counted, and their days; it sums what they
 * made — over all, each tally on its own, and each day on its own — what
 * they were worth, the cash spent, the special and odd prizes taken home,
 * and the savings tallies drew on, each at the rate of its own day. What
 * the app does is count: the tallies, the days, and those of each that made
 * something.
 */
export const loadOverall = (session: BookSession, bookId: BookId, query: string): Promise<Outcome<Overall>> =>
  session.read(bookId, async (journal: JournalAccess) => {
    const played = combine(talliesTerm, query)
    const [entries, statement, perTally, perDay, theoretical, inferred, cash, special, odd, drawn] = await Promise.all([
      journal.ask(talliesRequest(query, EVERY_TALLY)),
      journal.ask(actualRequest(query)),
      journal.ask(actualCutRequest(played, { pivot: TALLY_TAGS.playId })),
      journal.ask(actualCutRequest(played, { interval: "daily" })),
      journal.ask(theoreticalRequest(query)),
      journal.ask(inferredRequest(query)),
      journal.ask(accountRequest(ACCOUNTS.cash, query)),
      journal.ask(accountRequest(ACCOUNTS.specialPrizes, query)),
      journal.ask(accountRequest(ACCOUNTS.oddPrizes, query)),
      journal.ask(savingsDrawnRequest(query)),
    ])
    const tallies = mapOk(fromHledger(entries), (page) => tallySummariesOf(page.items))
    const days = andThen(fromHledger(perDay), (report) => fromReport(byColumn(report, "daily")))
    return andThen(tallies, (found) =>
      andThen(andThen(fromHledger(statement), (report) => fromReport(actualOf(report))), (actual) =>
        andThen(andThen(fromHledger(perTally), (report) => fromReport(wonOf(report))), (playsWon) =>
          andThen(days, (byDay) =>
            andThen(andThen(fromHledger(theoretical), (report) => fromReport(statisticTotalOf(report))), (theoreticalValue) =>
              andThen(andThen(fromHledger(inferred), (report) => fromReport(statisticTotalOf(report))), (inferredValue) =>
                andThen(totalOf(fromHledger(cash)), (cashTotal) =>
                  andThen(totalOf(fromHledger(special)), (specialPrizes) =>
                    andThen(totalOf(fromHledger(odd)), (oddPrizes) =>
                      mapOk(totalOf(fromHledger(drawn)), (drawnTotal) => ({
                        plays: found.length,
                        playsWon,
                        days: [...new Set(found.map((tally) => tally.date))].toSorted().map((day) => ({ day, actual: negate(byDay.get(day) ?? ZERO) })),
                        actual,
                        theoretical: theoreticalValue,
                        inferred: inferredValue,
                        cash: negate(cashTotal),
                        specialPrizes,
                        oddPrizes,
                        savingsDrawn: negate(drawnTotal),
                      })),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    )
  })
