import { ACTIVITY_LOG, activityLinesOf, activityOf, unreadableActivityLines, type ActivityLine } from "../core/activity/activity"
import type { BookId, ListedBook } from "../core/book/book"
import { Ok, andThen, mapOk } from "../core/result/result"
import type { HistoryPort } from "../history/port/history-port"
import type { BookSession } from "./book-session"
import type { Outcome } from "./errors"
import { fromHistory } from "./lift"

export interface Activity {
  /** Newest first. */
  readonly lines: readonly ActivityLine[]
  /** The book's cover, for naming the members who made each change. */
  readonly book: ListedBook | undefined
  /** The lines of the book's activity log that do not read, by number: what is shown leaves them out. */
  readonly unreadable: readonly number[]
}

/**
 * What happened to a book, as the book itself says in its activity log —
 * or, for a book written before it kept one, as this device's history
 * says, until the book is next written and given its log.
 */
export const loadActivity = async (session: BookSession, history: HistoryPort, bookId: BookId): Promise<Outcome<Activity>> => {
  const [files, commits, books] = await Promise.all([
    session.read(bookId, async (_journal, stored) => Ok(stored.files)),
    history.log(bookId).then(fromHistory),
    session.books(),
  ])
  return andThen(files, (held) =>
    andThen(commits, (found) =>
      mapOk(books, (all) => ({ lines: activityOf(held, activityLinesOf(found).toReversed()), book: all.find((book) => book.id === bookId), unreadable: unreadableActivityLines(held[ACTIVITY_LOG] ?? "") })),
    ),
  )
}
