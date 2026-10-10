import type { BookId } from "../book/book"
import { fileStemOf } from "../book/file-name"
import type { IsoDate } from "../calendar/calendar"

/** A book as a file is named for it: its id, and its title if it has one. */
export interface NamedBook {
  readonly id: BookId
  readonly title: string | undefined
}

/** A UUIDv7, whose first twelve hex digits are the moment it was made. */
const UUID_V7 = /^([0-9a-f]{8})-([0-9a-f]{4})-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * What tells a book from another of its title in a file's name: the part
 * of its id that is the moment it was made, as the id writes it. The name
 * need not lead back to the id, only differ, and no two books of one title
 * are made in one moment. An id that carries no moment is used whole.
 */
const madeAt = (bookId: BookId): string => {
  const read = UUID_V7.exec(bookId)
  return read === null ? bookId : `${read[1] ?? ""}${read[2] ?? ""}`
}

/**
 * What each of several books' files are named by, before what kind of file
 * each is: the book's title, or its id where it has none — and, for books
 * that would share that, the moment each was made in brackets after it,
 * every one of them alike, so none writes over another.
 */
export const fileStemsOf = (books: readonly NamedBook[]): ReadonlyMap<BookId, string> => {
  const stems = books.map((book) => fileStemOf(book.title, book.id))
  const shared = (stem: string): boolean => stems.filter((each) => each === stem).length > 1
  return new Map(books.map((book, index) => [book.id, ((stem) => (shared(stem) ? `${stem}(${madeAt(book.id)})` : stem))(stems[index] ?? "")]))
}

/**
 * The day a file was written out, as its name says it: the day and the word
 * for what the day is of. A bare day beside 収支 reads as the day whose
 * results the file holds.
 */
const exportedOn = (day: IsoDate): string => `${day}_exported`

/** The name a book's single journal goes by: what the book's files are named by, and the day it was written out. A name's parts are joined by underscores. */
export const singleJournalName = (stem: string, day: IsoDate): string => `${stem}_${exportedOn(day)}.journal`

/** The name a book's table of plays goes by: what the book's files are named by, what the table is of, and the day it was written out. */
export const playTableName = (stem: string, day: IsoDate): string => `${stem}_収支_${exportedOn(day)}.csv`

/** The name several books written out together go by: what they are, and the day. */
export const bundleName = (day: IsoDate): string => `帳簿_${exportedOn(day)}.zip`
