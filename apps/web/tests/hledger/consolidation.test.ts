import { describe, expect, test } from "bun:test"

import { createBookSession } from "../../src/application/book-session"
import { consolidationKeepsTheoreticalValues, loadConsolidatedHoldings, loadConsolidatedSenderNames, loadConsolidation, type ConsolidatedBy } from "../../src/application/consolidation"
import { recordTokenTally } from "../../src/application/record-tally"
import { loadHoldings } from "../../src/application/holdings"
import { latestValuedOn, totalAcross } from "../../src/core/report/holdings"
import { merged } from "../../src/core/report/breakdown"
import { firstBook } from "../../src/app/composition/first-book"
import type { BookId } from "../../src/core/book/book"
import type { IsoDate } from "../../src/core/calendar/calendar"
import type { PlayId } from "../../src/core/play/play"
import { toPlainString } from "../../src/core/decimal/decimal"
import { createMemoryHistory } from "../../src/history/adapters/memory-history"
import { ME, fixtureBook, inProcessHledger, memoryStorage } from "../support/in-process"
import { RENTED_PLAY } from "../support/values"

const [MINE, THEIRS, EMPTY] = ["mine", "theirs", "empty"] as BookId[]

const setUp = async () => {
  const session = createBookSession({ hledger: await inProcessHledger(), storage: memoryStorage(), history: createMemoryHistory(() => crypto.randomUUID()), clock: () => new Date("2026-10-09T20:00:00+09:00"), newId: () => crypto.randomUUID(), member: ME })
  await session.createBook(await fixtureBook("basic-play", { id: MINE as BookId, members: [{ id: ME, displayName: "me", role: "owner" }] }))
  await session.createBook(await fixtureBook("basic-play", { id: THEIRS as BookId, members: [{ id: ME, displayName: "me", role: "viewer" }] }))
  await session.createBook(firstBook(EMPTY as BookId, ME, "マイ帳簿"))
  return session
}

const read = async (session: Awaited<ReturnType<typeof setUp>>, chosen: readonly BookId[] | undefined, by: ConsolidatedBy, query: string) => {
  const found = await loadConsolidation(session, chosen, by, query)
  return found.ok && found.value.map((each) => [each.book.id, each.read.ok && each.read.value.map((group) => [group.key, toPlainString(group.actual), toPlainString(group.theoretical)])])
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
    const merged_ = merged((await loadConsolidation(session, [MINE as BookId, THEIRS as BookId], "machine", "date:2026-09").then((found) => (found.ok ? found.value : []))).flatMap((each) => (each.read.ok ? [each.read.value] : [])))
    expect(merged_.map((group) => [group.key, toPlainString(group.actual)])).toEqual([["ピエロット", "40060"], ["森物語", "31952"], ["流星", "10272"]])
    expect(await read(session, [EMPTY as BookId, "gone" as BookId], "month", "")).toEqual([[EMPTY, []]] as never)
  })

  test("hold what each book holds, book by book, and together the books' own totals added", async () => {
    const session = await setUp()
    const found = await loadConsolidatedHoldings(session, undefined, "")
    const alone = await loadHoldings(session, MINE as BookId, "")
    const books = found.ok ? found.value : []
    expect(books.map((each) => each.book.id)).toEqual([MINE, THEIRS, EMPTY] as never)
    expect(books[0]?.read).toEqual(alone)
    const read = books.flatMap((each) => (each.read.ok ? [each.read.value] : []))
    expect(read.length).toBe(3)
    expect(alone.ok && toPlainString(totalAcross(read))).toBe(alone.ok ? toPlainString({ mantissa: alone.value.total.mantissa * 2n, places: alone.value.total.places }) : "")
    expect(latestValuedOn(read)).toBe(alone.ok ? alone.value.valuedOn : undefined)
    const one = await loadConsolidatedHoldings(session, [EMPTY as BookId], "")
    expect(one.ok && one.value.map((each) => [each.book.id, each.read.ok && each.read.value.parlors.length])).toEqual([[EMPTY, 0]] as never)
  })

  test("keep theoretical values where any of the books chosen does", async () => {
    const session = await setUp()
    expect(await consolidationKeepsTheoreticalValues(session, undefined)).toEqual({ ok: true, value: true })
    expect(await consolidationKeepsTheoreticalValues(session, [MINE as BookId, EMPTY as BookId])).toEqual({ ok: true, value: true })
    expect(await consolidationKeepsTheoreticalValues(session, [EMPTY as BookId])).toEqual({ ok: true, value: false })
  })

  test("are grouped by who played them, a sender by the id their tallies carry and named by the last, the book's own tallies apart", async () => {
    const session = await setUp()
    const sent = (id: string, date: string, sender: { readonly id: string; readonly name: string }) => recordTokenTally(session, MINE as BookId, { ...RENTED_PLAY, id: id as PlayId, date: date as IsoDate, sender })
    await sent("kenji-1", "2026-10-01", { id: "grant-kenji", name: "けんじ" })
    await sent("kenji-2", "2026-10-03", { id: "grant-kenji", name: "けんじ2号" })
    await sent("taro-1", "2026-10-02", { id: "grant-taro", name: "たろう" })
    const found = await read(session, [MINE as BookId], "sender", "date:2026-10")
    const groups = found === false ? [] : (found[0]?.[1] as readonly (readonly string[])[])
    expect(groups.map((group) => group[0]).toSorted()).toEqual(["", "grant-kenji", "grant-taro"])
    const figuresOf = async (by: ConsolidatedBy) => ((found) => (found.ok ? found.value.flatMap((each) => (each.read.ok ? each.read.value.map((group) => [toPlainString(group.actual), toPlainString(group.theoretical)]) : [])) : []))(await loadConsolidation(session, [MINE as BookId], by, "date:2026-09"))
    expect(await read(session, [MINE as BookId], "sender", "date:2026-09")).toEqual([[MINE, [["", ...((await figuresOf("book"))[0] ?? [])]]]] as never)
    const names = await loadConsolidatedSenderNames(session, undefined)
    expect(names.ok && [...names.value].toSorted()).toEqual([["grant-kenji", { name: "けんじ2号", date: "2026-10-03" }], ["grant-taro", { name: "たろう", date: "2026-10-02" }]] as never)
  })
})
