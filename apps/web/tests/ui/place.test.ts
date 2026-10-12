import { describe, expect, test } from "bun:test"

import { focusOf, parentOf, pathOf, placeOf, type Place } from "../../src/ui/navigation/place"

const PLACES: readonly Place[] = [
  { kind: "live" },
  { kind: "live-new", game: "pachinko" },
  { kind: "live-new", game: "slot" },
  { kind: "live-play", playId: "p-1" as never },
  { kind: "live-record", playId: "p-1" as never },
  { kind: "live-cabinet", playId: "p-1" as never },
  { kind: "book", bookId: "made-up" as never },
  { kind: "book-view", bookId: "made-up" as never, view: "holdings" },
  { kind: "play", bookId: "made-up" as never, playId: "a b/c" as never },
  { kind: "play-new", bookId: "made-up" as never },
  { kind: "play-revise", bookId: "made-up" as never, playId: "p1" as never },
  { kind: "settings" },
  { kind: "settings-section", section: "appearance" },
  { kind: "settings-section", section: "backup" },
  { kind: "document", document: "terms" },
  { kind: "document", document: "privacy" },
  { kind: "book-file", bookId: "made-up" as never, path: "logs/a b.jsonl" },
  { kind: "destination", lineId: "line-1" },
]

describe("places", () => {
  test("every place is read back from the address it writes", () => {
    PLACES.forEach((place) => expect(placeOf(pathOf(place))).toEqual(place))
  })

  test("an address the app has no screen for is not found, not guessed at", () => {
    expect(placeOf("/books/made-up/nonsense")).toEqual({ kind: "not-found", path: "/books/made-up/nonsense" })
    expect(placeOf("/books/made-up/record")).toEqual({ kind: "not-found", path: "/books/made-up/record" })
    expect(placeOf("/books/made-up/plays/a/b")).toEqual({ kind: "not-found", path: "/books/made-up/plays/a/b" })
    expect(placeOf("/settings/unknown")).toEqual({ kind: "not-found", path: "/settings/unknown" })
    expect(placeOf("/books/%E0%A4%A")).toEqual({ kind: "not-found", path: "/books/%E0%A4%A" })
    expect(placeOf("/machines/m1")).toEqual({ kind: "not-found", path: "/machines/m1" })
  })

  test("a narrow window goes selection, content, detail", () => {
    expect(PLACES.map(focusOf)).toEqual(["selection", "content", "content", "content", "content", "content", "selection", "content", "detail", "content", "content", "selection", "content", "content", "content", "content", "detail", "selection"])
  })

  test("one step up from a play is its list, then the book", () => {
    const play = PLACES[8] as Place
    const list = parentOf(play)
    expect(list).toEqual({ kind: "book-view", bookId: "made-up", view: "plays" } as never)
    expect(parentOf(list as Place)).toEqual({ kind: "book", bookId: "made-up" } as never)
    expect(parentOf({ kind: "book", bookId: "made-up" as never })).toBeUndefined()
  })

  test("recording a live play steps back to the play, then to the live space", () => {
    expect(parentOf({ kind: "live-record", playId: "p-1" as never })).toEqual({ kind: "live-play", playId: "p-1" } as never)
    expect(parentOf({ kind: "live-cabinet", playId: "p-1" as never })).toEqual({ kind: "live-play", playId: "p-1" } as never)
    expect(parentOf({ kind: "live-play", playId: "p-1" as never })).toEqual({ kind: "live" })
    expect(parentOf({ kind: "live" })).toBeUndefined()
  })

  test("`new` is the page that starts a play, never a play's id", () => {
    expect(placeOf("/play/new/slot")).toEqual({ kind: "live-new", game: "slot" })
    expect(placeOf("/play/new")).toEqual({ kind: "not-found", path: "/play/new" })
    expect(placeOf("/play/new/record")).toEqual({ kind: "not-found", path: "/play/new/record" })
  })
})

describe("adding a play by hand", () => {
  test("is under the book's plays, and steps back to them", () => {
    expect(placeOf("/books/made-up/plays/new")).toEqual({ kind: "play-new", bookId: "made-up" } as never)
    expect(parentOf({ kind: "play-new", bookId: "made-up" as never })).toEqual({ kind: "book-view", bookId: "made-up", view: "plays" } as never)
    expect(focusOf({ kind: "play-new", bookId: "made-up" as never })).toBe("content")
    expect(placeOf("/books/made-up/plays/p1/revise")).toEqual({ kind: "play-revise", bookId: "made-up", playId: "p1" } as never)
    expect(parentOf({ kind: "play-revise", bookId: "made-up" as never, playId: "p1" as never })).toEqual({ kind: "play", bookId: "made-up", playId: "p1" } as never)
    expect(placeOf("/books/made-up/plays/p1/elsewhere")).toEqual({ kind: "not-found", path: "/books/made-up/plays/p1/elsewhere" })
  })
})

describe("a book's breakdown", () => {
  test("is by what its address names, by machine where it names nothing, and steps back to the book", () => {
    expect(placeOf("/books/made-up/breakdown/weekday")).toEqual({ kind: "book-breakdown", bookId: "made-up", by: "weekday" } as never)
    expect(placeOf("/books/made-up/breakdown")).toEqual({ kind: "book-breakdown", bookId: "made-up", by: "machine" } as never)
    expect(pathOf({ kind: "book-breakdown", bookId: "made-up" as never, by: "parlor" })).toBe("/books/made-up/breakdown/parlor")
    expect(parentOf({ kind: "book-breakdown", bookId: "made-up" as never, by: "parlor" })).toEqual({ kind: "book", bookId: "made-up" } as never)
    expect(placeOf("/books/made-up/breakdown/colour")).toEqual({ kind: "not-found", path: "/books/made-up/breakdown/colour" })
  })
})

describe("the consolidation", () => {
  test("is a space with a list of its own, and its breakdown of every book or the books its address names, by book where it names no grouping", () => {
    expect(placeOf("/consolidated")).toEqual({ kind: "consolidated" })
    expect(focusOf({ kind: "consolidated" })).toBe("selection")
    expect(parentOf({ kind: "consolidated" })).toBeUndefined()
    expect(placeOf("/consolidated/breakdown")).toEqual({ kind: "consolidated-breakdown", by: "book", bookIds: undefined })
    expect(placeOf("/consolidated/breakdown/machine/a%2Cb")).toEqual({ kind: "consolidated-breakdown", by: "machine", bookIds: ["a", "b"] } as never)
    expect(pathOf({ kind: "consolidated-breakdown", by: "weekday", bookIds: ["a", "b"] as never })).toBe("/consolidated/breakdown/weekday/a%2Cb")
    expect(pathOf({ kind: "consolidated-breakdown", by: "book", bookIds: undefined })).toBe("/consolidated/breakdown/book")
    expect(parentOf({ kind: "consolidated-breakdown", by: "book", bookIds: undefined })).toEqual({ kind: "consolidated" })
    expect(focusOf({ kind: "consolidated-breakdown", by: "book", bookIds: undefined })).toBe("content")
    expect(placeOf("/consolidated/elsewhere")).toEqual({ kind: "not-found", path: "/consolidated/elsewhere" })
  })
})

describe("a book's files", () => {
  test("are a view of the book, and one file steps back to it", () => {
    expect(placeOf("/books/made-up/files")).toEqual({ kind: "book-view", bookId: "made-up", view: "files" } as never)
    expect(placeOf("/books/made-up/files/logs%2Fx.jsonl")).toEqual({ kind: "book-file", bookId: "made-up", path: "logs/x.jsonl" } as never)
    expect(parentOf({ kind: "book-file", bookId: "made-up" as never, path: "main.journal" })).toEqual({ kind: "book-view", bookId: "made-up", view: "files" } as never)
  })
})

describe("coming back from a submission", () => {
  test("has its own place under starting a play", () => {
    expect(placeOf("/parlors/submitted")).toEqual({ kind: "parlor-submitted" })
    expect(parentOf({ kind: "parlor-submitted" })).toEqual({ kind: "live-new", game: "pachinko" })
  })
})
