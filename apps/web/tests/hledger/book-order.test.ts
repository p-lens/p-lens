import { describe, expect, test } from "bun:test"

import { moveBook } from "../../src/application/book-order"
import { createBookSession } from "../../src/application/book-session"
import { loadActivity } from "../../src/application/activity"
import type { BookId, MemberId } from "../../src/core/book/book"
import { BOOK_SETTINGS_FILE } from "../../src/core/book/settings"
import { createMemoryHistory } from "../../src/history/adapters/memory-history"
import { ME, fixtureBook, inProcessHledger, memoryStorage } from "../support/in-process"

const OTHER = "someone-else" as MemberId

const setUp = async () => {
  const storage = memoryStorage()
  const history = createMemoryHistory(() => crypto.randomUUID())
  const session = createBookSession({ hledger: await inProcessHledger(), storage, history, clock: () => new Date("2026-10-09T12:00:00+09:00"), newId: () => crypto.randomUUID(), member: ME })
  const fixture = await fixtureBook("basic-play", { id: "a" as BookId, members: [{ id: ME, displayName: "me", role: "owner" }] })
  const add = (id: string, owner: MemberId) =>
    session.createBook({ ...fixture, book: { id: id as BookId, members: [{ id: owner, displayName: "owner", role: "owner" }, ...(owner === ME ? [] : [{ id: ME, displayName: "me", role: "editor" as const }])] } })
  await add("a", ME)
  await add("b", ME)
  await add("theirs", OTHER)
  await add("c", ME)
  const listed = async (): Promise<readonly string[]> => ((books) => (books.ok ? books.value.map((book) => book.id) : []))(await session.books())
  return { storage, history, session, listed }
}

describe("a person's books, moved in their list", () => {
  test("stand as they came until one is moved, then by their places, their own first", async () => {
    const { session, listed } = await setUp()
    expect(await listed()).toEqual(["a", "b", "theirs", "c"])
    expect(await moveBook(session, ME, "c" as BookId, "earlier")).toEqual({ ok: true, value: undefined })
    expect(await listed()).toEqual(["a", "c", "b", "theirs"])
    await moveBook(session, ME, "c" as BookId, "earlier")
    expect(await listed()).toEqual(["c", "a", "b", "theirs"])
    await moveBook(session, ME, "c" as BookId, "earlier")
    expect(await listed()).toEqual(["c", "a", "b", "theirs"])
  })

  test("keep their places in a file of each book's own, which hledger still reads the book beside", async () => {
    const { storage, session } = await setUp()
    await moveBook(session, ME, "b" as BookId, "earlier")
    expect(["a", "b", "c"].map((id) => storage.peek(id as BookId)?.files[BOOK_SETTINGS_FILE])).toEqual(['{\n  "order": 2\n}\n', '{\n  "order": 1\n}\n', '{\n  "order": 3\n}\n'])
    expect((await session.read("b" as BookId, async (_journal, stored) => ({ ok: true, value: Object.keys(stored.files).length }))).ok).toBe(true)
  })

  test("never place a book that is another person's, nor read the place its owner gave it", async () => {
    const { storage, session, listed } = await setUp()
    expect(await moveBook(session, ME, "theirs" as BookId, "earlier")).toEqual({ ok: true, value: undefined })
    expect(storage.peek("theirs" as BookId)?.files[BOOK_SETTINGS_FILE]).toBeUndefined()
    expect(await listed()).toEqual(["a", "b", "theirs", "c"])
  })

  test("say nothing of it in a book's activity", async () => {
    const { session, history } = await setUp()
    const before = await loadActivity(session, history, "a" as BookId)
    await moveBook(session, ME, "a" as BookId, "later")
    const after = await loadActivity(session, history, "a" as BookId)
    expect(after.ok && before.ok && after.value.lines.length).toBe(before.ok ? before.value.lines.length : -1)
  })
})
