import type { BookId } from "../core/book/book"
import type { Decimal } from "../core/decimal/decimal"
import type { BookFiles } from "../core/journal/layout"
import { parlorsFromDeclarations } from "../core/parlor/parlor"
import type { PlayId } from "../core/play/play"
import type { PlayTerms } from "../core/parlor/terms"
import { parsePlayLog, playLogPath, type Checkpoint, type PlayLogError } from "../core/play-log/checkpoint"
import { termsInHead } from "../core/play-log/head"
import { inPlayOrder } from "../core/play-log/performance"
import { actualOf, sidesOf, statisticTotalOf, type Sides } from "../core/report/figures"
import { listedTalliesOf, tallySummariesOf, tallySummaryOf, type ListedTally, type TallySummary } from "../core/report/tallies"
import { Err, Ok, andThen, mapOk } from "../core/result/result"
import type { Transaction } from "../hledger/protocol/wire"
import { tallyTerm } from "../hledger/query/terms"
import { accountsRequest, actualByTallyRequest, actualRequest, talliesRequest, theoreticalRequest } from "../hledger/query/requests"
import type { BookSession } from "./book-session"
import { viewedFor } from "./book-views"
import type { Outcome } from "./errors"
import { fromHledger, fromReport } from "./lift"
import { tallyNamesOf, type TallyNames } from "./tally-lines"

export interface TallyList {
  readonly tallies: readonly ListedTally[]
  readonly total: number
}

const PAGE_SIZE = 50

/**
 * The tallies a query matches, newest first, one page at a time, each with
 * what it made: the page's entries, then one income statement of those
 * tallies alone, a row a tally. A page of none asks for no statement.
 */
export const loadTallies = (session: BookSession, bookId: BookId, query: string, offset: number): Promise<Outcome<TallyList>> =>
  viewedFor(session, query, "moved").read(bookId, async (journal) => {
    const page = fromHledger(await journal.ask(talliesRequest(query, { limit: PAGE_SIZE, offset })))
    if (!page.ok) return page
    const tallies = tallySummariesOf(page.value.items)
    if (tallies.length === 0) return Ok({ tallies: [], total: page.value.total })
    return mapOk(fromHledger(await journal.ask(actualByTallyRequest(tallies.map((tally) => tally.id)))), (statement) => ({ tallies: listedTalliesOf(tallies, statement), total: page.value.total }))
  })

export interface TallyDetail {
  readonly summary: TallySummary
  /** What its parlor and its machine are called, each where the tally names one. */
  readonly names: TallyNames
  /** Its play's log in play order: a tally of a play followed live has one, a tally typed in afterwards none, and a log the book keeps may not read. */
  readonly log: TallyLog
  /** The corner's terms its play was on, where its log's head says them. */
  readonly terms: PlayTerms | undefined
  readonly transaction: Transaction
  /** What went into its play — tokens played and the rental spread and replay fee beside them — and what came out, in yen at the play's day. */
  readonly sides: Sides
  readonly actual: Decimal
  readonly theoretical: Decimal
}

const logTextOf = (files: BookFiles, summary: TallySummary): string | undefined => (summary.gameKind === undefined ? undefined : files[playLogPath(summary.gameKind, summary.id)])

/** What a book keeps of a tally's play log: none, its readings, or a log that is there and does not read — its lines, or the terms its head says. */
export type TallyLog =
  | { readonly type: "none" }
  | { readonly type: "read"; readonly checkpoints: readonly Checkpoint[] }
  | { readonly type: "unreadable"; readonly error: PlayLogError | { readonly type: "unreadable-terms" } }

const logOf = (files: BookFiles, summary: TallySummary): TallyLog => {
  const text = logTextOf(files, summary)
  if (text === undefined) return { type: "none" }
  if (termsInHead(text).type === "unreadable") return { type: "unreadable", error: { type: "unreadable-terms" } }
  const parsed = parsePlayLog(text)
  return parsed.ok ? { type: "read", checkpoints: inPlayOrder(parsed.value) } : { type: "unreadable", error: parsed.error }
}

const termsOf = (files: BookFiles, summary: TallySummary): PlayTerms | undefined => {
  const text = logTextOf(files, summary)
  const said = text === undefined ? undefined : termsInHead(text)
  return said?.type === "stated" ? said.terms : undefined
}

/** One tally: its entry as hledger read it, what it made and what it should have, and its play's log where it has one. */
export const loadTally = (session: BookSession, bookId: BookId, id: PlayId): Promise<Outcome<TallyDetail>> =>
  session.read(bookId, async (journal, stored) => {
    const query = tallyTerm(id)
    const [entries, statement, theoretical, accounts] = await Promise.all([
      journal.ask(talliesRequest(query, { limit: 1, offset: 0 })),
      journal.ask(actualRequest(query)),
      journal.ask(theoreticalRequest(query)),
      journal.ask(accountsRequest),
    ])
    const parlors = mapOk(fromHledger(accounts), parlorsFromDeclarations)
    if (!parlors.ok) return parlors
    const found = andThen(fromHledger(entries), (page) => {
      const transaction = page.items[0]
      const summary = transaction === undefined ? undefined : tallySummaryOf(transaction)
      return transaction === undefined || summary === undefined
        ? Err({ type: "tally-missing" } as const)
        : Ok({ transaction, summary })
    })
    return andThen(found, ({ transaction, summary }) =>
      andThen(fromHledger(statement), (report) =>
        andThen(fromReport(sidesOf(report)), (sides) =>
          andThen(fromReport(actualOf(report)), (actual) =>
            mapOk(andThen(fromHledger(theoretical), (report) => fromReport(statisticTotalOf(report))), (theoreticalValue) => ({
          summary,
          names: tallyNamesOf(parlors.value, transaction, summary),
          log: logOf(stored.files, summary),
          terms: termsOf(stored.files, summary),
              transaction,
              sides,
              actual,
              theoretical: theoreticalValue,
            })),
          ),
        ),
      ),
    )
  })
