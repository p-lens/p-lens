import { SOURCE_TAGS } from "../core/import/source-play"
import { identityIn, parlorsFromDeclarations, sameIdentity, type Parlor } from "../core/parlor/parlor"
import { actualOf, sidesOf } from "../core/report/figures"
import type { PlayLine } from "../core/report/play-line"
import { playSummaryOf, type PlaySummary } from "../core/report/plays"
import { Ok, andThen, collect, mapOk } from "../core/result/result"
import type { JournalAccess } from "../hledger/client/client"
import type { Transaction } from "../hledger/protocol/wire"
import { accountsRequest, actualRequest, playsRequest } from "../hledger/query/requests"
import { playTerm } from "../hledger/query/terms"
import type { Outcome } from "./errors"
import { fromHledger, fromReport } from "./lift"

/** How many plays are asked for at once. */
const PAGE_SIZE = 200

/** Every play's entry a query matches, newest first: every page of them. */
const everyPlay = async (journal: JournalAccess, query: string, offset: number): Promise<Outcome<readonly Transaction[]>> => {
  const page = fromHledger(await journal.ask(playsRequest(query, { limit: PAGE_SIZE, offset })))
  if (!page.ok) return page
  const reached = offset + page.value.items.length
  if (page.value.items.length === 0 || reached >= page.value.total) return Ok(page.value.items)
  return mapOk(await everyPlay(journal, query, reached), (rest) => [...page.value.items, ...rest])
}

const tagOf = (transaction: Transaction, name: string): string | undefined => {
  const value = transaction.ttags.find(([tag]) => tag === name)?.[1]
  return value === undefined || value === "" ? undefined : value
}

/** The parlor a play names, by the book's own name for it; for a play taken in from another app and tied to none, the name that app gave. */
const parlorNameOf = (parlors: readonly Parlor[], transaction: Transaction): string | undefined => {
  const identity = identityIn(transaction.ttags)
  const kept = identity === undefined ? undefined : parlors.find((parlor) => sameIdentity(parlor.identity, identity))?.name
  return kept ?? tagOf(transaction, SOURCE_TAGS.parlor)
}

/** A play's parlor and machine by name, as its entry and the book's parlors say them. */
export interface PlayNames {
  readonly parlorName: string | undefined
  readonly machineName: string | undefined
}

/** What a play's parlor and machine are called: the machine as its entry names it, or — for a play taken in from another app and tied to none — as that app did. */
export const playNamesOf = (parlors: readonly Parlor[], transaction: Transaction, play: PlaySummary): PlayNames => ({
  parlorName: parlorNameOf(parlors, transaction),
  machineName: play.machine ?? tagOf(transaction, SOURCE_TAGS.machine),
})

/**
 * A play's line, if its entry is a play: what it spent, won and made are
 * hledger's, asked of the play alone, each posting at its own day's rate —
 * the figure its detail shows.
 */
const lineOf = async (journal: JournalAccess, parlors: readonly Parlor[], transaction: Transaction): Promise<Outcome<PlayLine | undefined>> => {
  const play = playSummaryOf(transaction)
  if (play === undefined) return Ok(undefined)
  return andThen(fromHledger(await journal.ask(actualRequest(playTerm(play.id)))), (statement) =>
    andThen(fromReport(sidesOf(statement)), (sides) =>
      mapOk(fromReport(actualOf(statement)), (actual) => ({
        play,
        ...playNamesOf(parlors, transaction, play),
        maker: tagOf(transaction, SOURCE_TAGS.maker),
        sides,
        actual,
      })),
    ),
  )
}

/** Every play a query matches as a line, newest first, read from a journal already open. */
export const linesIn = async (journal: JournalAccess, query: string): Promise<Outcome<readonly PlayLine[]>> => {
  const accounts = fromHledger(await journal.ask(accountsRequest))
  if (!accounts.ok) return accounts
  const entries = await everyPlay(journal, query, 0)
  if (!entries.ok) return entries
  const parlors = parlorsFromDeclarations(accounts.value)
  return mapOk(collect(await Promise.all(entries.value.map((transaction) => lineOf(journal, parlors, transaction)))), (lines) => lines.filter((line): line is PlayLine => line !== undefined))
}
