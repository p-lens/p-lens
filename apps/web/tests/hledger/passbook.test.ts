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
    const found = await loadParlorPassbook(session, BOOK, "723小宇宙店")
    expect(found.ok && found.value.map((day) => [day.date, yen(day.withdrawn), yen(day.deposited), yen(day.balance), day.pools.map((part) => part.pool.tier)])).toEqual([
      ["2026-10-03", "9990", "7992", "52008", ["4円"]],
      ["2026-09-20", "0", "23976", "54006", ["4円"]],
      ["2026-09-12", "0", "30030", "30030", ["20円"]],
      ["2026-09-01", "0", "0", "0", ["4円", "20円"]],
    ])
  })

  test("shows a rate set anew on a day nothing moved, the savings valued at it from then", async () => {
    const session = await setUp()
    const found = await loadParlorPassbook(session, BOOK, "マレハン第3新東京店")
    const day = found.ok ? found.value.find((each) => each.date === "2026-09-25") : undefined
    expect([yen(day?.balance), day?.pools.map((part) => part.day.rateSet && [toPlainString(part.day.rateSet.before ?? dec("0")), toPlainString(part.day.rateSet.rate)])]).toEqual(["16800", [["3.57", "3.5"]]])
  })
})

describe("setting a pool's rate from its passbook", () => {
  test("writes a price the passbook then shows, and writes nothing for a rate the day already has", async () => {
    const session = await setUp()
    const pool = { kind: "ball" as const, tier: "4円" }
    const change = { parlorName: "723小宇宙店", pool, date: "2026-10-04" as IsoDate, rate: dec("3.4") }
    expect(await changeExchangeRate(session, BOOK, change)).toEqual({ ok: true, value: undefined })
    expect(await changeExchangeRate(session, BOOK, change)).toEqual({ ok: true, value: undefined })
    const found = await loadPassbook(session, BOOK, "723小宇宙店", pool)
    expect(found.ok && found.value.filter((day) => day.rateSet !== undefined).map((day) => [day.date, toPlainString(day.rateSet?.rate ?? dec("0"))])).toEqual([
      ["2026-10-04", "3.4"],
      ["2026-09-01", "3.33"],
    ])
  })
})
