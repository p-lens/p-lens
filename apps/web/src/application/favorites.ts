import type { BookId } from "../core/book/book"
import { favoritesOf, withFavorite, type FavoriteLine, type KeptInBook } from "../core/favorites/favorites"
import { Ok, mapOk } from "../core/result/result"
import type { Catalog } from "../catalog/port/catalog"
import type { BookSession } from "./book-session"
import { markTarget } from "./catalog"
import type { VoterOf } from "./marks"
import type { Outcome } from "./errors"

/** The formulas and 設定配分 a book keeps handy, as the book itself says. */
export const loadFavorites = (session: BookSession, bookId: BookId): Promise<Outcome<ReadonlySet<string>>> =>
  session.read(bookId, async (_journal, stored) => Ok(favoritesOf(stored.files)))

/**
 * What each of the device's books keeps as favourites, in the books' own
 * order. A book that cannot be read is left out: it has no say in what is
 * chosen, and the rest still do.
 */
export const loadFavoritesOfBooks = async (session: BookSession): Promise<Outcome<readonly KeptInBook[]>> => {
  const books = await session.books()
  if (!books.ok) return books
  const read = await Promise.all(books.value.map(async (book) => mapOk(await loadFavorites(session, book.id), (kept): KeptInBook => ({ bookId: book.id, kept }))))
  return Ok(read.flatMap((found) => (found.ok ? [found.value] : [])))
}

/**
 * A press of the heart, as the line it is: written in the book, then told to the shared
 * catalog, which counts it. The catalog is told here and nowhere else —
 * a book's favourites read on another device, from a backup or off its
 * line are only read, and never sent again.
 */
export const pressFavorite = async (session: BookSession, catalog: Catalog, voterOf: VoterOf, bookId: BookId, press: FavoriteLine): Promise<Outcome<void>> => {
  const written = await session.write(bookId, async (_journal, stored) =>
    Ok({
      files: withFavorite(stored.files, press),
      intent: { type: press.did, target: press.target.type, id: press.target.id },
    }),
  )
  return written.ok ? markTarget(catalog, press.target, "favorite", press.did === "favorite-kept", await voterOf(bookId, press.by)) : written
}
