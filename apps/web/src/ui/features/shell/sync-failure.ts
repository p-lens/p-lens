import type { BookSession } from "../../../application/book-session"
import type { SyncFailure } from "../../../application/sync"
import type { BookId } from "../../../core/book/book"
import { bookTitle } from "../../wording/book"
import { syncFailedText } from "../../wording/sync"

/** A failed round's words, a line for each book that stopped, named by its title where the device has it. */
export const syncFailuresSaid = async (session: BookSession, failures: readonly SyncFailure[]): Promise<readonly string[]> => {
  const books = await session.books()
  const titleOf = (bookId: BookId): string | undefined => ((found) => (found === undefined ? undefined : bookTitle(found)))(books.ok ? books.value.find((book) => book.id === bookId) : undefined)
  return failures.map((failure) => syncFailedText(failure, titleOf))
}
