import { describe, expect, test } from "bun:test"

import type { BookStanding } from "../../src/application/backup"
import type { BookId, ListedBook, MemberId } from "../../src/core/book/book"
import { motionOf, rowsOf } from "../../src/ui/features/settings/book-rows"

const ME = "me" as MemberId
const OTHER = "other" as MemberId

const book = (id: string, owner: MemberId): ListedBook => ({ id: id as BookId, members: [{ id: owner, displayName: "owner", role: "owner" }], title: id, order: undefined, businessDayTurn: undefined })

const standing = (listed: ListedBook): BookStanding => ({ book: listed, standing: { type: "never" } as never })

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

  test("swell while the two that swap stand as they did, settle once they stand in each other's place, and are still otherwise", () => {
    const swap = { upper: "b" as BookId, lower: "c" as BookId }
    const motions = (listed: readonly ListedBook[]) => listed.map((each) => motionOf(rowsOf(listed, listed.map(standing), ME), swap, each.id))
    expect(motions(books)).toEqual(["still", "still", "swelling", "swelling"])
    expect(motions([book("a", ME), book("c", ME), book("b", ME), book("theirs", OTHER)])).toEqual(["still", "settling", "settling", "still"])
    expect(books.map((each) => motionOf(rowsOf(books, books.map(standing), ME), undefined, each.id))).toEqual(["still", "still", "still", "still"])
  })
})
