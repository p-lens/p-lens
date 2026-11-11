import { ACTIVITY_LOG, withoutPastChanges } from "../core/activity/activity"
import { memberCan, type BookId, type MemberId } from "../core/book/book"
import { Ok } from "../core/result/result"
import type { BookSession } from "./book-session"
import type { Outcome } from "./errors"

/** Everything pruning books' activity reaches: the books, who prunes them, and the moment they are pruned as of. */
export interface PruningPorts {
  readonly session: BookSession
  readonly member: MemberId
  readonly now: () => string
}

/** A book's activity with its older lines rid of the changes they made, as one change: none where no line holds changes so old, or it keeps no log. */
const prune = async (ports: PruningPorts, bookId: BookId): Promise<Outcome<boolean>> => {
  const stored = await ports.session.stored(bookId)
  if (!stored.ok) return stored
  const held = stored.value.files[ACTIVITY_LOG]
  if (!memberCan(stored.value.book, ports.member, "write") || held === undefined || withoutPastChanges(held, new Date(ports.now())) === undefined) return Ok(false)
  const written = await ports.session.write(bookId, async (_journal, current) =>
    Ok({ files: { ...current.files, [ACTIVITY_LOG]: withoutPastChanges(current.files[ACTIVITY_LOG] ?? "", new Date(ports.now())) ?? current.files[ACTIVITY_LOG] ?? "" }, intent: { type: "activity-pruned" as const } }),
  )
  return written.ok ? Ok(true) : written
}

/**
 * Every book this member may write with its activity's older lines rid of
 * the changes they made, one book after another: the lines are kept for
 * ever, and what made them heavy is not, so that a book is sent to other
 * devices whole no heavier than it must be. A book refused is passed over
 * and the rest are pruned. How many were
 * pruned is told, so that what shows the books can be read again.
 */
export const pruneEveryBookActivity = async (ports: PruningPorts): Promise<Outcome<number>> => {
  const books = await ports.session.books()
  if (!books.ok) return books
  const pruned = await books.value.reduce<Promise<number>>(async (before, book) => ((count, done) => (done.ok && done.value ? count + 1 : count))(await before, await prune(ports, book.id)), Promise.resolve(0))
  return Ok(pruned)
}
