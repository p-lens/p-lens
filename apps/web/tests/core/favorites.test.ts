import { describe, expect, test } from "bun:test"

import { FAVORITES_LOG, favoritesOf, keptAmong, withFavorite, type FavoriteLine, type KeptInBook } from "../../src/core/favorites/favorites"
import type { BookId, MemberId } from "../../src/core/book/book"
import type { BookFiles } from "../../src/core/journal/layout"

const press = (at: string, id: string, kept: boolean, type: "formula" | "distribution" = "formula"): FavoriteLine => ({
  id: `${at}-${id}`,
  at,
  by: "local" as MemberId,
  did: kept ? "favorite-kept" : "favorite-let-go",
  target: { type, id },
})

const pressed = (...lines: readonly FavoriteLine[]): BookFiles => lines.reduce<BookFiles>(withFavorite, {})

describe("a book's favourites", () => {
  test("are what each thing's latest press says, a formula or a 設定配分 alike, and nothing in a book that never kept any", () => {
    expect([...favoritesOf({})]).toEqual([])
    const files = pressed(press("2026-10-01T10:00:00.000Z", "f1", true), press("2026-10-01T10:01:00.000Z", "d1", true, "distribution"), press("2026-10-01T10:02:00.000Z", "f2", true), press("2026-10-01T10:03:00.000Z", "f1", false))
    expect([...favoritesOf(files)].toSorted()).toEqual(["d1", "f2"])
  })

  test("are written a line a press, only ever added to, each line shaped as the activity's are: its id, when, who, what was done and to what", () => {
    const files = pressed(press("2026-10-01T10:00:00.000Z", "f1", true), press("2026-10-01T10:03:00.000Z", "f1", false))
    expect(files[FAVORITES_LOG]).toBe('{"v":1,"id":"2026-10-01T10:00:00.000Z-f1","at":"2026-10-01T10:00:00.000Z","by":"local","did":"favorite-kept","favorite":{"target":"formula","id":"f1"}}\n{"v":1,"id":"2026-10-01T10:03:00.000Z-f1","at":"2026-10-01T10:03:00.000Z","by":"local","did":"favorite-let-go","favorite":{"target":"formula","id":"f1"}}\n')
  })

  test("go by when a press was made, not where its line sits: two devices' lines come together in no order of time", () => {
    const merged = pressed(press("2026-10-02T09:00:00.000Z", "f1", false), press("2026-10-01T09:00:00.000Z", "f1", true))
    expect([...favoritesOf(merged)]).toEqual([])
    const sameMoment = pressed(press("2026-10-02T09:00:00.000Z", "f1", false), press("2026-10-02T09:00:00.000Z", "f1", true))
    expect([...favoritesOf(sameMoment)]).toEqual(["f1"])
  })

  test("pass over a line that does not read, is of another version, or says a word not known, and keep the rest", () => {
    const text = [
      "not json",
      '{"v":2,"id":"a","at":"2026-10-01T10:00:00.000Z","by":"local","did":"favorite-kept","favorite":{"target":"formula","id":"f9"}}',
      '{"v":1,"id":"b","at":"yesterday","by":"local","did":"favorite-kept","favorite":{"target":"formula","id":"f8"}}',
      '{"v":1,"id":"c","at":"2026-10-01T10:00:00.000Z","by":"local","did":"favorite-kept","favorite":{"target":"machine","id":"m1"}}',
      '{"v":1,"id":"d","at":"2026-10-01T10:00:00.000Z","by":"local","did":"favorite-pinned","favorite":{"target":"formula","id":"f7"}}',
      "",
    ].join("\n")
    const files = withFavorite({ [FAVORITES_LOG]: text }, press("2026-10-01T10:05:00.000Z", "f1", true))
    expect([...favoritesOf(files)]).toEqual(["f1"])
  })
})

const book = (id: string, kept: readonly string[]): KeptInBook => ({ bookId: id as BookId, kept: new Set(kept) })

describe("the favourites that choose among a machine's formulas", () => {
  test("are those of the first book, from the top, that keeps one of them, the books after it not asked", () => {
    const books = [book("first", ["other"]), book("second", ["b"]), book("third", ["a"])]
    expect([...keptAmong(books, ["a", "b"])]).toEqual(["b"])
  })

  test("are none where no book keeps one", () => {
    expect(keptAmong([book("first", ["other"])], ["a", "b"]).size).toBe(0)
    expect(keptAmong([], ["a"]).size).toBe(0)
  })
})
