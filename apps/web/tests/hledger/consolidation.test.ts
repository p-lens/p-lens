import { describe, expect, test } from "bun:test"

import { createBookSession } from "../../src/application/book-session"
import { loadConsolidation, type ConsolidatedBy } from "../../src/application/consolidation"
import { merged } from "../../src/core/report/breakdown"
import { firstBook } from "../../src/app/composition/first-book"
import type { BookId } from "../../src/core/book/book"
import { toPlainString } from "../../src/core/decimal/decimal"
import { createMemoryHistory } from "../../src/history/adapters/memory-history"
import { ME, fixtureBook, inProcessHledger, memoryStorage } from "../support/in-process"

const [MINE, THEIRS, EMPTY] = ["mine", "theirs", "empty"] as BookId[]

const setUp = async () => {
  const session = createBookSession({ hledger: await inProcessHledger(), storage: memoryStorage(), history: createMemoryHistory(() => crypto.randomUUID()), clock: () => new Date("2026-10-09T20:00:00+09:00"), newId: () => crypto.randomUUID(), member: ME })
  await session.createBook(await fixtureBook("basic-play", { id: MINE as BookId, members: [{ id: ME, displayName: "me", role: "owner" }] }))
  await session.createBook(await fixtureBook("basic-play", { id: THEIRS as BookId, members: [{ id: ME, displayName: "me", role: "viewer" }] }))
  await session.createBook(firstBook(EMPTY as BookId, ME))
  return session
}

const read = async (session: Awaited<ReturnType<typeof setUp>>, chosen: readonly BookId[] | undefined, by: ConsolidatedBy, query: string) => {
  const found = await loadConsolidation(session, chosen, by, query)
  return found.ok && found.value.map((each) => [each.book.id, each.groups.ok && each.groups.value.map((group) => [group.key, toPlainString(group.actual), toPlainString(group.theoretical)])])
}

describe("several books consolidated", () => {
  test("are every book on the device, each one's results its own, book by book", async () => {
    const session = await setUp()
    expect(await read(session, undefined, "book", "")).toEqual([[MINE, [[MINE, "39144", "13200"]]], [THEIRS, [[THEIRS, "39144", "13200"]]], [EMPTY, [[EMPTY, "0", "0"]]]] as never)
  })

  test("are only the books chosen, for the period asked about, grouped as one book's results are", async () => {
    const session = await setUp()
    const both = await read(session, [MINE as BookId, THEIRS as BookId], "machine", "date:2026-09")
    expect(both).toEqual([[MINE, [["ピエロット", "20030", "1800"], ["森物語", "15976", "3200"], ["流星", "5136", "5500"]]], [THEIRS, [["ピエロット", "20030", "1800"], ["森物語", "15976", "3200"], ["流星", "5136", "5500"]]]] as never)
    const merged_ = merged((await loadConsolidation(session, [MINE as BookId, THEIRS as BookId], "machine", "date:2026-09").then((found) => (found.ok ? found.value : []))).flatMap((each) => (each.groups.ok ? [each.groups.value] : [])))
    expect(merged_.map((group) => [group.key, toPlainString(group.actual)])).toEqual([["ピエロット", "40060"], ["森物語", "31952"], ["流星", "10272"]])
    expect(await read(session, [EMPTY as BookId, "gone" as BookId], "month", "")).toEqual([[EMPTY, []]] as never)
  })
})
