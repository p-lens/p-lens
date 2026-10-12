import { describe, expect, test } from "bun:test"

import type { BookId } from "../../../src/core/book/book"
import { inOrder, swappedWithNext, type Placed } from "../../../src/core/book/order"
import { BOOK_SETTINGS_FILE, bookSettingsOf, withBusinessDayTurn, withOrder } from "../../../src/core/book/settings"

const book = (id: string, order?: number): Placed => ({ id: id as BookId, order })

const ids = (books: readonly Placed[]): readonly string[] => books.map((each) => each.id)

/** A list as it stands once the places a swap gives have been written into its books. */
const after = (books: readonly Placed[], id: string): readonly Placed[] => {
  const placings = swappedWithNext(books, id as BookId)
  return inOrder(books.map((each) => ({ ...each, order: placings.find((placing) => placing.id === each.id)?.order ?? each.order })))
}

describe("the order books are listed in", () => {
  test("is by the place each was given, then those given none as they came", () => {
    expect(ids(inOrder([book("c"), book("b", 2), book("d"), book("a", 1)]))).toEqual(["a", "b", "c", "d"])
    expect(ids(inOrder([book("x"), book("y")]))).toEqual(["x", "y"])
    expect(ids(inOrder([book("p", 1), book("q", 1)]))).toEqual(["p", "q"])
  })
})

describe("swapping a book with the one after it", () => {
  const UNPLACED = [book("a"), book("b"), book("c")]
  const PLACED = [book("a", 1), book("b", 2), book("c", 3)]

  test("numbers every book the first time any two are swapped", () => {
    expect(swappedWithNext(UNPLACED, "b" as BookId)).toEqual([{ id: "a", order: 1 }, { id: "c", order: 2 }, { id: "b", order: 3 }] as never)
    expect(ids(after(UNPLACED, "b"))).toEqual(["a", "c", "b"])
  })

  test("writes only the two that changed places once all are numbered", () => {
    expect(swappedWithNext(PLACED, "a" as BookId)).toEqual([{ id: "b", order: 1 }, { id: "a", order: 2 }] as never)
    expect(ids(after(PLACED, "a"))).toEqual(["b", "a", "c"])
    expect(ids(after(PLACED, "b"))).toEqual(["a", "c", "b"])
  })

  test("writes nothing for the last book, or for a book not in the list", () => {
    expect(swappedWithNext(PLACED, "c" as BookId)).toEqual([])
    expect(swappedWithNext(PLACED, "z" as BookId)).toEqual([])
    expect(swappedWithNext([book("only")], "only" as BookId)).toEqual([])
  })

  test("puts right whatever places the books had, gaps and twins and a book never placed", () => {
    const odd = inOrder([book("a", 5), book("b", 5), book("c", 900), book("d")])
    expect(ids(after(odd, "c"))).toEqual(["a", "b", "d", "c"])
    expect(after(odd, "c").map((each) => each.order)).toEqual([1, 2, 3, 4])
  })

  test("carried through swap after swap, always leaves the list as it was asked for", () => {
    const start = [book("a"), book("b"), book("c"), book("d")]
    const walked = (["a", "a", "d", "b", "c", "c", "a", "b"] as const).reduce<readonly Placed[]>(after, start)
    expect(new Set(walked.map((each) => each.order)).size).toBe(4)
    expect(ids(walked).toSorted()).toEqual(["a", "b", "c", "d"])
    expect(walked.map((each) => each.order)).toEqual([1, 2, 3, 4])
  })
})

describe("a book's settings", () => {
  test("are a file of the book's, read for the place it was given", () => {
    expect(BOOK_SETTINGS_FILE).toBe("settings.json")
    expect(bookSettingsOf('{\n  "order": 3\n}\n')).toEqual({ order: 3, businessDayTurn: undefined })
  })

  test("say nothing where there is no file, or it does not read, or the place is no whole number", () => {
    expect(bookSettingsOf(undefined)).toEqual({ order: undefined, businessDayTurn: undefined })
    expect(bookSettingsOf("")).toEqual({ order: undefined, businessDayTurn: undefined })
    expect(bookSettingsOf('{\n  "order": 1\n}\n{\n  "order": 2\n}\n')).toEqual({ order: undefined, businessDayTurn: undefined })
    expect(bookSettingsOf('{"order":"1"}')).toEqual({ order: undefined, businessDayTurn: undefined })
    expect(bookSettingsOf('{"order":1.5}')).toEqual({ order: undefined, businessDayTurn: undefined })
    expect(bookSettingsOf("[1]")).toEqual({ order: undefined, businessDayTurn: undefined })
  })

  test("say the hour a business day turns over at where one that can be is written, beside the place", () => {
    expect(bookSettingsOf('{"order":3,"businessDayTurn":7}')).toEqual({ order: 3, businessDayTurn: 7 })
    expect(bookSettingsOf('{"businessDayTurn":0}').businessDayTurn).toBe(0)
    expect(bookSettingsOf('{"businessDayTurn":10}').businessDayTurn).toBeUndefined()
    expect(bookSettingsOf('{"businessDayTurn":"5"}').businessDayTurn).toBeUndefined()
    expect(withBusinessDayTurn('{"order":3}', 7)).toBe('{\n  "order": 3,\n  "businessDayTurn": 7\n}\n')
    expect(withOrder('{"order":3,"businessDayTurn":7}', 1)).toBe('{\n  "order": 1,\n  "businessDayTurn": 7\n}\n')
  })

  test("are written a field to a line, keeping what a later version put there, and whole again over a file that did not read", () => {
    expect(withOrder(undefined, 2)).toBe('{\n  "order": 2\n}\n')
    expect(withOrder('{"folder":"勝負用","order":9}', 2)).toBe('{\n  "folder": "勝負用",\n  "order": 2\n}\n')
    expect(withOrder("{{", 2)).toBe('{\n  "order": 2\n}\n')
  })
})
