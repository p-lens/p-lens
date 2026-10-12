import { describe, expect, test } from "bun:test"

import type { BookStanding } from "../../src/application/backup"
import type { BookId, ListedBook, MemberId } from "../../src/core/book/book"
import { rowsOf } from "../../src/ui/features/settings/book-rows"

const ME = "me" as MemberId
const OTHER = "other" as MemberId

const book = (id: string, owner: MemberId): ListedBook => ({ id: id as BookId, members: [{ id: owner, displayName: "owner", role: "owner" }], title: id, order: undefined })

const standing = (listed: ListedBook): BookStanding => ({ book: listed, standing: { type: "never" } as never })

describe("the rows of the books' list", () => {
  const books = [book("a", ME), book("theirs", OTHER), book("b", ME), book("c", ME)]

  test("are in the order books are listed, a person's own moving among themselves and another's not at all", () => {
    expect(rowsOf(books, books.map(standing), ME).map((row) => [row.standing.book.id, row.moves])).toEqual([
      ["a", ["later"]],
      ["theirs", []],
      ["b", ["earlier", "later"]],
      ["c", ["earlier"]],
    ] as never)
  })

  test("give an only book nowhere to move, and leave out a book whose standing is not known yet", () => {
    expect(rowsOf([book("a", ME)], [standing(book("a", ME))], ME).map((row) => row.moves)).toEqual([[]])
    expect(rowsOf(books, [standing(book("b", ME))], ME).map((row) => row.standing.book.id)).toEqual(["b"] as never)
  })
})
