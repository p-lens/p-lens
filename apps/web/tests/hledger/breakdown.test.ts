import { beforeAll, describe, expect, test } from "bun:test"

import { createBookSession, type BookSession } from "../../src/application/book-session"
import { loadBreakdown } from "../../src/application/breakdown"
import { importPrecord } from "../../src/application/import"
import type { BookId } from "../../src/core/book/book"
import { toPlainString } from "../../src/core/decimal/decimal"
import { totalOf, type Dimension } from "../../src/core/report/breakdown"
import { Ok } from "../../src/core/result/result"
import { createMemoryHistory } from "../../src/history/adapters/memory-history"
import { queryOf } from "../../src/ui/features/period/periods"
import { ME, fixtureBook, inProcessHledger, memoryStorage } from "../support/in-process"

const BOOK = "basic-play" as BookId

describe("the basic-play book, broken down by the real hledger module", () => {
  const context: { session?: BookSession } = {}
  const session = (): BookSession => context.session as BookSession
  const read = async (dimension: Dimension, query = "") => ((found) => (found.ok ? found.value.map((group) => [group.key, toPlainString(group.actual), toPlainString(group.theoretical)]) : found))(await loadBreakdown(session(), BOOK, dimension, query))

  beforeAll(async () => {
    const storage = memoryStorage()
    context.session = createBookSession({ hledger: await inProcessHledger(), storage, history: createMemoryHistory(() => crypto.randomUUID()), clock: () => new Date("2026-10-09T12:00:00+09:00"), newId: () => crypto.randomUUID(), member: ME })
    await session().createBook(await fixtureBook("basic-play", { id: BOOK, members: [{ id: ME, displayName: "me", role: "owner" }] }))
  })

  test("by machine and by game, each group hledger's own sum, best first", async () => {
    expect(await read("machine")).toEqual([["ピエロット", "20030", "1800"], ["森物語", "13978", "4100"], ["流星", "5136", "7300"]])
    expect(await read("game")).toEqual([["slot", "20030", "1800"], ["pachinko", "19114", "11400"]])
  })

  test("by parlor, under the name the book gives each", async () => {
    expect(await read("parlor")).toEqual([["789松原店", "34008", "5900"], ["ホシゾラ梅田店", "5136", "7300"]])
  })

  test("by year, month and day, newest first, and by the day of the week from Monday", async () => {
    expect(await read("year")).toEqual([["2026", "39144", "13200"]])
    expect(await read("month")).toEqual([["2026-10", "-1998", "2700"], ["2026-09", "41142", "10500"]])
    expect(await read("day")).toEqual([["2026-10-03", "-1998", "900"], ["2026-10-01", "0", "1800"], ["2026-09-20", "15976", "3200"], ["2026-09-12", "20030", "1800"], ["2026-09-05", "5136", "5500"]])
    expect(await read("weekday")).toEqual([["3", "0", "1800"], ["5", "23168", "8200"], ["6", "15976", "3200"]])
  })

  test("for a period, and to the same total whichever way it is cut", async () => {
    expect(await read("machine", "date:2026-10")).toEqual([["流星", "0", "1800"], ["森物語", "-1998", "900"]])
    const totals = await Promise.all((["machine", "parlor", "game", "month", "weekday"] as const).map(async (dimension) => ((found) => (found.ok ? ((total) => [toPlainString(total.actual), toPlainString(total.theoretical)])(totalOf(found.value)) : found))(await loadBreakdown(session(), BOOK, dimension, ""))))
    expect(totals).toEqual([["39144", "13200"], ["39144", "13200"], ["39144", "13200"], ["39144", "13200"], ["39144", "13200"]])
  })

  test("for a range of days, both ends included and either left open, as the period fields write it", async () => {
    const days = async (from: string | undefined, to: string | undefined) => ((found) => (Array.isArray(found) ? found.map(([key]) => key) : found))(await read("day", queryOf({ from: from as never, to: to as never })))
    expect(await days("2026-09-12", "2026-10-01")).toEqual(["2026-10-01", "2026-09-20", "2026-09-12"])
    expect(await days("2026-10-03", "2026-10-03")).toEqual(["2026-10-03"])
    expect(await days("2026-09-20", undefined)).toEqual(["2026-10-03", "2026-10-01", "2026-09-20"])
    expect(await days(undefined, "2026-09-12")).toEqual(["2026-09-12", "2026-09-05"])
    expect(await days(undefined, undefined)).toEqual(["2026-10-03", "2026-10-01", "2026-09-20", "2026-09-12", "2026-09-05"])
    expect(await days("2026-10-03", "2026-09-05")).toEqual([])
  })

  test("with tallies taken in from another app under what that app called their parlor and machine", async () => {
    const file = ["日付,店舗コード,店舗,メーカー,機種コード,機種,台番号,投資額,回収額,収支,メモ,稼働時間,時給,貯玉", "2019/01/05,S1,駅前ホール,メーカーA,M1,昔の台,45,10000,0,-10000,,,,", "2019/01/06,S1,駅前ホール,メーカーA,M1,昔の台,46,1000,4000,3000,,,,", ""].join("\r\n")
    await importPrecord({ session: session(), catalog: { search: async () => Ok([]) } as never }, BOOK, file, new Map(), undefined)
    expect(await read("machine", "date:2019")).toEqual([["昔の台", "-7000", "0"]])
    expect(await read("parlor", "date:2019")).toEqual([["駅前ホール", "-7000", "0"]])
  })
})
