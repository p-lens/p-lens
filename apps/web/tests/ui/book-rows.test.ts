import { describe, expect, test } from "bun:test"

import type { BookStanding } from "../../src/application/backup"
import type { BookId, ListedBook, MemberId } from "../../src/core/book/book"
import { exchangedIn, motionOf, placedAs, rowsOf, standAs } from "../../src/ui/features/settings/book-rows"

const ME = "me" as MemberId
const OTHER = "other" as MemberId

const book = (id: string, owner: MemberId): ListedBook => ({ id: id as BookId, members: [{ id: owner, displayName: "owner", role: "owner" }], title: id, order: undefined, businessDayTurn: undefined })

const standing = (listed: ListedBook): BookStanding => ({ book: listed, standing: { type: "never" } as never, unreadable: [] })

describe("the rows of the books' list", () => {
  const books = [book("a", ME), book("theirs", OTHER), book("b", ME), book("c", ME)]

  test("are in the order books are listed, each of a person's own changing places with the next of them, and another's with none", () => {
    expect(rowsOf(books, books.map(standing), ME).map((row) => [row.standing.book.id, row.swapsWith])).toEqual([
      ["a", "b"],
      ["theirs", undefined],
      ["b", "c"],
      ["c", undefined],
    ] as never)
  })

  test("give an only book of a person's own none to change places with, and leave out a book whose standing is not known yet", () => {
    expect(rowsOf([book("a", ME)], [standing(book("a", ME))], ME).map((row) => row.swapsWith)).toEqual([undefined])
    expect(rowsOf([book("a", ME), book("theirs", OTHER)], [book("a", ME), book("theirs", OTHER)].map(standing), ME).map((row) => row.swapsWith)).toEqual([undefined, undefined])
    expect(rowsOf(books, [standing(book("b", ME))], ME).map((row) => row.standing.book.id)).toEqual(["b"] as never)
  })

  test("stand where a person has put them ahead of the writing, each of their own changing places with the next as they then stand", () => {
    const read = rowsOf(books, books.map(standing), ME)
    const moved = exchangedIn(read.map((row) => row.standing.book.id), { upper: "b" as BookId, lower: "c" as BookId })
    expect(moved).toEqual(["a", "theirs", "c", "b"] as never)
    expect(placedAs(read, moved).map((row) => [row.standing.book.id, row.swapsWith])).toEqual([
      ["a", "c"],
      ["theirs", undefined],
      ["c", "b"],
      ["b", undefined],
    ] as never)
    expect(placedAs(read, undefined)).toBe(read)
  })

  test("keep a book the moved order does not know, after the rest, and pass over one it knows that is gone", () => {
    const read = rowsOf(books, books.map(standing), ME)
    expect(placedAs(read, ["c", "gone", "a"] as never).map((row) => row.standing.book.id)).toEqual(["c", "a", "theirs", "b"] as never)
  })

  test("stand as an order of ids only where every book is where the order has it", () => {
    const read = rowsOf(books, books.map(standing), ME)
    expect(standAs(read, ["a", "theirs", "b", "c"] as never)).toBe(true)
    expect(standAs(read, ["a", "theirs", "c", "b"] as never)).toBe(false)
    expect(standAs(read, ["a", "theirs", "b"] as never)).toBe(false)
  })

  test("swell while the two that swap stand as they did, settle once they stand in each other's place, and are still otherwise", () => {
    const swap = { upper: "b" as BookId, lower: "c" as BookId }
    const motions = (listed: readonly ListedBook[]) => listed.map((each) => motionOf(rowsOf(listed, listed.map(standing), ME), swap, each.id))
    expect(motions(books)).toEqual(["still", "still", "swelling", "swelling"])
    expect(motions([book("a", ME), book("c", ME), book("b", ME), book("theirs", OTHER)])).toEqual(["still", "settling", "settling", "still"])
    expect(books.map((each) => motionOf(rowsOf(books, books.map(standing), ME), undefined, each.id))).toEqual(["still", "still", "still", "still"])
  })
})
