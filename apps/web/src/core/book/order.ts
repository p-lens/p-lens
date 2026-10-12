import type { BookId } from "./book"

/** A book and the place its settings give it, if they give one. */
export interface Placed {
  readonly id: BookId
  readonly order: number | undefined
}

/**
 * Books in the order they are listed everywhere: those with a place,
 * lowest first, then those with none, as they came. Two with one place
 * stay as they came too.
 */
export const inOrder = <B extends { readonly order: number | undefined }>(books: readonly B[]): readonly B[] => {
  const placed = books.filter((book) => book.order !== undefined).toSorted((left, right) => (left.order ?? 0) - (right.order ?? 0))
  return [...placed, ...books.filter((book) => book.order === undefined)]
}

/** A place to be written into a book. */
export interface Placing {
  readonly id: BookId
  readonly order: number
}

const exchanged = <T>(items: readonly T[], from: number, to: number): readonly T[] => items.map((item, index) => (index === from ? (items[to] as T) : index === to ? (items[from] as T) : item))

/**
 * The places to write so that one book of a list, given as it now stands,
 * changes places with the one after it: none where it is the last, or is
 * not in the list. The books are simply numbered from one as they then stand, and
 * the places returned are those that differ from what the books have —
 * every book the first time any two are swapped, the two that changed places
 * after that. A person keeps a handful of books, so nothing cleverer is
 * wanted.
 */
export const swappedWithNext = (books: readonly Placed[], id: BookId): readonly Placing[] => {
  const from = books.findIndex((book) => book.id === id)
  if (from === -1 || from + 1 >= books.length) return []
  return exchanged(books, from, from + 1)
    .map((book, index): Placing => ({ id: book.id, order: index + 1 }))
    .filter((placing) => books.find((book) => book.id === placing.id)?.order !== placing.order)
}
