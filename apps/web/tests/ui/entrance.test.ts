import { describe, expect, test } from "bun:test"

import type { Book, BookId, MemberId } from "../../src/core/book/book"
import { entranceOf } from "../../src/ui/navigation/entrance"

const ME = "me" as MemberId
const OTHER = "other" as MemberId

const book = (id: string, owner: MemberId): Book => ({
  id: id as BookId,
  members: [{ id: owner, displayName: "owner", role: "owner" }, ...(owner === ME ? [] : [{ id: ME, displayName: "me", role: "editor" as const }])],
})

describe("the place the app is entered at", () => {
  test("is the first of one's own books, at its side panel, wherever the books of others stand", () => {
    expect(entranceOf([book("theirs", OTHER), book("mine", ME), book("mine-too", ME)], ME)).toEqual({ kind: "book", bookId: "mine" as BookId })
  })

  test("is the first book others let one into, where one has none of one's own", () => {
    expect(entranceOf([book("theirs", OTHER)], ME)).toEqual({ kind: "book", bookId: "theirs" as BookId })
  })

  test("is the live space on a device with no book", () => {
    expect(entranceOf([], ME)).toEqual({ kind: "live" })
  })
})
