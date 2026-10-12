import type { BookId } from "../core/book/book"
import type { Decimal } from "../core/decimal/decimal"
import type { BookFiles } from "../core/journal/layout"
import { parlorsFromDeclarations } from "../core/parlor/parlor"
import type { PlayId } from "../core/play/play"
import type { PlayTerms } from "../core/parlor/terms"
import { parsePlayLog, playLogPath, type Checkpoint } from "../core/play-log/checkpoint"
import { termsInHead } from "../core/play-log/head"
import { inPlayOrder } from "../core/play-log/performance"
import { actualOf, statisticTotalOf } from "../core/report/figures"
import { listedPlaysOf, playSummariesOf, playSummaryOf, type ListedPlay, type PlaySummary } from "../core/report/plays"
import { Err, Ok, andThen, mapOk } from "../core/result/result"
import type { Transaction } from "../hledger/protocol/wire"
import { playTerm } from "../hledger/query/terms"
import { accountsRequest, actualByPlayRequest, actualRequest, playsRequest, theoreticalRequest } from "../hledger/query/requests"
import type { BookSession } from "./book-session"
import type { Outcome } from "./errors"
import { fromHledger, fromReport } from "./lift"
import { playNamesOf, type PlayNames } from "./play-lines"

export interface PlayList {
  readonly plays: readonly ListedPlay[]
  readonly total: number
}

const PAGE_SIZE = 50

/**
 * The plays a query matches, newest first, one page at a time, each with
 * what it made: the page's entries, then one income statement of those
 * plays alone, a row a play. A page of none asks for no statement.
 */
export const loadPlays = (session: BookSession, bookId: BookId, query: string, offset: number): Promise<Outcome<PlayList>> =>
  session.read(bookId, async (journal) => {
    const page = fromHledger(await journal.ask(playsRequest(query, { limit: PAGE_SIZE, offset })))
    if (!page.ok) return page
    const plays = playSummariesOf(page.value.items)
    if (plays.length === 0) return Ok({ plays: [], total: page.value.total })
    return mapOk(fromHledger(await journal.ask(actualByPlayRequest(plays.map((play) => play.id)))), (statement) => ({ plays: listedPlaysOf(plays, statement), total: page.value.total }))
  })

export interface PlayDetail {
  readonly summary: PlaySummary
  /** What its parlor and its machine are called, each where the play names one. */
  readonly names: PlayNames
  /** The play's log in play order, where the book keeps one that reads: a play followed live has one, a play typed in afterwards none. */
  readonly log: readonly Checkpoint[] | undefined
  /** The corner's terms the play was on, where its log's head says them. */
  readonly terms: PlayTerms | undefined
  readonly transaction: Transaction
  readonly actual: Decimal
  readonly theoretical: Decimal
}

const logTextOf = (files: BookFiles, summary: PlaySummary): string | undefined => (summary.gameKind === undefined ? undefined : files[playLogPath(summary.gameKind, summary.id)])

const logOf = (files: BookFiles, summary: PlaySummary): readonly Checkpoint[] | undefined => {
  const text = logTextOf(files, summary)
  const parsed = text === undefined ? undefined : parsePlayLog(text)
  return parsed?.ok === true ? inPlayOrder(parsed.value) : undefined
}

const termsOf = (files: BookFiles, summary: PlaySummary): PlayTerms | undefined => {
  const text = logTextOf(files, summary)
  return text === undefined ? undefined : termsInHead(text)
}

/** One play: its entry as hledger read it, what it made and what it should have, and its log where it has one. */
export const loadPlay = (session: BookSession, bookId: BookId, id: PlayId): Promise<Outcome<PlayDetail>> =>
  session.read(bookId, async (journal, stored) => {
    const query = playTerm(id)
    const [entries, statement, theoretical, accounts] = await Promise.all([
      journal.ask(playsRequest(query, { limit: 1, offset: 0 })),
      journal.ask(actualRequest(query)),
      journal.ask(theoreticalRequest(query)),
      journal.ask(accountsRequest),
    ])
    const parlors = mapOk(fromHledger(accounts), parlorsFromDeclarations)
    if (!parlors.ok) return parlors
    const found = andThen(fromHledger(entries), (page) => {
      const transaction = page.items[0]
      const summary = transaction === undefined ? undefined : playSummaryOf(transaction)
      return transaction === undefined || summary === undefined
        ? Err({ type: "play-missing" } as const)
        : Ok({ transaction, summary })
    })
    return andThen(found, ({ transaction, summary }) =>
      andThen(andThen(fromHledger(statement), (report) => fromReport(actualOf(report))), (actual) =>
        mapOk(andThen(fromHledger(theoretical), (report) => fromReport(statisticTotalOf(report))), (theoreticalValue) => ({
          summary,
          names: playNamesOf(parlors.value, transaction, summary),
          log: logOf(stored.files, summary),
          terms: termsOf(stored.files, summary),
          transaction,
          actual,
          theoretical: theoreticalValue,
        })),
      ),
    )
  })
