import { describe, expect, test } from "bun:test"

import { loadActivity } from "../../src/application/activity"
import { createBookSession } from "../../src/application/book-session"
import { setPresses } from "../../src/application/presses"
import type { BookId } from "../../src/core/book/book"
import { createMemoryHistory } from "../../src/history/adapters/memory-history"
import { ME, fixtureBook, inProcessHledger, memoryStorage } from "../support/in-process"

const BOOK = "mine" as BookId

const setUp = async () => {
  const storage = memoryStorage()
  const history = createMemoryHistory(() => crypto.randomUUID())
  const session = createBookSession({ hledger: await inProcessHledger(), storage, history, clock: () => new Date("2026-10-17T12:00:00+09:00"), newId: () => crypto.randomUUID(), member: ME })
  await session.createBook(await fixtureBook("basic-play", { id: BOOK, members: [{ id: ME, displayName: "me", role: "owner" }] }))
  return { session, history }
}

describe("what a press adds at a corner", () => {
  test("is kept in the book's settings for good, corner by corner, and listed with the book", async () => {
    const { session, history } = await setUp()
    expect(await setPresses(session, BOOK, "4円パチ", { rental: 500, draw: 125 })).toEqual({ ok: true, value: undefined })
    expect(await setPresses(session, BOOK, "1円パチ", { rental: 1000 })).toEqual({ ok: true, value: undefined })
    expect(await setPresses(session, BOOK, "4円パチ", { rental: 2000, draw: 125 })).toEqual({ ok: true, value: undefined })
    const books = await session.books()
    expect(books.ok && books.value.find((book) => book.id === BOOK)?.presses).toEqual({ "4円パチ": { rental: 2000, draw: 125 }, "1円パチ": { rental: 1000 } })
    const activity = await loadActivity(session, history, BOOK)
    expect(activity.ok && activity.value.lines.some((line) => line.did === "presses-set")).toBe(false)
  })
})
