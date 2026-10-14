import { roleIn, type MemberId, type BookId } from "../core/book/book"
import { swappedWithNext, type Placing } from "../core/book/order"
import { BOOK_SETTINGS_FILE, withOrder } from "../core/book/settings"
import { Ok, mapOk } from "../core/result/result"
import type { BookSession } from "./book-session"
import type { Outcome } from "./errors"

/** A place written into a book's settings, as one change to that book: kept in its history and carried to the owner's other devices like any other. */
const place = async (session: BookSession, placing: Placing): Promise<Outcome<void>> => {
  const written = await session.write(placing.id, async (_journal, stored) =>
    mapOk(withOrder(stored.files[BOOK_SETTINGS_FILE], placing.order), (settings) => ({ files: { ...stored.files, [BOOK_SETTINGS_FILE]: settings }, intent: { type: "book-placed" as const, order: placing.order } })),
  )
  return written.ok ? Ok(undefined) : written
}

/**
 * Swap one of a member's own books with the next of their own in their
 * list. The place is the book's own, written in its settings, so it
 * reaches their other devices with the book and nothing else has to be
 * synced: the two books that changed places are written, and all of them
 * the first time any two are swapped. The books
 * are written one after another and the first refused stops the rest,
 * which leaves the list as it stood or between the two — never out of
 * order with itself, each book's place being its own. A book of another
 * person's is never placed.
 */
export const swapWithNext = async (session: BookSession, member: MemberId, bookId: BookId): Promise<Outcome<void>> => {
  const books = await session.books()
  if (!books.ok) return books
  const own = books.value.filter((book) => roleIn(book, member) === "owner")
  return swappedWithNext(own, bookId).reduce<Promise<Outcome<void>>>(async (before, placing) => ((done) => (done.ok ? place(session, placing) : done))(await before), Promise.resolve(Ok(undefined)))
}
