import type { BookId } from "../core/book/book"
import { tokenCommodity } from "../core/commodity/commodity"
import type { Parlor, SavingsPool } from "../core/parlor/parlor"
import { tokenKindOf } from "../core/play/play"
import { playLogPath } from "../core/play-log/checkpoint"
import { withoutTallyFiled } from "../core/journal/filing"
import type { RecordedTally } from "../core/report/recorded-tally"
import { Err, Ok, andThen } from "../core/result/result"
import type { TallyHead } from "../core/tally/tally"
import { rateOn, rateReachingBack, type PricePoint } from "../core/valuation/valuation"
import { talliesRequest } from "../hledger/query/requests"
import { tallyTerm } from "../hledger/query/terms"
import type { CommitId } from "../history/port/history-port"
import type { BookSession, ProposedChange } from "./book-session"
import type { Outcome } from "./errors"
import { fromHledger } from "./lift"
import { openPool } from "./parlors"
import { recordTokenTally, recordYenTally } from "./record-tally"

/**
 * The parlor's pool a tally needs where it moves to: a parlor is in a book
 * by its pools. A tally in tokens needs its own; one in yen at a parlor,
 * the parlor's pool of its game's tokens, else the first it has; one at no
 * parlor, none.
 */
const poolNeeded = (moved: RecordedTally): { readonly parlor: Parlor; readonly pool: SavingsPool } | undefined => {
  if (moved.type === "token") return { parlor: moved.tally.parlor, pool: moved.tally.pool }
  const parlor = moved.tally.parlor
  const pool = parlor === undefined ? undefined : (parlor.pools.find((each) => each.kind === tokenKindOf(moved.tally.gameKind)) ?? parlor.pools[0])
  return parlor === undefined || pool === undefined ? undefined : { parlor, pool }
}

/** The parlor a tally is at in the book it moves to: the pool it needs opened there at the rate the book it leaves had on its day, or the first after. */
const parlorThere = async (session: BookSession, to: BookId, moved: RecordedTally, prices: readonly PricePoint[]): Promise<Outcome<Parlor | undefined>> => {
  const needed = poolNeeded(moved)
  if (needed === undefined) return Ok(undefined)
  const commodity = tokenCommodity(needed.pool.kind, needed.parlor.name, needed.pool.tier)
  const rate = (rateOn(prices, commodity, moved.tally.date) ?? rateReachingBack(prices, commodity, moved.tally.date))?.rate
  if (rate === undefined) return Err({ type: "tally", error: { type: "no-exchange-rate", commodity, date: moved.tally.date } })
  return openPool(session, to, { identity: needed.parlor.identity, parlorName: needed.parlor.name, pool: needed.pool, rate, date: moved.tally.date })
}

/** Whether a book has a tally of a play already. */
const holds = async (session: BookSession, bookId: BookId, head: TallyHead): Promise<Outcome<boolean>> =>
  session.read(bookId, async (journal) => andThen(fromHledger(await journal.ask(talliesRequest(tallyTerm(head.id), { limit: 1, offset: 0 }))), (page) => Ok(page.items.length > 0)))

/** A tally taken out of the book it leaves, as one commit. Its play's log stays there as a removed tally's does — what was read at the cabinet is not unread — and goes on beside it in the other. */
const takenOut = (session: BookSession, from: BookId, head: TallyHead): Promise<Outcome<CommitId>> =>
  session.write(from, async (journal, stored) =>
    andThen(fromHledger(await journal.ask(talliesRequest(tallyTerm(head.id), { limit: 1, offset: 0 }))), (page): Outcome<ProposedChange> => {
      const files = withoutTallyFiled(stored.files, head.id)
      const transaction = page.items[0]
      return files === undefined || transaction === undefined ? Err({ type: "tally-missing" }) : Ok({ files, intent: { type: "play-removed", playId: head.id, description: transaction.tdescription } })
    }),
  )

/**
 * Move a recorded tally, as it was set right, into another of the person's
 * books, whole: written into that book first — the pool it needs opened
 * there, a copy of its play's log beside it — and only then taken out of
 * the one it was in, so that a move cut short leaves it in both, never in
 * neither. A
 * book that has a tally of the play already is not written to. Savings it
 * moved go with it, from the one book's parlor to the other's.
 */
export const moveTally = async (session: BookSession, from: BookId, to: BookId, moved: RecordedTally, prices: readonly PricePoint[]): Promise<Outcome<CommitId>> => {
  const head: TallyHead = moved.tally
  const there = await holds(session, to, head)
  if (!there.ok) return there
  if (there.value) return Err({ type: "tally-in-book" })
  const stored = await session.stored(from)
  if (!stored.ok) return stored
  const log = stored.value.files[playLogPath(head.gameKind, head.id)]
  const parlor = await parlorThere(session, to, moved, prices)
  if (!parlor.ok) return parlor
  const written =
    moved.type === "token"
      ? await recordTokenTally(session, to, { ...moved.tally, parlor: parlor.value ?? moved.tally.parlor }, log)
      : await recordYenTally(session, to, { ...moved.tally, parlor: parlor.value }, log)
  return written.ok ? takenOut(session, from, head) : written
}
