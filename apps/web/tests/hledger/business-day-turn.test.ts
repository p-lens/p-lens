import { describe, expect, test } from "bun:test"

import { loadActivity } from "../../src/application/activity"
import { addBook } from "../../src/application/add-book"
import { createBookSession } from "../../src/application/book-session"
import { adoptBusinessDayTurn, setBusinessDayTurn } from "../../src/application/business-day-turn"
import type { BookId, MemberId } from "../../src/core/book/book"
import { BOOK_SETTINGS_FILE } from "../../src/core/book/settings"
import { DEFAULT_BUSINESS_DAY_TURN, type BusinessDayTurn } from "../../src/core/calendar/calendar"
import { createMemoryHistory } from "../../src/history/adapters/memory-history"
import { ME, fixtureBook, inProcessHledger, memoryStorage } from "../support/in-process"

const OTHER = "someone-else" as MemberId

const SAID = '{\n  "businessDayTurn": 3\n}\n'

/** A device's own hour, held as its preferences hold it. */
const device = (turn: BusinessDayTurn) => {
  const held: { turn: BusinessDayTurn } = { turn }
  return { businessDayTurn: () => held.turn, setBusinessDayTurn: (next: BusinessDayTurn) => void (held.turn = next) }
}

const setUp = async () => {
  const storage = memoryStorage()
  const history = createMemoryHistory(() => crypto.randomUUID())
  const session = createBookSession({ hledger: await inProcessHledger(), storage, history, clock: () => new Date("2026-10-12T12:00:00+09:00"), newId: () => crypto.randomUUID(), member: ME })
  const fixture = await fixtureBook("basic-play", { id: "a" as BookId, members: [{ id: ME, displayName: "me", role: "owner" }] })
  const add = (id: string, owner: MemberId) =>
    session.createBook({ ...fixture, book: { id: id as BookId, members: [{ id: owner, displayName: "owner", role: "owner" }, ...(owner === ME ? [] : [{ id: ME, displayName: "me", role: "editor" as const }])] } })
  await add("a", ME)
  await add("theirs", OTHER)
  await add("b", ME)
  const settings = (id: string): string | undefined => storage.peek(id as BookId)?.files[BOOK_SETTINGS_FILE]
  return { storage, history, session, settings }
}

describe("the hour a person's business day turns over at", () => {
  test("holds on the device at once and is written into each of their own books, never another person's", async () => {
    const { session, settings } = await setUp()
    const preferences = device(DEFAULT_BUSINESS_DAY_TURN)
    expect(await setBusinessDayTurn(session, ME, preferences, 3)).toEqual({ ok: true, value: undefined })
    expect(preferences.businessDayTurn()).toBe(3)
    expect(["a", "b", "theirs"].map(settings)).toEqual([SAID, SAID, undefined])
  })

  test("is taken by a device from the books that say it, and left as it was where none does", async () => {
    const { session } = await setUp()
    const fresh = device(DEFAULT_BUSINESS_DAY_TURN)
    await adoptBusinessDayTurn(session, fresh)
    expect(fresh.businessDayTurn()).toBe(DEFAULT_BUSINESS_DAY_TURN)
    await setBusinessDayTurn(session, ME, device(DEFAULT_BUSINESS_DAY_TURN), 3)
    await adoptBusinessDayTurn(session, fresh)
    expect(fresh.businessDayTurn()).toBe(3)
  })

  test("is said from the start by a book the person adds", async () => {
    const { session, settings } = await setUp()
    const fixture = await fixtureBook("basic-play", { id: "new" as BookId, members: [{ id: ME, displayName: "me", role: "owner" }] })
    expect(await addBook(session, fixture, "仲間と", 3)).toEqual({ ok: true, value: { ok: true, value: "new" as BookId } })
    expect(settings("new")).toBe(SAID)
  })

  test("is written once, and says nothing in a book's activity", async () => {
    const { session, history } = await setUp()
    const preferences = device(DEFAULT_BUSINESS_DAY_TURN)
    const before = await loadActivity(session, history, "a" as BookId)
    await setBusinessDayTurn(session, ME, preferences, 3)
    const commits = await history.log("a" as BookId)
    await setBusinessDayTurn(session, ME, preferences, 3)
    expect(await history.log("a" as BookId)).toEqual(commits)
    const after = await loadActivity(session, history, "a" as BookId)
    expect(after.ok && before.ok && after.value.lines.length).toBe(before.ok ? before.value.lines.length : -1)
  })
})
