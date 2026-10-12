import type { BookStanding } from "../../../application/backup"
import { roleIn, type BookId, type ListedBook, type MemberId } from "../../../core/book/book"

/** One book of the list: how it stands against its backups, and the book it may change places with — the next of the person's own, where there is one. */
export interface Row {
  readonly standing: BookStanding
  readonly swapsWith: BookId | undefined
}

/**
 * The books of the list as rows, in the order they are listed everywhere.
 * A person's own books change places among themselves, each with the next
 * of them; a book another person let them into does not, its place being
 * its owner's. A book whose standing is not yet known is left out until
 * it is.
 */
export const rowsOf = (books: readonly ListedBook[], standings: readonly BookStanding[], member: MemberId): readonly Row[] => {
  const own = books.filter((book) => roleIn(book, member) === "owner").map((book) => book.id)
  return books.flatMap((book) => {
    const standing = standings.find((each) => each.book.id === book.id)
    return standing === undefined ? [] : [{ standing, swapsWith: own.includes(book.id) ? own[own.indexOf(book.id) + 1] : undefined }]
  })
}

/** Two books changing places, as they stood when it was asked: the upper, and the one below it. */
export interface Swap {
  readonly upper: BookId
  readonly lower: BookId
}

/** How a row shows a change of places: no part of one, swelling while the two still stand as they did, or settling once each stands in the other's place. */
export type Motion = "still" | "swelling" | "settling"

/** What a row of the list, as it is now shown, makes of a change of places. */
export const motionOf = (rows: readonly Row[], swap: Swap | undefined, id: BookId): Motion => {
  if (swap === undefined || (id !== swap.upper && id !== swap.lower)) return "still"
  const placeOf = (sought: BookId): number => rows.findIndex((row) => row.standing.book.id === sought)
  return placeOf(swap.upper) < placeOf(swap.lower) ? "swelling" : "settling"
}
