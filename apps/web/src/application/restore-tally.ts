import { ACTIVITY_LOG, activityOfText, type ActivityId } from "../core/activity/activity"
import { removedTallyOf, type RemovedTally } from "../core/activity/removed-tally"
import type { BookId, ListedBook } from "../core/book/book"
import { withEntryFiled, withoutTallyFiled } from "../core/journal/filing"
import type { BookFiles } from "../core/journal/layout"
import { Err, Ok } from "../core/result/result"
import type { CommitId } from "../history/port/history-port"
import type { BookSession, ProposedChange } from "./book-session"
import type { Outcome } from "./errors"

/** The tally a line of a book's activity took out, read back from the book's files; refused where there is no such line, or it cannot be read back. */
const removedIn = (files: BookFiles, line: ActivityId): Outcome<RemovedTally> => {
  const found = activityOfText(files[ACTIVITY_LOG] ?? "").find((each) => each.id === line)
  const removed = found === undefined ? undefined : removedTallyOf(found)
  return removed === undefined ? Err({ type: "removal-unrestorable" }) : Ok(removed)
}

/** The first of the books, the one taken back into first, that holds a tally of a play already; none where none does. */
const holdingBook = async (session: BookSession, books: readonly ListedBook[], removed: RemovedTally): Promise<Outcome<ListedBook | undefined>> => {
  const [book, ...rest] = books
  if (book === undefined) return Ok(undefined)
  const stored = await session.stored(book.id)
  if (!stored.ok) return stored
  return withoutTallyFiled(stored.value.files, removed.playId) === undefined ? holdingBook(session, rest, removed) : Ok(book)
}

/** The book's files with a removed tally's entry put back, at the end of its day's year; refused where the book holds a tally of its play already. */
const restored = (files: BookFiles, removed: RemovedTally): Outcome<ProposedChange> =>
  withoutTallyFiled(files, removed.playId) === undefined
    ? Ok({ files: withEntryFiled(files, removed.date, removed.entry), intent: { type: "play-restored", playId: removed.playId, description: removed.description } })
    : Err({ type: "removal-restored", title: undefined, here: true })

/**
 * Take back a tally's removal, as one commit: its entry put back as it was
 * written, from the lines the removal's line of activity took away, so
 * only while that line still holds them. Its log never left the book. Not
 * where any of the person's books holds a tally of the play already: put
 * back before, or moved to another book and taken out of this one, which
 * would then count it twice.
 */
export const restoreTally = async (session: BookSession, bookId: BookId, line: ActivityId): Promise<Outcome<CommitId>> => {
  const stored = await session.stored(bookId)
  if (!stored.ok) return stored
  const removed = removedIn(stored.value.files, line)
  if (!removed.ok) return removed
  const books = await session.books()
  if (!books.ok) return books
  const holding = await holdingBook(session, [...books.value.filter((book) => book.id === bookId), ...books.value.filter((book) => book.id !== bookId)], removed.value)
  if (!holding.ok) return holding
  if (holding.value !== undefined) return Err({ type: "removal-restored", title: holding.value.title, here: holding.value.id === bookId })
  return session.write(bookId, async (_journal, current) => {
    const again = removedIn(current.files, line)
    return again.ok ? restored(current.files, again.value) : again
  })
}
