import { describe, expect, test } from "bun:test"

import { createBookSession } from "../../src/application/book-session"
import { keepsTheoreticalValues } from "../../src/application/theoretical"
import type { BookId } from "../../src/core/book/book"
import { BOOK_FILES } from "../../src/core/journal/layout"
import { createMemoryHistory } from "../../src/history/adapters/memory-history"
import { ME, fixtureBook, inProcessHledger, memoryStorage } from "../support/in-process"

const KEPT = "kept" as BookId
const NONE = "none" as BookId

/** A journal with every theoretical value taken out: its virtual postings left off, entry by entry. */
const withoutTheoreticalValues = (text: string): string => text.split("\n").filter((line) => !line.includes("(統計:期待値)")).join("\n")

describe("whether a book keeps theoretical values, asked of the real hledger module", () => {
  test("is so with one written anywhere in it, and not with none, plays and all", async () => {
    const session = createBookSession({ hledger: await inProcessHledger(), storage: memoryStorage(), history: createMemoryHistory(() => crypto.randomUUID()), clock: () => new Date("2026-10-09T12:00:00+09:00"), newId: () => crypto.randomUUID(), member: ME })
    const kept = await fixtureBook("basic-play", { id: KEPT, members: [{ id: ME, displayName: "me", role: "owner" }] })
    await session.createBook(kept)
    await session.createBook({ book: { ...kept.book, id: NONE }, files: { ...kept.files, [BOOK_FILES.transactions]: withoutTheoreticalValues(kept.files[BOOK_FILES.transactions] ?? "") } })
    expect(kept.files[BOOK_FILES.transactions]).toContain("(統計:期待値)")
    expect(await keepsTheoreticalValues(session, KEPT)).toEqual({ ok: true, value: true })
    expect(await keepsTheoreticalValues(session, NONE)).toEqual({ ok: true, value: false })
  })
})
