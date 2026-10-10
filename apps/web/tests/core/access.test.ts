import { describe, expect, test } from "bun:test"

import { can } from "../../src/core/access/role"
import { memberCan, type Book, type BookId, type MemberId } from "../../src/core/book/book"

const book: Book = {
  id: "shared" as BookId,
  members: [
    { id: "a" as MemberId, displayName: "A", role: "owner" },
    { id: "b" as MemberId, displayName: "B", role: "editor" },
    { id: "c" as MemberId, displayName: "C", role: "viewer" },
  ],
}

describe("access", () => {
  test("each role grants what it says and nothing more", () => {
    expect(can("owner", "manage-members")).toBe(true)
    expect(can("editor", "write")).toBe(true)
    expect(can("editor", "manage-members")).toBe(false)
    expect(can("viewer", "read")).toBe(true)
    expect(can("viewer", "write")).toBe(false)
  })

  test("editing someone else's book is a role on that book, not a relation between people", () => {
    expect(memberCan(book, "b" as MemberId, "write")).toBe(true)
    expect(memberCan(book, "c" as MemberId, "write")).toBe(false)
  })

  test("a stranger may do nothing", () => {
    expect(memberCan(book, "z" as MemberId, "read")).toBe(false)
  })
})
