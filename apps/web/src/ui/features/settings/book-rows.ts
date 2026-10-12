import type { BookStanding } from "../../../application/backup"
import { roleIn, type ListedBook, type MemberId } from "../../../core/book/book"
import type { Direction } from "../../../core/book/order"

/** One book of the list: how it stands against its backups, and the ways it may move from where it is. */
export interface Row {
  readonly standing: BookStanding
  readonly moves: readonly Direction[]
}

/** The ways the book at a place among a person's own may move: towards the head unless it is the first, towards the foot unless the last. */
const movesAt = (index: number, count: number): readonly Direction[] => [...(index > 0 ? (["earlier"] as const) : []), ...(index < count - 1 ? (["later"] as const) : [])]

/**
 * The books of the list as rows, in the order they are listed everywhere.
 * A person's own books move among themselves; a book another person let
 * them into does not move, its place being its owner's. A book whose
 * standing is not yet known is left out until it is.
 */
export const rowsOf = (books: readonly ListedBook[], standings: readonly BookStanding[], member: MemberId): readonly Row[] => {
  const own = books.filter((book) => roleIn(book, member) === "owner").map((book) => book.id)
  return books.flatMap((book) => {
    const standing = standings.find((each) => each.book.id === book.id)
    return standing === undefined ? [] : [{ standing, moves: own.includes(book.id) ? movesAt(own.indexOf(book.id), own.length) : [] }]
  })
}
