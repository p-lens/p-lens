import type { BookId } from "../core/book/book"
import { BOOK_FILES } from "../core/journal/layout"
import { withTitle } from "../core/journal/title"
import { Ok } from "../core/result/result"
import type { CommitId } from "../history/port/history-port"
import type { BookSession } from "./book-session"
import type { Outcome } from "./errors"

/**
 * Name a book by a title already read as one: the title its main journal
 * opens with is rewritten, as one change like any other — trialled in
 * hledger, kept in the book's history and carried to whoever shares it.
 */
export const renameBook = (session: BookSession, bookId: BookId, title: string): Promise<Outcome<CommitId>> =>
  session.write(bookId, async (_journal, stored) =>
    Ok({ files: { ...stored.files, [BOOK_FILES.main]: withTitle(stored.files[BOOK_FILES.main] ?? "", title) }, intent: { type: "book-renamed" as const, title } }),
  )
