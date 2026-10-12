import type { ConsolidatedBook } from "../../../application/consolidation"
import type { Outcome } from "../../../application/errors"
import type { BookId } from "../../../core/book/book"
import { merged, type Group } from "../../../core/report/breakdown"
import { mapOk } from "../../../core/result/result"
import { describeError } from "../../wording/errors"

/** What the books that could be read answered, a book each: a book that could not is left out, and said apart. */
export const readOf = <T>(books: readonly ConsolidatedBook<T>[]): readonly T[] => books.flatMap((each) => (each.read.ok ? [each.read.value] : []))

/** Several books' groups as one book's: the groups of one key added together. Nothing while they are awaited. */
export const mergedOf = (found: Outcome<readonly ConsolidatedBook<readonly Group[]>[]> | undefined): Outcome<readonly Group[]> | undefined =>
  found === undefined ? undefined : mapOk(found, (books) => merged(readOf(books)))

/** Why one of the books asked could not be read, in words; nothing where it was read, or was not asked. */
export const unreadIn = <T>(found: Outcome<readonly ConsolidatedBook<T>[]> | undefined, id: BookId): string | undefined => {
  const book = found?.ok === true ? found.value.find((each) => each.book.id === id) : undefined
  return book === undefined || book.read.ok ? undefined : describeError(book.read.error)
}
