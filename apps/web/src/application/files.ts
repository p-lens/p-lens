import type { BookId } from "../core/book/book"
import { inBookOrder } from "../core/journal/layout"
import { Ok } from "../core/result/result"
import type { BookSession } from "./book-session"
import type { Outcome } from "./errors"

/** One file of a book, exactly as it is kept and as it would be exported. */
export interface BookFile {
  readonly path: string
  readonly text: string
}

/** Every file a book is made of, journal files first, as stored — nothing rendered or recomputed. */
export const loadBookFiles = (session: BookSession, bookId: BookId): Promise<Outcome<readonly BookFile[]>> =>
  session.read(bookId, async (_journal, stored) => Ok(inBookOrder(Object.keys(stored.files)).map((path) => ({ path, text: stored.files[path] ?? "" }))))
