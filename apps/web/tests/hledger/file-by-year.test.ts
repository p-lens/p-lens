import { describe, expect, test } from "bun:test"

import { loadActivity } from "../../src/application/activity"
import { createBookSession } from "../../src/application/book-session"
import { fileByYear } from "../../src/application/file-by-year"
import { loadOverall } from "../../src/application/overall"
import type { BookId } from "../../src/core/book/book"
import { BOOK_FILES } from "../../src/core/journal/layout"
import { mapOk } from "../../src/core/result/result"
import { createMemoryHistory } from "../../src/history/adapters/memory-history"
import { ME, fixtureBook, inProcessHledger, memoryStorage } from "../support/in-process"
import { memoryLinks } from "../support/sync"

const BOOK = "filed" as BookId

/** The fixture with a play of the year before at its end, as an app from before the years would have written it. */
const twoYears = (transactions: string): string => {
  const first = transactions.split("\n\n")[0] ?? ""
  return `${transactions.replace(/\n*$/, "")}\n\n${first.replace("2026-09-05", "2025-12-31").replace("play-id: made-up-0905", "play-id: made-up-1231")}\n`
}

const setUp = async (role: "owner" | "viewer", inbox: (transactions: string) => string = twoYears) => {
  const storage = memoryStorage()
  const history = createMemoryHistory(() => crypto.randomUUID())
  const fixture = await fixtureBook("basic-play", { id: BOOK, members: [{ id: ME, displayName: "me", role }] })
  await storage.createBook({ ...fixture, files: { ...fixture.files, [BOOK_FILES.transactions]: inbox(fixture.files[BOOK_FILES.transactions] ?? "") } })
  const session = createBookSession({ hledger: await inProcessHledger(), storage, history, clock: () => new Date("2026-10-19T12:00:00+09:00"), newId: () => crypto.randomUUID(), member: ME })
  return { storage, history, session, ports: { session, history, links: memoryLinks(), member: ME } }
}

describe("a book filed by year", () => {
  test("has each year's entries moved into that year's file, the oldest first and a year a commit, and reads as it did", async () => {
    const { storage, history, session, ports } = await setUp("owner")
    const before = await loadOverall(session, BOOK, "")
    expect(await fileByYear(ports, BOOK)).toEqual({ ok: true, value: ["2025", "2026"] })
    const files = storage.peek(BOOK)?.files ?? {}
    expect(files[BOOK_FILES.transactions]).toBe("")
    expect(files["transactions/2025.journal"]).toContain("play-id: made-up-1231")
    expect(files["transactions/2026.journal"]?.match(/play-id: /g)?.length).toBe(5)
    expect(files[BOOK_FILES.main]).toContain("include transactions/2025.journal\ninclude transactions/2026.journal\ninclude transactions.journal\n")
    expect(await loadOverall(session, BOOK, "")).toEqual(before)
    const activity = await loadActivity(session, history, BOOK)
    expect(mapOk(activity, (found) => found.lines.slice(-2).map((line) => [line.did, line.parts.filed]))).toEqual({
      ok: true,
      value: [
        ["year-filed", { year: 2025, count: 1 }],
        ["year-filed", { year: 2026, count: 5 }],
      ],
    })
  })

  test("is filed once: a book already filed is left as it is", async () => {
    const { storage, ports } = await setUp("owner")
    await fileByYear(ports, BOOK)
    const filed = storage.peek(BOOK)?.files
    expect(await fileByYear(ports, BOOK)).toEqual({ ok: true, value: [] })
    expect(storage.peek(BOOK)?.files).toEqual(filed as never)
  })

  test("is left as it is where its transactions hold what the app does not write, or the member may only read it", async () => {
    const byHand = await setUp("owner", (transactions) => `; kept by hand\n${transactions}`)
    expect(await fileByYear(byHand.ports, BOOK)).toEqual({ ok: true, value: [] })
    expect(byHand.storage.peek(BOOK)?.files["transactions/2026.journal"]).toBeUndefined()
    const reader = await setUp("viewer")
    expect(await fileByYear(reader.ports, BOOK)).toEqual({ ok: true, value: [] })
    expect(reader.storage.peek(BOOK)?.files["transactions/2025.journal"]).toBeUndefined()
  })
})
