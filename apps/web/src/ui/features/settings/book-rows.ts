import type { BookStanding } from "../../../application/backup"
import type { BookId, ListedBook } from "../../../core/book/book"

/** One book of the list: how it stands against its backups, and the book it may change places with — the next, where there is one. */
export interface Row {
  readonly standing: BookStanding
  readonly swapsWith: BookId | undefined
}

const idOf = (row: Row): BookId => row.standing.book.id

/** Rows as they stand, each given the next to change places with. */
const withNeighbours = (rows: readonly Omit<Row, "swapsWith">[]): readonly Row[] => rows.map((row, index) => ({ ...row, swapsWith: rows[index + 1]?.standing.book.id }))

/**
 * The books of the list as rows, in the order they are listed everywhere.
 * Each changes places with the next, a book another person let them into
 * as freely as their own: the order is the device's. A book whose standing
 * is not yet known is left out until it is.
 */
export const rowsOf = (books: readonly ListedBook[], standings: readonly BookStanding[]): readonly Row[] =>
  withNeighbours(
    books.flatMap((book) => {
      const standing = standings.find((each) => each.book.id === book.id)
      return standing === undefined ? [] : [{ standing }]
    }),
  )

/** Two books changing places, as they stood when it was asked: the upper, and the one below it. */
export interface Swap {
  readonly upper: BookId
  readonly lower: BookId
}

/** The books' ids with the two of a swap in each other's place. */
export const exchangedIn = (ids: readonly BookId[], swap: Swap): readonly BookId[] => ids.map((id) => (id === swap.upper ? swap.lower : id === swap.lower ? swap.upper : id))

/**
 * Rows in the order a person has put them, ahead of its being written:
 * the rows as read, each where `moved` has its book, and a book `moved`
 * does not know after them, as it came. Each changes places with the next
 * as they then stand. With nothing moved they are
 * the rows as read.
 */
export const placedAs = (rows: readonly Row[], moved: readonly BookId[] | undefined): readonly Row[] => {
  if (moved === undefined) return rows
  const known = moved.flatMap((id) => rows.filter((row) => idOf(row) === id))
  return withNeighbours([...known, ...rows.filter((row) => !moved.includes(idOf(row)))])
}

/** Whether the rows stand in the order of these ids, book for book. */
export const standAs = (rows: readonly Row[], ids: readonly BookId[]): boolean => rows.length === ids.length && rows.every((row, index) => idOf(row) === ids[index])

/** How a row shows a change of places: no part of one, swelling while the two still stand as they did, or settling once each stands in the other's place. */
export type Motion = "still" | "swelling" | "settling"

/** What a row of the list, as it is now shown, makes of a change of places. */
export const motionOf = (rows: readonly Row[], swap: Swap | undefined, id: BookId): Motion => {
  if (swap === undefined || (id !== swap.upper && id !== swap.lower)) return "still"
  const placeOf = (sought: BookId): number => rows.findIndex((row) => row.standing.book.id === sought)
  return placeOf(swap.upper) < placeOf(swap.lower) ? "swelling" : "settling"
}
