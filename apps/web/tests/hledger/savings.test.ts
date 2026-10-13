import { describe, expect, test } from "bun:test"

import { firstBook } from "../../src/app/composition/first-book"
import { loadActivity } from "../../src/application/activity"
import { createBookSession } from "../../src/application/book-session"
import { loadHoldings } from "../../src/application/holdings"
import { loadOverview } from "../../src/application/overview"
import { adjustBalance, recordPrizeExchange, registerOpeningBalance } from "../../src/application/savings"
import type { BookId } from "../../src/core/book/book"
import type { IsoDate } from "../../src/core/calendar/calendar"
import { toPlainString } from "../../src/core/decimal/decimal"
import { BOOK_FILES } from "../../src/core/journal/layout"
import type { PoolOpening } from "../../src/core/parlor/opening"
import type { ParlorId } from "../../src/core/parlor/parlor"
import { createMemoryHistory } from "../../src/history/adapters/memory-history"
import { ME, fixtureBook, inProcessHledger, memoryStorage } from "../support/in-process"
import { UMEDA, dec, saidIn } from "../support/values"

const BOOK = "mine" as BookId

const setUp = async (stored = firstBook(BOOK, ME)) => {
  const storage = memoryStorage()
  const history = createMemoryHistory(() => crypto.randomUUID())
  const session = createBookSession({ hledger: await inProcessHledger(), storage, history, clock: () => new Date("2026-10-08T20:00:00+09:00"), newId: () => crypto.randomUUID(), member: ME })
  await session.createBook(stored)
  return { storage, history, session }
}

const NAMBA: PoolOpening = {
  identity: { type: "listed", id: "osm-9" as ParlorId },
  parlorName: "ホシゾラなんば新館",
  pool: { kind: "ball", tier: "4円" },
  rate: dec("3.571429"),
  date: "2026-10-01" as IsoDate,
}

const held = async (session: Awaited<ReturnType<typeof setUp>>["session"], query = "") => {
  const holdings = await loadHoldings(session, BOOK, query)
  return holdings.ok ? holdings.value.parlors.flatMap((parlor) => parlor.tokens.map((token) => [parlor.parlorName, token.tier, toPlainString(token.quantity)])) : holdings
}

describe("the savings a person already had", () => {
  test("are registered at a pool the book did not keep yet, and are no play's result", async () => {
    const { session, storage, history } = await setUp()
    expect(await registerOpeningBalance(session, BOOK, NAMBA, dec("5000"))).toEqual({ ok: true, value: undefined })
    expect(await held(session)).toEqual([["ホシゾラなんば新館", "4円", "5000"]])
    const overview = await loadOverview(session, BOOK, "")
    expect(overview.ok && toPlainString(overview.value.actual)).toBe("0")
    const stored = await storage.readBook(BOOK)
    expect(stored.ok && stored.value.files[BOOK_FILES.transactions]).toContain("2026-10-01 ホシゾラなんば新館 | 開始残高  ; parlor-id: osm-9, savings: opening\n")
    const activity = await loadActivity(session, history, BOOK)
    expect(activity.ok && activity.value.lines.map((line) => line.did)).toContain("savings-opened")
  })

  test("are put at the head of the book's transactions, and declared in a book made before savings could be set", async () => {
    const { session, storage } = await setUp(await fixtureBook("basic-play", { id: BOOK, members: [{ id: ME, displayName: "me", role: "owner" }] }))
    expect((await registerOpeningBalance(session, BOOK, NAMBA, dec("1200"))).ok).toBe(true)
    const stored = await storage.readBook(BOOK)
    expect(stored.ok && stored.value.files[BOOK_FILES.transactions]?.startsWith("2026-10-01 ホシゾラなんば新館 | 開始残高")).toBe(true)
    expect(stored.ok && stored.value.files[BOOK_FILES.accounts]).toContain("account 純資産:開始残高\n")
    expect((await registerOpeningBalance(session, BOOK, { ...NAMBA, pool: { kind: "medal", tier: "20円" }, rate: dec("17.857143") }, dec("300"))).ok).toBe(true)
    const again = await storage.readBook(BOOK)
    expect(again.ok && again.value.files[BOOK_FILES.accounts]?.split("account 純資産:開始残高").length).toBe(2)
  })

  test("are registered once for a pool: a second is refused, another pool of the same parlor is not, and the first stands", async () => {
    const { session } = await setUp()
    await registerOpeningBalance(session, BOOK, NAMBA, dec("5000"))
    expect(await registerOpeningBalance(session, BOOK, { ...NAMBA, rate: dec("4") }, dec("3000"))).toEqual({
      ok: false,
      error: { type: "opening-balance-registered", parlor: "ホシゾラなんば新館", tier: "4円" },
    })
    expect((await registerOpeningBalance(session, BOOK, { ...NAMBA, pool: { kind: "medal", tier: "20円" }, rate: dec("17.857143") }, dec("300"))).ok).toBe(true)
    expect(await held(session)).toEqual([
      ["ホシゾラなんば新館", "20円", "300"],
      ["ホシゾラなんば新館", "4円", "5000"],
    ])
  })
})

describe("a pool's savings put right", () => {
  test("are set to what the parlor says, by the difference, on the day, and are no play's result", async () => {
    const { session, storage } = await setUp()
    await registerOpeningBalance(session, BOOK, NAMBA, dec("5000"))
    const parlor = { identity: NAMBA.identity, name: NAMBA.parlorName, pools: [NAMBA.pool] }
    const down = await adjustBalance(session, BOOK, parlor, NAMBA.pool, "2026-10-05" as IsoDate, dec("4820"))
    expect(down.ok && down.value.type === "adjusted" && toPlainString(down.value.difference)).toBe("-180")
    expect(await held(session)).toEqual([["ホシゾラなんば新館", "4円", "4820"]])
    const up = await adjustBalance(session, BOOK, parlor, NAMBA.pool, "2026-10-06" as IsoDate, dec("4900"))
    expect(up.ok && up.value.type === "adjusted" && toPlainString(up.value.difference)).toBe("80")
    const overview = await loadOverview(session, BOOK, "")
    expect(overview.ok && toPlainString(overview.value.actual)).toBe("0")
    const stored = await storage.readBook(BOOK)
    expect(stored.ok && stored.value.files[BOOK_FILES.transactions]).toContain("2026-10-05 ホシゾラなんば新館 | 残高調整  ; parlor-id: osm-9, savings: adjustment\n")
  })

  test("are counted as of the day said, and left alone where the book already has the count", async () => {
    const { session } = await setUp()
    await registerOpeningBalance(session, BOOK, NAMBA, dec("5000"))
    const parlor = { identity: NAMBA.identity, name: NAMBA.parlorName, pools: [NAMBA.pool] }
    await adjustBalance(session, BOOK, parlor, NAMBA.pool, "2026-10-05" as IsoDate, dec("4820"))
    expect(await adjustBalance(session, BOOK, parlor, NAMBA.pool, "2026-10-07" as IsoDate, dec("4820"))).toEqual({ ok: true, value: { type: "unchanged" } })
    const earlier = await adjustBalance(session, BOOK, parlor, NAMBA.pool, "2026-10-03" as IsoDate, dec("4900"))
    expect(earlier.ok && earlier.value.type === "adjusted" && toPlainString(earlier.value.difference)).toBe("-100")
  })
})

describe("savings exchanged for prizes", () => {
  const madeUpBook = async () => setUp(await fixtureBook("basic-play", { id: BOOK, members: [{ id: ME, displayName: "me", role: "owner" }] }))
  const EXCHANGE = { parlor: UMEDA, pool: { kind: "ball", tier: "4円" } as const, date: "2026-10-04" as IsoDate, tokens: dec("4000"), specialPrizes: dec("13800") }
  const results = async (session: Awaited<ReturnType<typeof setUp>>["session"], query: string) =>
    ((overview) => overview.ok && [toPlainString(overview.value.actual), toPlainString(overview.value.theoretical), toPlainString(overview.value.savings)])(await loadOverview(session, BOOK, query))

  test("leave the pool as prizes, and are no result of any day", async () => {
    const { session, storage, history } = await madeUpBook()
    expect(await recordPrizeExchange(session, BOOK, EXCHANGE)).toEqual({ ok: true, value: undefined })
    expect(await held(session)).toContainEqual(["ホシゾラ梅田店", "4円", "800"])
    expect(await results(session, "date:2026-10-04")).toEqual(["0", "0", "54808"])
    const files = storage.peek(BOOK)?.files
    expect(files?.[BOOK_FILES.accounts]).toContain("account 純資産:特殊景品\naccount 純資産:端玉景品\naccount 純資産:換算調整勘定")
    expect(files?.[BOOK_FILES.transactions]).toContain("2026-10-04 ホシゾラ梅田店 | 景品交換  ; parlor-id: hoshizora-umeda, savings: prize-exchange")
    const activity = await loadActivity(session, history, BOOK)
    expect(activity.ok && activity.value.lines.map((line) => [line.did, saidIn(line.parts)]).at(-1)).toEqual(["savings-exchanged", { pool: { parlor: "ホシゾラ梅田店", tier: "4円" } }])
  })

  test("leave every result as it was", async () => {
    const { session } = await madeUpBook()
    expect(await results(session, "")).toEqual(["39144", "13200", "68808"])
    await recordPrizeExchange(session, BOOK, EXCHANGE)
    expect(await results(session, "date:2026-09")).toEqual(["41142", "10500", "54808"])
    expect(await results(session, "")).toEqual(["39144", "13200", "54808"])
  })

  test("are refused beyond what the pool holds by that day, and nothing is written", async () => {
    const { session, storage } = await madeUpBook()
    const before = storage.peek(BOOK)?.files
    expect(await recordPrizeExchange(session, BOOK, { ...EXCHANGE, tokens: dec("4801") })).toEqual({ ok: false, error: { type: "prize-exchange", problem: { type: "savings-short", kind: "ball", held: dec("4800") } } })
    expect(await recordPrizeExchange(session, BOOK, { ...EXCHANGE, date: "2026-09-01" as IsoDate })).toEqual({ ok: false, error: { type: "prize-exchange", problem: { type: "savings-short", kind: "ball", held: dec("0") } } })
    expect(storage.peek(BOOK)?.files).toEqual(before as never)
  })
})
