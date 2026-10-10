import type { BookId } from "../core/book/book"
import { Ok } from "../core/result/result"
import type { StoredBook } from "../storage/port/book-storage"
import type { BookSession } from "./book-session"
import type { Outcome } from "./errors"

/**
 * Put a first book on the device if it has none, so a first visit opens
 * onto a book to keep. A device that has a book — its first, one joined,
 * one put back — is left exactly as it is, and no book is made.
 */
export const ensureFirstBook = async (session: BookSession, make: () => StoredBook): Promise<Outcome<BookId>> => {
  const books = await session.books()
  if (!books.ok) return books
  const first = books.value.at(0)
  if (first !== undefined) return Ok(first.id)
  const stored = make()
  const created = await session.createBook(stored)
  return created.ok ? Ok(stored.book.id) : created
}
