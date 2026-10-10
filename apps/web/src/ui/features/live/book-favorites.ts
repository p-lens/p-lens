import { createMemo, createResource } from "solid-js"

import type { ApplicationError } from "../../../application/errors"
import { loadFavoritesOfBooks, pressFavorite } from "../../../application/favorites"
import type { CatalogTarget } from "../../../core/catalog/catalog"
import { keptAmong, type KeptInBook } from "../../../core/favorites/favorites"
import { useApp } from "../../context"
import { useBookInUse } from "./book-in-use"

export interface BookFavorites {
  /**
   * The favourites that choose among these formulas or 設定配分: those of
   * the first of the device's books, from the top, that keeps any of them.
   * Undefined until the books have been read, so nothing is chosen from a guess.
   */
  readonly keptAmong: (ids: readonly string[]) => ReadonlySet<string> | undefined
  /** Whether the book in use keeps this one; not, while the books are still being read. */
  readonly keeps: (id: string) => boolean
  /** A press of the heart on a formula or a 設定配分: kept if it was not, let go if it was. */
  readonly press: (target: CatalogTarget, failed: (error: ApplicationError) => void) => void
}

const NONE: ReadonlySet<string> = new Set()

/**
 * The favourites of the device's books, for the screens that show a heart
 * or open a machine with one. A heart shows what the book in use keeps and
 * a press is written there; what a machine opens with is asked of every
 * book from the top, the first to keep one of its formulas having the say.
 * With no book this member may write, a press is refused as any write
 * would be.
 */
export const useBookFavorites = (): BookFavorites => {
  const app = useApp()
  const book = useBookInUse()
  const [read] = createResource(() => app.revision(), () => loadFavoritesOfBooks(app.services.session))
  const books = createMemo((): readonly KeptInBook[] | undefined => {
    const found = read()
    return found === undefined ? undefined : found.ok ? found.value : []
  })
  const own = createMemo((): ReadonlySet<string> => {
    const id = book()?.bookId
    return books()?.find((kept) => kept.bookId === id)?.kept ?? NONE
  })
  const keeps = (id: string): boolean => own().has(id)
  return {
    keptAmong: (ids) => {
      const all = books()
      return all === undefined ? undefined : keptAmong(all, ids)
    },
    keeps,
    press: (target, failed) => {
      const id = book()?.bookId
      if (id === undefined) {
        failed({ type: "forbidden", capability: "write" })
        return
      }
      void pressFavorite(app.services.session, app.services.catalog, app.services.voter, id, {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        by: app.services.member,
        did: keeps(target.id) ? "favorite-let-go" : "favorite-kept",
        target,
      }).then((done) => {
        if (!done.ok) {
          failed(done.error)
          return
        }
        app.wrote()
        app.delivery.refresh()
      })
    },
  }
}
