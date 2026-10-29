import { describe, expect, test } from "bun:test"

import { consolidatedBooksOf, focusOf, inConsolidation, parentOf, pathOf, placeOf, screenOf, type Place } from "../../src/ui/navigation/place"
import type { BookId } from "../../src/core/book/book"

const PLACES: readonly Place[] = [
  { kind: "live" },
  { kind: "live-new", game: "pachinko" },
  { kind: "live-new", game: "pachislot" },
  { kind: "live-play", playId: "p-1" as never },
  { kind: "live-record", playId: "p-1" as never },
  { kind: "live-cabinet", playId: "p-1" as never },
  { kind: "book", bookId: "made-up" as never },
  { kind: "book-view", bookId: "made-up" as never, view: "holdings" },
  { kind: "tally", bookId: "made-up" as never, playId: "a b/c" as never },
  { kind: "tally-new", bookId: "made-up" as never },
  { kind: "tally-days", bookId: "made-up" as never },
  { kind: "tally-revise", bookId: "made-up" as never, playId: "p1" as never },
  { kind: "settings" },
  { kind: "settings-section", section: "appearance" },
  { kind: "settings-section", section: "backup" },
  { kind: "document", document: "terms" },
  { kind: "document", document: "privacy" },
  { kind: "book-file", bookId: "made-up" as never, path: "logs/a b.jsonl" },
  { kind: "passbook", bookId: "made-up" as never, account: "資産:貯玉:東京皇国/第8支店:4円" },
  { kind: "parlor-passbook", bookId: "made-up" as never, parlorName: "東京皇国/第8支店" },
  { kind: "destination", lineId: "line-1" },
  { kind: "huddle" },
  { kind: "huddle-total" },
  { kind: "huddle-settlement" },
  { kind: "huddle-play", member: "m 1/x", playId: "p-1" as never },
]

describe("places", () => {
  test("every place is read back from the address it writes", () => {
    PLACES.forEach((place) => expect(placeOf(pathOf(place))).toEqual(place))
  })

  test("an address the app has no screen for is not found, not guessed at", () => {
    expect(placeOf("/books/made-up/nonsense")).toEqual({ kind: "not-found", path: "/books/made-up/nonsense" })
    expect(placeOf("/books/made-up/record")).toEqual({ kind: "not-found", path: "/books/made-up/record" })
    expect(placeOf("/books/made-up/tallies/a/b")).toEqual({ kind: "not-found", path: "/books/made-up/tallies/a/b" })
    expect(placeOf("/settings/unknown")).toEqual({ kind: "not-found", path: "/settings/unknown" })
    expect(placeOf("/books/%E0%A4%A")).toEqual({ kind: "not-found", path: "/books/%E0%A4%A" })
    expect(placeOf("/machines/m1")).toEqual({ kind: "not-found", path: "/machines/m1" })
  })

  test("a narrow window goes selection, content, detail", () => {
    expect(PLACES.map(focusOf)).toEqual(["selection", "content", "content", "content", "content", "content", "selection", "content", "detail", "content", "content", "content", "selection", "content", "content", "content", "content", "detail", "detail", "detail", "selection", "selection", "content", "content", "content"])
  })

  test("one step up from a tally is its list, then the book", () => {
    const play = PLACES[8] as Place
    const list = parentOf(play)
    expect(list).toEqual({ kind: "book-view", bookId: "made-up", view: "tallies" } as never)
    expect(parentOf(list as Place)).toEqual({ kind: "book", bookId: "made-up" } as never)
    expect(parentOf({ kind: "book", bookId: "made-up" as never })).toBeUndefined()
  })

  test("recording a live play steps back to the play, then to the live space", () => {
    expect(parentOf({ kind: "live-record", playId: "p-1" as never })).toEqual({ kind: "live-play", playId: "p-1" } as never)
    expect(parentOf({ kind: "live-cabinet", playId: "p-1" as never })).toEqual({ kind: "live-play", playId: "p-1" } as never)
    expect(parentOf({ kind: "live-play", playId: "p-1" as never })).toEqual({ kind: "live" })
    expect(parentOf({ kind: "huddle-play", member: "m-1", playId: "p-1" as never })).toEqual({ kind: "huddle" })
    expect(parentOf({ kind: "huddle-total" })).toEqual({ kind: "huddle" })
    expect(parentOf({ kind: "huddle-settlement" })).toEqual({ kind: "huddle-total" })
    expect(parentOf({ kind: "live" })).toBeUndefined()
  })

  test("`new` is the page that starts a play, never a play's id", () => {
    expect(placeOf("/play/new/pachislot")).toEqual({ kind: "live-new", game: "pachislot" })
    expect(placeOf("/play/new")).toEqual({ kind: "not-found", path: "/play/new" })
    expect(placeOf("/play/new/record")).toEqual({ kind: "not-found", path: "/play/new/record" })
  })
})

describe("the screen a place is drawn on", () => {
  test("is the same however a view is narrowed, and another for another view", () => {
    const book = "b1" as BookId
    expect(screenOf({ kind: "book-view", bookId: book, view: "result-calendar", senders: ["s1"] })).toBe(screenOf({ kind: "book-view", bookId: book, view: "result-calendar", senders: undefined }))
    expect(screenOf({ kind: "book-view", bookId: book, view: "holdings", parlors: [] })).toBe(screenOf({ kind: "book-view", bookId: book, view: "holdings", parlors: ["店"] }))
    expect(screenOf({ kind: "consolidated-breakdown", by: "machine", bookIds: [book] })).toBe(screenOf({ kind: "consolidated-breakdown", by: "machine", bookIds: undefined }))
    expect(screenOf({ kind: "consolidated-breakdown", by: "machine", bookIds: undefined })).not.toBe(screenOf({ kind: "consolidated-breakdown", by: "parlor", bookIds: undefined }))
    expect(screenOf({ kind: "book-view", bookId: book, view: "holdings", parlors: undefined })).not.toBe(screenOf({ kind: "book-view", bookId: "b2" as BookId, view: "holdings", parlors: undefined }))
  })
})

describe("a book's narrowed views", () => {
  test("name their parlors and senders in a last segment, each encoded on its own, a comma alone for none", () => {
    const parlors: Place = { kind: "book-view", bookId: "b" as never, view: "holdings", parlors: ["A,店", "B 店"] }
    expect(pathOf(parlors)).toBe("/books/b/holdings/A%252C%25E5%25BA%2597%2CB%2520%25E5%25BA%2597")
    expect(placeOf(pathOf(parlors))).toEqual(parlors)
    const senders: Place = { kind: "book-view", bookId: "b" as never, view: "result-calendar", senders: ["unsent", "grant-1"] }
    expect(pathOf(senders)).toBe("/books/b/result-calendar/unsent%2Cgrant-1")
    expect(placeOf(pathOf(senders))).toEqual(senders)
    const none: Place = { kind: "book-view", bookId: "b" as never, view: "result-calendar", senders: [] }
    expect(pathOf(none)).toBe("/books/b/result-calendar/%2C")
    expect(placeOf(pathOf(none))).toEqual(none)
    expect(placeOf("/books/b/holdings")).toEqual({ kind: "book-view", bookId: "b", view: "holdings" } as never)
    expect(placeOf("/books/b/activity/x")).toEqual({ kind: "not-found", path: "/books/b/activity/x" })
  })

  test("a consolidation of no books at all is written down as one", () => {
    expect(pathOf({ kind: "consolidated-holdings", bookIds: [] })).toBe("/consolidated/holdings/%2C")
    expect(placeOf("/consolidated/holdings/%2C")).toEqual({ kind: "consolidated-holdings", bookIds: [] })
  })
})

describe("adding a tally by hand", () => {
  test("is under the book's tallies, and steps back to them", () => {
    expect(placeOf("/books/made-up/tallies/new")).toEqual({ kind: "tally-new", bookId: "made-up" } as never)
    expect(parentOf({ kind: "tally-new", bookId: "made-up" as never })).toEqual({ kind: "book-view", bookId: "made-up", view: "tallies" } as never)
    expect(focusOf({ kind: "tally-new", bookId: "made-up" as never })).toBe("content")
    expect(placeOf("/books/made-up/tallies/days")).toEqual({ kind: "tally-days", bookId: "made-up" } as never)
    expect(parentOf({ kind: "tally-days", bookId: "made-up" as never })).toEqual({ kind: "book-view", bookId: "made-up", view: "result-calendar" } as never)
    expect(placeOf("/books/made-up/tallies/p1/revise")).toEqual({ kind: "tally-revise", bookId: "made-up", playId: "p1" } as never)
    expect(parentOf({ kind: "tally-revise", bookId: "made-up" as never, playId: "p1" as never })).toEqual({ kind: "tally", bookId: "made-up", playId: "p1" } as never)
    expect(placeOf("/books/made-up/tallies/p1/elsewhere")).toEqual({ kind: "not-found", path: "/books/made-up/tallies/p1/elsewhere" })
  })
})

describe("a book's breakdown", () => {
  test("is by what its address names, taken as one where it names nothing, and steps back to the book", () => {
    expect(placeOf("/books/made-up/breakdown/weekday")).toEqual({ kind: "book-breakdown", bookId: "made-up", by: "weekday" } as never)
    expect(placeOf("/books/made-up/breakdown")).toEqual({ kind: "book-breakdown", bookId: "made-up", by: "overall" } as never)
    expect(placeOf("/books/made-up/breakdown/overall")).toEqual({ kind: "book-breakdown", bookId: "made-up", by: "overall" } as never)
    expect(pathOf({ kind: "book-breakdown", bookId: "made-up" as never, by: "parlor" })).toBe("/books/made-up/breakdown/parlor")
    expect(parentOf({ kind: "book-breakdown", bookId: "made-up" as never, by: "parlor" })).toEqual({ kind: "book", bookId: "made-up" } as never)
    expect(placeOf("/books/made-up/breakdown/colour")).toEqual({ kind: "not-found", path: "/books/made-up/breakdown/colour" })
  })
})

describe("the consolidation", () => {
  test("is a space with a list of its own, and its breakdown of every book or the books its address names, taken as one where it names no grouping", () => {
    expect(placeOf("/consolidated")).toEqual({ kind: "consolidated" })
    expect(focusOf({ kind: "consolidated" })).toBe("selection")
    expect(parentOf({ kind: "consolidated" })).toBeUndefined()
    expect(placeOf("/consolidated/breakdown")).toEqual({ kind: "consolidated-breakdown", by: "overall", bookIds: undefined })
    expect(placeOf("/consolidated/breakdown/machine/a%2Cb")).toEqual({ kind: "consolidated-breakdown", by: "machine", bookIds: ["a", "b"] } as never)
    expect(pathOf({ kind: "consolidated-breakdown", by: "weekday", bookIds: ["a", "b"] as never })).toBe("/consolidated/breakdown/weekday/a%2Cb")
    expect(pathOf({ kind: "consolidated-breakdown", by: "book", bookIds: undefined })).toBe("/consolidated/breakdown/book")
    expect(parentOf({ kind: "consolidated-breakdown", by: "book", bookIds: undefined })).toEqual({ kind: "consolidated" })
    expect(focusOf({ kind: "consolidated-breakdown", by: "book", bookIds: undefined })).toBe("content")
    expect(placeOf("/consolidated/elsewhere")).toEqual({ kind: "not-found", path: "/consolidated/elsewhere" })
  })

  test("has the books' savings and their calendar beside it, each of every book or of the books its address names", () => {
    expect(placeOf("/consolidated/holdings")).toEqual({ kind: "consolidated-holdings", bookIds: undefined })
    expect(placeOf("/consolidated/holdings/a%2Cb")).toEqual({ kind: "consolidated-holdings", bookIds: ["a", "b"] } as never)
    expect(pathOf({ kind: "consolidated-holdings", bookIds: ["a", "b"] as never })).toBe("/consolidated/holdings/a%2Cb")
    expect(pathOf({ kind: "consolidated-holdings", bookIds: undefined })).toBe("/consolidated/holdings")
    expect(placeOf("/consolidated/result-calendar")).toEqual({ kind: "consolidated-result-calendar", bookIds: undefined })
    expect(placeOf("/consolidated/result-calendar/a")).toEqual({ kind: "consolidated-result-calendar", bookIds: ["a"] } as never)
    expect(pathOf({ kind: "consolidated-result-calendar", bookIds: ["a"] as never })).toBe("/consolidated/result-calendar/a")
    expect(placeOf("/consolidated/holdings/a/b")).toEqual({ kind: "not-found", path: "/consolidated/holdings/a/b" })
    const views = [{ kind: "consolidated-holdings", bookIds: undefined }, { kind: "consolidated-result-calendar", bookIds: undefined }] as const
    expect(views.map(parentOf)).toEqual([{ kind: "consolidated" }, { kind: "consolidated" }])
    expect(views.map(focusOf)).toEqual(["content", "content"])
    expect([...views, { kind: "consolidated" } as const].map(inConsolidation)).toEqual([true, true, true])
    expect(inConsolidation({ kind: "settings" })).toBe(false)
    expect(consolidatedBooksOf({ kind: "consolidated-holdings", bookIds: ["a"] as never })).toEqual(["a"] as never)
    expect(consolidatedBooksOf({ kind: "consolidated" })).toBeUndefined()
  })
})

describe("a book's files", () => {
  test("are a view of the book, and one file steps back to it", () => {
    expect(placeOf("/books/made-up/files")).toEqual({ kind: "book-view", bookId: "made-up", view: "files" } as never)
    expect(placeOf("/books/made-up/files/logs%2Fx.jsonl")).toEqual({ kind: "book-file", bookId: "made-up", path: "logs/x.jsonl" } as never)
    expect(parentOf({ kind: "book-file", bookId: "made-up" as never, path: "main.journal" })).toEqual({ kind: "book-view", bookId: "made-up", view: "files" } as never)
  })
})

describe("a pool's passbook", () => {
  test("is shown beside the book's savings, and steps back to them", () => {
    expect(placeOf("/books/made-up/passbooks/%E8%B3%87%E7%94%A3%3A%E8%B2%AF%E7%8E%89%3A%E6%9D%B1%E4%BA%AC%E7%9A%87%E5%9B%BD%E7%AC%AC8%E6%94%AF%E5%BA%97%3A4%E5%86%86")).toEqual({ kind: "passbook", bookId: "made-up", account: "資産:貯玉:東京皇国第8支店:4円" } as never)
    expect(focusOf({ kind: "passbook", bookId: "made-up" as never, account: "資産:貯玉:東京皇国第8支店:4円" })).toBe("detail")
    expect(parentOf({ kind: "passbook", bookId: "made-up" as never, account: "資産:貯玉:東京皇国第8支店:4円" })).toEqual({ kind: "book-view", bookId: "made-up", view: "holdings" } as never)
    expect(parentOf({ kind: "parlor-passbook", bookId: "made-up" as never, parlorName: "東京皇国第8支店" })).toEqual({ kind: "book-view", bookId: "made-up", view: "holdings" } as never)
  })
})

describe("coming back from a submission", () => {
  test("has its own place under starting a play", () => {
    expect(placeOf("/parlors/submitted")).toEqual({ kind: "parlor-submitted" })
    expect(parentOf({ kind: "parlor-submitted" })).toEqual({ kind: "live-new", game: "pachinko" })
  })
})

describe("the odd-prize calculator", () => {
  test("is a space with its two games listed beside it, each a step below it", () => {
    expect(placeOf("/odd-prize-calculator")).toEqual({ kind: "odd-prize-calculator" })
    expect(placeOf("/odd-prize-calculator/pachinko")).toEqual({ kind: "odd-prize-calculator-game", game: "pachinko" })
    expect(placeOf("/odd-prize-calculator/pachislot")).toEqual({ kind: "odd-prize-calculator-game", game: "pachislot" })
    expect(placeOf("/odd-prize-calculator/mahjong")).toEqual({ kind: "not-found", path: "/odd-prize-calculator/mahjong" })
    expect(focusOf({ kind: "odd-prize-calculator" })).toBe("selection")
    expect(focusOf({ kind: "odd-prize-calculator-game", game: "pachislot" })).toBe("content")
    expect(parentOf({ kind: "odd-prize-calculator-game", game: "pachislot" })).toEqual({ kind: "odd-prize-calculator" })
    expect(parentOf({ kind: "odd-prize-calculator" })).toBeUndefined()
  })
})
