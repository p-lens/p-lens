import type { BookId, TitledBook } from "../core/book/book"
import type { Dimension, Group } from "../core/report/breakdown"
import { mapOk } from "../core/result/result"
import type { BookSession } from "./book-session"
import { loadBreakdown } from "./breakdown"
import type { Outcome } from "./errors"
import { loadOverview } from "./overview"

/** What several books' results are grouped by: what one book's are, or the books themselves. */
export type ConsolidatedBy = Dimension | "book"

/** One book among those consolidated: which, and its results of the period in groups — or why they could not be read. */
export interface ConsolidatedBook {
  readonly book: TitledBook
  readonly groups: Outcome<readonly Group[]>
}

/** A book's results for a period as one group, the book itself: what the period made and was worth, as hledger sums it. */
const whole = async (session: BookSession, book: TitledBook, query: string): Promise<Outcome<readonly Group[]>> =>
  mapOk(await loadOverview(session, book.id, query), (overview) => [{ key: book.id, actual: overview.actual, theoretical: overview.theoretical }])

/** One book after another: hledger holds one journal at a time, so the books are read in turn. */
const groupsOf = async (session: BookSession, books: readonly TitledBook[], by: ConsolidatedBy, query: string): Promise<readonly ConsolidatedBook[]> => {
  const [book, ...rest] = books
  if (book === undefined) return []
  const groups = by === "book" ? await whole(session, book, query) : await loadBreakdown(session, book.id, by, query)
  return [{ book, groups }, ...(await groupsOf(session, rest, by, query))]
}

/**
 * The results of the books chosen, for a period, grouped, book by book;
 * `undefined` chooses every book on the device. Each group's figures are
 * its own book's, from hledger: several books are read as one by adding
 * those, never by valuing anything again across books — two people who
 * kept the same parlor at different rates each keep their own. A book that
 * is chosen and not on the device is passed over.
 */
export const loadConsolidation = async (session: BookSession, chosen: readonly BookId[] | undefined, by: ConsolidatedBy, query: string): Promise<Outcome<readonly ConsolidatedBook[]>> => {
  const listed = await session.books()
  if (!listed.ok) return listed
  const books = await groupsOf(session, listed.value.filter((book) => chosen === undefined || chosen.includes(book.id)), by, query)
  return mapOk(listed, () => books)
}
