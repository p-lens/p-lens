import { SOURCE_TAGS } from "../core/import/source-tally"
import { identityIn, parlorsFromDeclarations, sameIdentity, type Parlor } from "../core/parlor/parlor"
import { yenOf } from "../core/report/figures"
import type { TallyLine } from "../core/report/tally-line"
import { tallySummaryOf, type TallySummary } from "../core/report/tallies"
import { tallyNotesOf } from "../core/report/tally-notes"
import { ZERO, negate, type Decimal } from "../core/decimal/decimal"
import { andThen, collect, mapOk } from "../core/result/result"
import type { JournalAccess } from "../hledger/client/client"
import type { BalanceReport, Transaction } from "../hledger/protocol/wire"
import { accountsRequest, actualEachTallyRequest, spentEachTallyRequest, talliesRequest, wonEachTallyRequest } from "../hledger/query/requests"
import type { Outcome } from "./errors"
import { fromHledger, fromReport } from "./lift"

/** Every tally a query matches, however many: one question, never a page at a time. */
const EVERY_TALLY = { limit: 1_000_000, offset: 0 } as const

const tagOf = (transaction: Transaction, name: string): string | undefined => {
  const value = transaction.ttags.find(([tag]) => tag === name)?.[1]
  return value === undefined || value === "" ? undefined : value
}

/** The parlor a tally names, by the book's own name for it; for a tally taken in from another app and tied to none, the name that app gave. */
const parlorNameOf = (parlors: readonly Parlor[], transaction: Transaction): string | undefined => {
  const identity = identityIn(transaction.ttags)
  const kept = identity === undefined ? undefined : parlors.find((parlor) => sameIdentity(parlor.identity, identity))?.name
  return kept ?? tagOf(transaction, SOURCE_TAGS.parlor)
}

/** A tally's parlor and machine by name, as its entry and the book's parlors say them. */
export interface TallyNames {
  readonly parlorName: string | undefined
  readonly machineName: string | undefined
}

/** What a tally's parlor and machine are called: the machine as its entry names it, or — for a tally taken in from another app and tied to none — as that app did. */
export const tallyNamesOf = (parlors: readonly Parlor[], transaction: Transaction, tally: TallySummary): TallyNames => ({
  parlorName: parlorNameOf(parlors, transaction),
  machineName: tally.machine ?? tagOf(transaction, SOURCE_TAGS.machine),
})

/** Each tally's row of a statement pivoted on the play's id, in yen at its own day's rate: a row with a token of no rate on its day is none to read. */
const yenByTally = (statement: BalanceReport): Outcome<ReadonlyMap<string, Decimal>> =>
  fromReport(mapOk(collect(statement.prRows.map((row) => mapOk(yenOf(row.prrTotal), (yen) => [typeof row.prrName === "string" ? row.prrName : "", yen] as const))), (rows) => new Map(rows)))

/** What every tally made, spent and won, by its id: three statements of them all, each pivoted on the play's id. A tally a statement has no row for came to nothing there, hledger leaving out a row that does. */
interface Figures {
  readonly spent: ReadonlyMap<string, Decimal>
  readonly won: ReadonlyMap<string, Decimal>
  readonly actual: ReadonlyMap<string, Decimal>
}

/** One statement pivoted on the play's id, each tally's row in yen. */
const byTallyOf = async (journal: JournalAccess, request: ReturnType<typeof actualEachTallyRequest>): Promise<Outcome<ReadonlyMap<string, Decimal>>> => andThen(fromHledger(await journal.ask(request)), yenByTally)

const figuresOf = async (journal: JournalAccess, query: string): Promise<Outcome<Figures>> => {
  const [spent, won, actual] = await Promise.all([byTallyOf(journal, spentEachTallyRequest(query)), byTallyOf(journal, wonEachTallyRequest(query)), byTallyOf(journal, actualEachTallyRequest(query))])
  return andThen(spent, (spentBy) => andThen(won, (wonBy) => mapOk(actual, (actualBy) => ({ spent: spentBy, won: wonBy, actual: actualBy }))))
}

/**
 * A tally's line, if its entry is a tally: what it spent, won and made are
 * hledger's, each posting at its own day's rate — the figure its detail
 * shows. Revenue arrives negative and is turned over, as is what the tally
 * came to, an income statement being read that way.
 */
const lineOf = (parlors: readonly Parlor[], figures: Figures, transaction: Transaction): readonly TallyLine[] => {
  const tally = tallySummaryOf(transaction)
  if (tally === undefined) return []
  return [
    {
      tally,
      ...tallyNamesOf(parlors, transaction, tally),
      maker: tagOf(transaction, SOURCE_TAGS.maker),
      notes: tallyNotesOf(transaction),
      sides: { spent: figures.spent.get(tally.id) ?? ZERO, won: negate(figures.won.get(tally.id) ?? ZERO) },
      actual: negate(figures.actual.get(tally.id) ?? ZERO),
    },
  ]
}

/**
 * Every tally a query matches as a line, newest first, read from a journal
 * already open: their entries in one question, and their figures in three
 * statements of them all — never a question a tally, each of which hledger
 * would answer by going over the whole book.
 */
export const linesIn = async (journal: JournalAccess, query: string): Promise<Outcome<readonly TallyLine[]>> => {
  const [accounts, entries, figures] = await Promise.all([journal.ask(accountsRequest).then(fromHledger), journal.ask(talliesRequest(query, EVERY_TALLY)).then(fromHledger), figuresOf(journal, query)])
  return andThen(accounts, (declared) => andThen(entries, (page) => mapOk(figures, (found) => ((parlors) => page.items.flatMap((transaction) => lineOf(parlors, found, transaction)))(parlorsFromDeclarations(declared)))))
}
