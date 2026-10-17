import { describe, expect, test } from "bun:test"

import type { BookId } from "../../../src/core/book/book"
import { inOrder, swappedWithNext, type Placed } from "../../../src/core/book/order"
import { BOOK_SETTINGS_FILE, bookSettingsOf, withBusinessDayTurn, withInferenceTerms, withOrder, withPresses } from "../../../src/core/book/settings"

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
  const unreadable = { ok: false, error: { type: "settings-unreadable" } } as const

  test("are a file of the book's, read for the place it was given", () => {
    expect(BOOK_SETTINGS_FILE).toBe("settings.json")
    expect(bookSettingsOf('{\n  "order": 3\n}\n')).toEqual({ ok: true, value: { order: 3, businessDayTurn: undefined, presses: {}, inferenceTerms: {} } })
  })

  test("say nothing where there is no file or it is empty, and read two run together as the later says", () => {
    expect(bookSettingsOf(undefined)).toEqual({ ok: true, value: { order: undefined, businessDayTurn: undefined, presses: {}, inferenceTerms: {} } })
    expect(bookSettingsOf("")).toEqual({ ok: true, value: { order: undefined, businessDayTurn: undefined, presses: {}, inferenceTerms: {} } })
    expect(bookSettingsOf('{\n  "order": 1\n}\n{\n  "order": 2,\n  "businessDayTurn": 6\n}\n')).toEqual({ ok: true, value: { order: 2, businessDayTurn: 6, presses: {}, inferenceTerms: {} } })
  })

  test("do not read where the file is no object, or a field it has does not read as this app writes it", () => {
    expect(bookSettingsOf("{{")).toEqual(unreadable)
    expect(bookSettingsOf('{"order":1,}')).toEqual(unreadable)
    expect(bookSettingsOf("[1]")).toEqual(unreadable)
    expect(bookSettingsOf('{"order":"1"}')).toEqual(unreadable)
    expect(bookSettingsOf('{"order":1.5}')).toEqual(unreadable)
    expect(bookSettingsOf('{"businessDayTurn":10}')).toEqual(unreadable)
    expect(bookSettingsOf('{"businessDayTurn":"5"}')).toEqual(unreadable)
  })

  test("keep what a press adds at each corner, one corner written without touching another", () => {
    const first = withPresses('{"order":3}', "4円パチ", { rental: 500, draw: 125 })
    expect(first).toEqual({ ok: true, value: '{\n  "order": 3,\n  "presses": {\n    "4円パチ": {\n      "rental": 500,\n      "draw": 125\n    }\n  }\n}\n' })
    const second = first.ok ? withPresses(first.value, "20円スロ", { rental: 1000 }) : first
    expect(second.ok && bookSettingsOf(second.value)).toEqual({ ok: true, value: { order: 3, businessDayTurn: undefined, presses: { "4円パチ": { rental: 500, draw: 125 }, "20円スロ": { rental: 1000 } }, inferenceTerms: {} } })
    expect(bookSettingsOf('{"presses":{"4円パチ":{"rental":0}}}')).toEqual(unreadable)
    expect(bookSettingsOf('{"presses":{"4円パチ":{"rental":"500"}}}')).toEqual(unreadable)
    expect(withPresses("{{", "4円パチ", { rental: 500 })).toEqual(unreadable)
  })

  test("keep the terms a tally typed in by hand was weighed on, one for each game, one game written without touching the other", () => {
    const first = withInferenceTerms('{"order":3}', "pachinko", { rentedPerThousand: 240, exchangedPerHundred: 27.5 })
    expect(first).toEqual({ ok: true, value: '{\n  "order": 3,\n  "inferenceTerms": {\n    "pachinko": {\n      "rentedPerThousand": 240,\n      "exchangedPerHundred": 27.5\n    }\n  }\n}\n' })
    const second = first.ok ? withInferenceTerms(first.value, "slot", { rentedPerThousand: 47, exchangedPerHundred: 5.6 }) : first
    const third = second.ok ? withInferenceTerms(second.value, "pachinko", { rentedPerThousand: 250, exchangedPerHundred: 28 }) : second
    expect(third.ok && bookSettingsOf(third.value)).toEqual({ ok: true, value: { order: 3, businessDayTurn: undefined, presses: {}, inferenceTerms: { pachinko: { rentedPerThousand: 250, exchangedPerHundred: 28 }, slot: { rentedPerThousand: 47, exchangedPerHundred: 5.6 } } } })
    expect(bookSettingsOf('{"inferenceTerms":{"mahjong":{"rentedPerThousand":1}}}')).toEqual({ ok: true, value: { order: undefined, businessDayTurn: undefined, presses: {}, inferenceTerms: {} } })
    expect(withInferenceTerms('{"inferenceTerms":{"mahjong":1}}', "slot", { rentedPerThousand: 46, exchangedPerHundred: 5.1 })).toEqual({ ok: true, value: '{\n  "inferenceTerms": {\n    "mahjong": 1,\n    "slot": {\n      "rentedPerThousand": 46,\n      "exchangedPerHundred": 5.1\n    }\n  }\n}\n' })
    expect(bookSettingsOf('{"inferenceTerms":{"pachinko":{"rentedPerThousand":0,"exchangedPerHundred":28}}}')).toEqual(unreadable)
    expect(bookSettingsOf('{"inferenceTerms":{"pachinko":{"rentedPerThousand":250.5,"exchangedPerHundred":28}}}')).toEqual(unreadable)
    expect(bookSettingsOf('{"inferenceTerms":{"slot":{"rentedPerThousand":46,"exchangedPerHundred":"5.1"}}}')).toEqual(unreadable)
    expect(bookSettingsOf('{"inferenceTerms":{"slot":{"rentedPerThousand":46}}}')).toEqual(unreadable)
    expect(bookSettingsOf('{"inferenceTerms":[1]}')).toEqual(unreadable)
    expect(withInferenceTerms('{"inferenceTerms":{"pachinko":1}}', "slot", { rentedPerThousand: 46, exchangedPerHundred: 5.1 })).toEqual(unreadable)
  })

  test("say the hour a business day turns over at where one that can be is written, beside the place", () => {
    expect(bookSettingsOf('{"order":3,"businessDayTurn":7}')).toEqual({ ok: true, value: { order: 3, businessDayTurn: 7, presses: {}, inferenceTerms: {} } })
    expect(bookSettingsOf('{"businessDayTurn":0}')).toEqual({ ok: true, value: { order: undefined, businessDayTurn: 0, presses: {}, inferenceTerms: {} } })
    expect(withBusinessDayTurn('{"order":3}', 7)).toEqual({ ok: true, value: '{\n  "order": 3,\n  "businessDayTurn": 7\n}\n' })
    expect(withOrder('{"order":3,"businessDayTurn":7}', 1)).toEqual({ ok: true, value: '{\n  "order": 1,\n  "businessDayTurn": 7\n}\n' })
  })

  test("are written a field to a line, keeping what a later version put there, and never over a file that does not read", () => {
    expect(withOrder(undefined, 2)).toEqual({ ok: true, value: '{\n  "order": 2\n}\n' })
    expect(withOrder('{"folder":"勝負用","order":9}', 2)).toEqual({ ok: true, value: '{\n  "folder": "勝負用",\n  "order": 2\n}\n' })
    expect(withOrder("{{", 2)).toEqual(unreadable)
    expect(withBusinessDayTurn("[1]", 5)).toEqual(unreadable)
  })
})
