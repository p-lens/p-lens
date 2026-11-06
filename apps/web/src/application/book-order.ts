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
 * Swap a book with the next in the list, whoever's either is: the order
 * is kept on this device (`keep`), where it comes first, so a book another
 * person let them into is placed as freely as their own and nothing is
 * written into it — the first writable book is the one recorded to by
 * default. Where both are the member's own, their places are written into
 * their settings besides, so that their other devices have the member's
 * own books in that order: the two that changed places, and all of them
 * the first time any two are swapped. Those books are written one after
 * another and the first refused stops the rest, which leaves them as they
 * stood or between the two — never out of order with themselves, each
 * book's place being its own.
 */
export const swapWithNext = async (session: BookSession, member: MemberId, bookId: BookId, keep: (ids: readonly BookId[]) => void): Promise<Outcome<void>> => {
  const books = await session.books()
  if (!books.ok) return books
  const ids = books.value.map((book) => book.id)
  const lower = ids[ids.indexOf(bookId) + 1]
  if (!ids.includes(bookId) || lower === undefined) return Ok(undefined)
  keep(ids.map((id) => (id === bookId ? lower : id === lower ? bookId : id)))
  const own = books.value.filter((book) => roleIn(book, member) === "owner")
  if (!own.some((book) => book.id === lower) || !own.some((book) => book.id === bookId)) return Ok(undefined)
  return swappedWithNext(own, bookId).reduce<Promise<Outcome<void>>>(async (before, placing) => ((done) => (done.ok ? place(session, placing) : done))(await before), Promise.resolve(Ok(undefined)))
}
