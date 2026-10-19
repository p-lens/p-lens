import { describe, expect, test } from "bun:test"

import { createBookSession } from "../../src/application/book-session"
import { changeExchangeRate, loadParlorPassbook, loadPassbook } from "../../src/application/savings"
import type { BookId } from "../../src/core/book/book"
import type { IsoDate } from "../../src/core/calendar/calendar"
import { toPlainString, type Decimal } from "../../src/core/decimal/decimal"
import { createMemoryHistory } from "../../src/history/adapters/memory-history"
import { ME, fixtureBook, inProcessHledger, memoryStorage } from "../support/in-process"
import { dec } from "../support/values"

const BOOK = "passbook" as BookId

const setUp = async () => {
  const storage = memoryStorage()
  const history = createMemoryHistory(() => crypto.randomUUID())
  await storage.createBook(await fixtureBook("basic-play", { id: BOOK, members: [{ id: ME, displayName: "me", role: "owner" }] }))
  return createBookSession({ hledger: await inProcessHledger(), storage, history, clock: () => new Date("2026-10-04T20:00:00+09:00"), newId: () => crypto.randomUUID(), member: ME })
}

const yen = (value: Decimal | undefined): string | undefined => (value === undefined ? undefined : toPlainString(value))

describe("a parlor's passbook", () => {
  test("values each day's tokens out and in at that day's rate, and what every pool held at its end at the rate then, by hledger", async () => {
    const session = await setUp()
    const found = await loadParlorPassbook(session, BOOK, "723修羅の国店", undefined)
    expect(found.ok && found.value.days.map((day) => [day.date, yen(day.withdrawn), yen(day.deposited), yen(day.balance), day.pools.map((part) => part.pool.tier)])).toEqual([
      ["2026-10-03", "9990", "7992", "52008", ["4円"]],
      ["2026-09-20", "0", "23976", "54006", ["4円"]],
      ["2026-09-12", "0", "30030", "30030", ["20円"]],
      ["2026-09-01", "0", "0", "0", ["4円", "20円"]],
    ])
  })

  test("shows a rate set anew on a day nothing moved, the savings valued at it from then", async () => {
    const session = await setUp()
    const found = await loadParlorPassbook(session, BOOK, "マレハン東京皇国店", undefined)
    const day = found.ok ? found.value.days.find((each) => each.date === "2026-09-25") : undefined
    expect([yen(day?.balance), day?.pools.map((part) => part.day.rateSet && [toPlainString(part.day.rateSet.before ?? dec("0")), toPlainString(part.day.rateSet.rate)])]).toEqual(["16800", [["3.57", "3.5"]]])
  })
})

describe("a passbook shown from a day", () => {
  const FROM = "2026-09-15" as IsoDate

  test("of a parlor, has the days from then, the same as every day's, and what was held the day before, in yen by hledger", async () => {
    const session = await setUp()
    const [every, shown] = [await loadParlorPassbook(session, BOOK, "723修羅の国店", undefined), await loadParlorPassbook(session, BOOK, "723修羅の国店", FROM)]
    const rows = (days: readonly { readonly date: string; readonly balance: Decimal | undefined }[]) => days.map((day) => [day.date, yen(day.balance)])
    expect(shown.ok && rows(shown.value.days)).toEqual(every.ok ? rows(every.value.days.filter((day) => day.date >= FROM)) : [])
    expect(shown.ok && shown.value.before && [shown.value.before.through, yen(shown.value.before.balance), shown.value.before.lastMoved]).toEqual(["2026-09-14", "30030", "2026-09-12"])
  })

  test("of a pool, counts its balances on from what it held the day before, and keeps the rate it was last set to", async () => {
    const session = await setUp()
    const pool = { kind: "ball" as const, tier: "4円" }
    const [every, shown] = [await loadPassbook(session, BOOK, "マレハン東京皇国店", pool, undefined), await loadPassbook(session, BOOK, "マレハン東京皇国店", pool, FROM)]
    const rows = (days: readonly { readonly date: string; readonly balance: Decimal }[]) => days.map((day) => [day.date, toPlainString(day.balance)])
    expect(shown.ok && rows(shown.value.days)).toEqual(every.ok ? rows(every.value.days.filter((day) => day.date >= FROM)) : [])
    expect(shown.ok && shown.value.before && [shown.value.before.through, toPlainString(shown.value.before.balance), shown.value.before.lastMoved]).toEqual(["2026-09-14", every.ok ? toPlainString(every.value.days.find((day) => day.date < FROM)?.balance ?? dec("0")) : "", "2026-09-05"])
    expect(shown.ok && shown.value.rate && toPlainString(shown.value.rate)).toBe("3.5")
  })

  test("from before anything moved, has nothing held before it", async () => {
    const session = await setUp()
    const found = await loadParlorPassbook(session, BOOK, "723修羅の国店", "2026-01-01" as IsoDate)
    expect(found.ok && found.value.before).toBeUndefined()
  })
})

describe("setting a pool's rate from its passbook", () => {
  test("writes a price the passbook then shows, and writes nothing for a rate the day already has", async () => {
    const session = await setUp()
    const pool = { kind: "ball" as const, tier: "4円" }
    const change = { parlorName: "723修羅の国店", pool, date: "2026-10-04" as IsoDate, rate: dec("3.4") }
    expect(await changeExchangeRate(session, BOOK, change)).toEqual({ ok: true, value: undefined })
    expect(await changeExchangeRate(session, BOOK, change)).toEqual({ ok: true, value: undefined })
    const found = await loadPassbook(session, BOOK, "723修羅の国店", pool, undefined)
    expect(found.ok && found.value.days.filter((day) => day.rateSet !== undefined).map((day) => [day.date, toPlainString(day.rateSet?.rate ?? dec("0"))])).toEqual([
      ["2026-10-04", "3.4"],
      ["2026-09-01", "3.33"],
    ])
  })
})
