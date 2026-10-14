import type { BookId, ListedBook } from "../core/book/book"
import type { Dimension, Group } from "../core/report/breakdown"
import type { Holdings } from "../core/report/holdings"
import { mergedSenderNames, type SenderNames } from "../core/report/senders"
import { mergedSpinPerformances, type SpinPerformancesByMachine } from "../core/report/spin-performance"
import { mapOk } from "../core/result/result"
import type { BookSession } from "./book-session"
import { loadBreakdown, loadSenderBreakdown, loadSenderNames, loadSpinPerformances } from "./breakdown"
import type { Outcome } from "./errors"
import { loadHoldings } from "./holdings"
import { loadOverview } from "./overview"
import { keepsTheoreticalValues } from "./theoretical"

/** What several books' results are grouped by: what one book's are, the books themselves, or who played them. */
export type ConsolidatedBy = Dimension | "book" | "sender"

/** One book among those consolidated: which, and what was asked of it — or why it could not be read. */
export interface ConsolidatedBook<T> {
  readonly book: ListedBook
  readonly read: Outcome<T>
}

/** One book after another: hledger holds one journal at a time, so the books are read in turn. */
const inTurn = async <T>(books: readonly ListedBook[], read: (book: ListedBook) => Promise<Outcome<T>>): Promise<readonly ConsolidatedBook<T>[]> => {
  const [book, ...rest] = books
  if (book === undefined) return []
  const first = await read(book)
  return [{ book, read: first }, ...(await inTurn(rest, read))]
}

/**
 * The books chosen, each asked the same thing, book by book; `undefined`
 * chooses every book on the device. What a book answers is its own, from
 * hledger: several books are read as one by adding those, never by
 * valuing anything again across books — two people who kept the same
 * parlor at different rates each keep their own. A book that is chosen
 * and not on the device is passed over.
 */
const ofChosen = async <T>(session: BookSession, chosen: readonly BookId[] | undefined, read: (book: ListedBook) => Promise<Outcome<T>>): Promise<Outcome<readonly ConsolidatedBook<T>[]>> => {
  const listed = await session.books()
  if (!listed.ok) return listed
  const books = await inTurn(listed.value.filter((book) => chosen === undefined || chosen.includes(book.id)), read)
  return mapOk(listed, () => books)
}

/** A book's results for a period as one group, the book itself: what the period made and was worth, as hledger sums it. */
const whole = async (session: BookSession, book: ListedBook, query: string): Promise<Outcome<readonly Group[]>> =>
  mapOk(await loadOverview(session, book.id, query), (overview) => [{ key: book.id, actual: overview.actual, theoretical: overview.theoretical, inferred: overview.inferred }])

/** The results of the books chosen, for a period, grouped, book by book. */
export const loadConsolidation = (session: BookSession, chosen: readonly BookId[] | undefined, by: ConsolidatedBy, query: string): Promise<Outcome<readonly ConsolidatedBook<readonly Group[]>[]>> =>
  ofChosen(session, chosen, (book) => {
    if (by === "book") return whole(session, book, query)
    return by === "sender" ? loadSenderBreakdown(session, book.id, query) : loadBreakdown(session, book.id, by, query)
  })

/** The savings of the books chosen, as of the end of the query's period, book by book: each book's pools at its own rates. */
export const loadConsolidatedHoldings = (session: BookSession, chosen: readonly BookId[] | undefined, query: string): Promise<Outcome<readonly ConsolidatedBook<Holdings>[]>> =>
  ofChosen(session, chosen, (book) => loadHoldings(session, book.id, query))

/**
 * Whether any of the books chosen has a theoretical value written in it.
 * Where none has, a sum of theoretical values over them is nothing to
 * show; where one has, the sum is that book's and the others add nothing.
 * A book that could not be asked says nothing either way.
 */
export const consolidationKeepsTheoreticalValues = async (session: BookSession, chosen: readonly BookId[] | undefined): Promise<Outcome<boolean>> =>
  mapOk(await ofChosen(session, chosen, (book) => keepsTheoreticalValues(session, book.id)), (books) => books.some((each) => each.read.ok && each.read.value))

/** The spin performances of the books chosen, by machine, for a period: each book's, added. A book that could not be read adds nothing. */
export const loadConsolidatedSpinPerformances = async (session: BookSession, chosen: readonly BookId[] | undefined, query: string): Promise<Outcome<SpinPerformancesByMachine>> =>
  mapOk(await ofChosen(session, chosen, (book) => loadSpinPerformances(session, book.id, query)), (books) => mergedSpinPerformances(books.flatMap((each) => (each.read.ok ? [each.read.value] : []))))

/** Who sent the plays of the books chosen, each by the name on their last tally in any of them. A book that could not be read names no one. */
export const loadConsolidatedSenderNames = async (session: BookSession, chosen: readonly BookId[] | undefined): Promise<Outcome<SenderNames>> =>
  mapOk(await ofChosen(session, chosen, (book) => loadSenderNames(session, book.id)), (books) => mergedSenderNames(books.flatMap((each) => (each.read.ok ? [each.read.value] : []))))
