import { SOURCE_TAGS } from "../core/import/source-tally"
import { identityIn, parlorsFromDeclarations, sameIdentity, type Parlor } from "../core/parlor/parlor"
import { actualOf, sidesOf } from "../core/report/figures"
import type { TallyLine } from "../core/report/tally-line"
import { tallySummaryOf, type TallySummary } from "../core/report/tallies"
import { Ok, andThen, collect, mapOk } from "../core/result/result"
import type { JournalAccess } from "../hledger/client/client"
import type { Transaction } from "../hledger/protocol/wire"
import { accountsRequest, actualRequest, talliesRequest } from "../hledger/query/requests"
import { tallyTerm } from "../hledger/query/terms"
import type { Outcome } from "./errors"
import { fromHledger, fromReport } from "./lift"

/** How many tallies are asked for at once. */
const PAGE_SIZE = 200

/** Every tally's entry a query matches, newest first: every page of them. */
const everyTally = async (journal: JournalAccess, query: string, offset: number): Promise<Outcome<readonly Transaction[]>> => {
  const page = fromHledger(await journal.ask(talliesRequest(query, { limit: PAGE_SIZE, offset })))
  if (!page.ok) return page
  const reached = offset + page.value.items.length
  if (page.value.items.length === 0 || reached >= page.value.total) return Ok(page.value.items)
  return mapOk(await everyTally(journal, query, reached), (rest) => [...page.value.items, ...rest])
}

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

/**
 * A tally's line, if its entry is a tally: what it spent, won and made are
 * hledger's, asked of the tally alone, each posting at its own day's rate —
 * the figure its detail shows.
 */
const lineOf = async (journal: JournalAccess, parlors: readonly Parlor[], transaction: Transaction): Promise<Outcome<TallyLine | undefined>> => {
  const tally = tallySummaryOf(transaction)
  if (tally === undefined) return Ok(undefined)
  return andThen(fromHledger(await journal.ask(actualRequest(tallyTerm(tally.id)))), (statement) =>
    andThen(fromReport(sidesOf(statement)), (sides) =>
      mapOk(fromReport(actualOf(statement)), (actual) => ({
        tally,
        ...tallyNamesOf(parlors, transaction, tally),
        maker: tagOf(transaction, SOURCE_TAGS.maker),
        sides,
        actual,
      })),
    ),
  )
}

/** Every tally a query matches as a line, newest first, read from a journal already open. */
export const linesIn = async (journal: JournalAccess, query: string): Promise<Outcome<readonly TallyLine[]>> => {
  const accounts = fromHledger(await journal.ask(accountsRequest))
  if (!accounts.ok) return accounts
  const entries = await everyTally(journal, query, 0)
  if (!entries.ok) return entries
  const parlors = parlorsFromDeclarations(accounts.value)
  return mapOk(collect(await Promise.all(entries.value.map((transaction) => lineOf(journal, parlors, transaction)))), (lines) => lines.filter((line): line is TallyLine => line !== undefined))
}
