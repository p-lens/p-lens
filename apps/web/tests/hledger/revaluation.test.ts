import { describe, expect, test } from "bun:test"

import { createBookSession } from "../../src/application/book-session"
import { loadOtherGains } from "../../src/application/other-gains"
import type { BookId } from "../../src/core/book/book"
import { toPlainString } from "../../src/core/decimal/decimal"
import { BOOK_FILES } from "../../src/core/journal/layout"
import { createMemoryHistory } from "../../src/history/adapters/memory-history"
import { ME, fixtureBook, inProcessHledger, memoryStorage } from "../support/in-process"

const BOOK = "revalued" as BookId

const setUp = async (prices = "") => {
  const storage = memoryStorage()
  const fixture = await fixtureBook("basic-play", { id: BOOK, members: [{ id: ME, displayName: "me", role: "owner" }] })
  await storage.createBook({ ...fixture, files: { ...fixture.files, [BOOK_FILES.prices]: `${fixture.files[BOOK_FILES.prices] ?? ""}${prices}` } })
  return createBookSession({ hledger: await inProcessHledger(), storage, history: createMemoryHistory(() => crypto.randomUUID()), clock: () => new Date("2026-10-08T20:00:00+09:00"), newId: () => crypto.randomUUID(), member: ME })
}

const revalued = async (session: Awaited<ReturnType<typeof setUp>>, query: string): Promise<string> => ((found) => (found.ok ? toPlainString(found.value.revaluation.total) : found.error.type))(await loadOtherGains(session, BOOK, query))

describe("評価損益", () => {
  test("is what savings lost by their rate falling under them: 4,800 balls won at ¥3.57 and worth ¥3.50 since", async () => {
    const session = await setUp()
    expect(await revalued(session, "")).toBe("-336")
  })

  test("falls in the period the rate changed in, and is nothing in a period it did not", async () => {
    const session = await setUp()
    expect(await revalued(session, "date:2026-09-01..2026-10-01")).toBe("-336")
    expect(await revalued(session, "date:2026-10-01..2026-11-01")).toBe("0")
    expect(await revalued(session, "date:2026-09-01..2026-09-25")).toBe("0")
  })

  test("is a gain where a rate rose, and counts the savings held on the day it changed, not those played since", async () => {
    const session = await setUp('\nP 2026-10-05 "玉(4円・723豚の帽子亭店)" 3.43 JPY\n')
    expect(await revalued(session, "date:2026-10-01..2026-11-01")).toBe("660")
    expect(await revalued(session, "")).toBe("324")
  })

  test("is nothing in a book that holds no savings", async () => {
    const session = await setUp()
    expect(await revalued(session, "date:2020-01-01..2020-02-01")).toBe("0")
  })
})
