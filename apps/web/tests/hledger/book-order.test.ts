import { describe, expect, test } from "bun:test"

import { swapWithNext } from "../../src/application/book-order"
import { createBookSession } from "../../src/application/book-session"
import { loadActivity } from "../../src/application/activity"
import { bookInUse, type BookId, type MemberId } from "../../src/core/book/book"
import { BOOK_SETTINGS_FILE } from "../../src/core/book/settings"
import { createMemoryHistory } from "../../src/history/adapters/memory-history"
import { ME, fixtureBook, inProcessHledger, memoryStorage } from "../support/in-process"

const OTHER = "someone-else" as MemberId

const setUp = async () => {
  const storage = memoryStorage()
  const history = createMemoryHistory(() => crypto.randomUUID())
  const placed: { ids: readonly BookId[] | undefined } = { ids: undefined }
  const keep = (ids: readonly BookId[]): void => {
    placed.ids = ids
  }
  const session = createBookSession({ hledger: await inProcessHledger(), storage, history, clock: () => new Date("2026-10-09T12:00:00+09:00"), newId: () => crypto.randomUUID(), member: ME, deviceOrder: () => placed.ids })
  const fixture = await fixtureBook("basic-play", { id: "a" as BookId, members: [{ id: ME, displayName: "me", role: "owner" }] })
  const add = (id: string, owner: MemberId) =>
    session.createBook({ ...fixture, book: { id: id as BookId, members: [{ id: owner, displayName: "owner", role: "owner" }, ...(owner === ME ? [] : [{ id: ME, displayName: "me", role: "editor" as const }])] } })
  await add("a", ME)
  await add("b", ME)
  await add("theirs", OTHER)
  await add("c", ME)
  const listed = async (): Promise<readonly string[]> => ((books) => (books.ok ? books.value.map((book) => book.id) : []))(await session.books())
  return { storage, history, session, listed, keep }
}

describe("a person's books, swapped in their list", () => {
  test("stand as they came until two are swapped, then as they were put on this device, a book another person let them into among them", async () => {
    const { session, listed, keep } = await setUp()
    expect(await listed()).toEqual(["a", "b", "theirs", "c"])
    expect(await swapWithNext(session, ME, "b" as BookId, keep)).toEqual({ ok: true, value: undefined })
    expect(await listed()).toEqual(["a", "theirs", "b", "c"])
    await swapWithNext(session, ME, "a" as BookId, keep)
    expect(await listed()).toEqual(["theirs", "a", "b", "c"])
    await swapWithNext(session, ME, "c" as BookId, keep)
    expect(await listed()).toEqual(["theirs", "a", "b", "c"])
  })

  test("make a book another person let them into the first, and so the one recorded to by default, writing nothing into it", async () => {
    const { storage, session, listed, keep } = await setUp()
    await swapWithNext(session, ME, "b" as BookId, keep)
    await swapWithNext(session, ME, "a" as BookId, keep)
    const books = await session.books()
    expect(books.ok ? bookInUse(books.value, ME) : undefined).toBe("theirs" as BookId)
    expect(storage.peek("theirs" as BookId)?.files[BOOK_SETTINGS_FILE]).toBeUndefined()
    expect(await listed()).toEqual(["theirs", "a", "b", "c"])
  })

  test("keep the places of two of their own swapped in a file of each book's own, which hledger still reads the book beside, for their other devices", async () => {
    const { storage, session, keep } = await setUp()
    await swapWithNext(session, ME, "a" as BookId, keep)
    expect(["a", "b", "c"].map((id) => storage.peek(id as BookId)?.files[BOOK_SETTINGS_FILE])).toEqual(['{\n  "order": 2\n}\n', '{\n  "order": 1\n}\n', '{\n  "order": 3\n}\n'])
    expect((await session.read("b" as BookId, async (_journal, stored) => ({ ok: true, value: Object.keys(stored.files).length }))).ok).toBe(true)
  })

  test("say nothing of it in a book's activity", async () => {
    const { session, history, keep } = await setUp()
    const before = await loadActivity(session, history, "a" as BookId)
    await swapWithNext(session, ME, "a" as BookId, keep)
    const after = await loadActivity(session, history, "a" as BookId)
    expect(after.ok && before.ok && after.value.lines.length).toBe(before.ok ? before.value.lines.length : -1)
  })
})
