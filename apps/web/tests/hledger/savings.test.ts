import { yearFileOf } from "../../src/core/journal/filing"
import { describe, expect, test } from "bun:test"

import { firstBook } from "../../src/app/composition/first-book"
import { loadActivity } from "../../src/application/activity"
import { loadBreakdown } from "../../src/application/breakdown"
import { createBookSession } from "../../src/application/book-session"
import { loadHoldings } from "../../src/application/holdings"
import { loadOtherGains } from "../../src/application/other-gains"
import { loadOverall } from "../../src/application/overall"
import { loadOverview } from "../../src/application/overview"
import { adjustBalance, recordForfeiture, recordParlorForfeiture, recordPrizeExchange, registerOpeningBalance } from "../../src/application/savings"
import type { BookId } from "../../src/core/book/book"
import type { IsoDate } from "../../src/core/calendar/calendar"
import { toPlainString } from "../../src/core/decimal/decimal"
import { BOOK_FILES } from "../../src/core/journal/layout"
import type { PoolOpening } from "../../src/core/parlor/opening"
import type { ParlorId } from "../../src/core/parlor/parlor"
import { createMemoryHistory } from "../../src/history/adapters/memory-history"
import { ME, fixtureBook, inProcessHledger, memoryStorage, transactionsOf } from "../support/in-process"
import { MALEHAN, dec, saidIn } from "../support/values"

const BOOK = "mine" as BookId

const setUp = async (stored = firstBook(BOOK, ME, "マイ帳簿")) => {
  const storage = memoryStorage()
  const history = createMemoryHistory(() => crypto.randomUUID())
  const session = createBookSession({ hledger: await inProcessHledger(), storage, history, clock: () => new Date("2026-10-08T20:00:00+09:00"), newId: () => crypto.randomUUID(), member: ME })
  await session.createBook(stored)
  return { storage, history, session }
}

const NAMBA: PoolOpening = {
  identity: { type: "listed", id: "osm-9" as ParlorId },
  parlorName: "ダイナモなんかつ新館",
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
    expect(await held(session)).toEqual([["ダイナモなんかつ新館", "4円", "5000"]])
    const overview = await loadOverview(session, BOOK, "")
    expect(overview.ok && toPlainString(overview.value.actual)).toBe("0")
    const stored = await storage.readBook(BOOK)
    expect(stored.ok && transactionsOf(stored.value.files)).toContain("2026-10-01 ダイナモなんかつ新館 | 開始残高  ; parlor-id: osm-9, savings: opening\n")
    const activity = await loadActivity(session, history, BOOK)
    expect(activity.ok && activity.value.lines.map((line) => line.did)).toContain("savings-opened")
  })

  test("are put at the head of the book's transactions, and declared in a book made before savings could be set", async () => {
    const { session, storage } = await setUp(await fixtureBook("basic-play", { id: BOOK, members: [{ id: ME, displayName: "me", role: "owner" }] }))
    expect((await registerOpeningBalance(session, BOOK, NAMBA, dec("1200"))).ok).toBe(true)
    const stored = await storage.readBook(BOOK)
    expect(stored.ok && stored.value.files[yearFileOf("2026-10-01" as IsoDate)]?.startsWith("2026-10-01 ダイナモなんかつ新館 | 開始残高")).toBe(true)
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
      error: { type: "opening-balance-registered", parlor: "ダイナモなんかつ新館", tier: "4円" },
    })
    expect((await registerOpeningBalance(session, BOOK, { ...NAMBA, pool: { kind: "medal", tier: "20円" }, rate: dec("17.857143") }, dec("300"))).ok).toBe(true)
    expect(await held(session)).toEqual([
      ["ダイナモなんかつ新館", "20円", "300"],
      ["ダイナモなんかつ新館", "4円", "5000"],
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
    expect(await held(session)).toEqual([["ダイナモなんかつ新館", "4円", "4820"]])
    const up = await adjustBalance(session, BOOK, parlor, NAMBA.pool, "2026-10-06" as IsoDate, dec("4900"))
    expect(up.ok && up.value.type === "adjusted" && toPlainString(up.value.difference)).toBe("80")
    const overview = await loadOverview(session, BOOK, "")
    expect(overview.ok && toPlainString(overview.value.actual)).toBe("0")
    const stored = await storage.readBook(BOOK)
    expect(stored.ok && transactionsOf(stored.value.files)).toContain("2026-10-05 ダイナモなんかつ新館 | 残高調整  ; parlor-id: osm-9, savings: adjustment\n")
  })

  test("are told in the activity as the count they were set to on the day, and not as the difference", async () => {
    const { session, history } = await setUp()
    await registerOpeningBalance(session, BOOK, NAMBA, dec("5000"))
    const parlor = { identity: NAMBA.identity, name: NAMBA.parlorName, pools: [NAMBA.pool] }
    await adjustBalance(session, BOOK, parlor, NAMBA.pool, "2026-10-05" as IsoDate, dec("4820"))
    const activity = await loadActivity(session, history, BOOK)
    expect(activity.ok && activity.value.lines.map((line) => [line.did, saidIn(line.parts)]).at(-1)).toEqual(["savings-adjusted", { pool: { parlor: "ダイナモなんかつ新館", tier: "4円" }, savings: { date: "2026-10-05" as IsoDate, kind: "ball", tokens: dec("4820") } }])
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
  const EXCHANGE = { parlor: MALEHAN, pool: { kind: "ball", tier: "4円" } as const, date: "2026-10-04" as IsoDate, tokens: dec("4000"), specialPrizes: dec("13800") }
  const results = async (session: Awaited<ReturnType<typeof setUp>>["session"], query: string) =>
    ((overview) => overview.ok && [toPlainString(overview.value.actual), toPlainString(overview.value.theoretical), toPlainString(overview.value.savings)])(await loadOverview(session, BOOK, query))

  test("leave the pool as prizes, and are no result of any day", async () => {
    const { session, storage, history } = await madeUpBook()
    expect(await recordPrizeExchange(session, BOOK, EXCHANGE)).toEqual({ ok: true, value: undefined })
    expect(await held(session)).toContainEqual(["マレハン東京皇国第8支店", "4円", "800"])
    expect(await results(session, "date:2026-10-04")).toEqual(["0", "0", "54808"])
    const files = storage.peek(BOOK)?.files
    expect(files?.[BOOK_FILES.accounts]).toContain("account 純資産:特殊景品\naccount 純資産:端玉景品\naccount 純資産:換算調整勘定")
    expect(transactionsOf(files)).toContain("2026-10-04 マレハン東京皇国第8支店 | 景品交換  ; parlor-id: malehan-tokyokoukoku, savings: prize-exchange")
    const activity = await loadActivity(session, history, BOOK)
    expect(activity.ok && activity.value.lines.map((line) => [line.did, saidIn(line.parts)]).at(-1)).toEqual(["savings-exchanged", { pool: { parlor: "マレハン東京皇国第8支店", tier: "4円" }, savings: { date: "2026-10-04" as IsoDate, kind: "ball", tokens: dec("4000") }, prizes: { specialPrizes: dec("13800") } }])
  })

  test("give the odd tokens as odd prizes at the rental price, and leave hledger to balance the translation adjustment", async () => {
    const { session } = await madeUpBook()
    await recordPrizeExchange(session, BOOK, EXCHANGE)
    const overall = await loadOverall(session, BOOK, "date:2026-10-04")
    expect(overall.ok && [toPlainString(overall.value.specialPrizes), toPlainString(overall.value.oddPrizes), toPlainString(overall.value.translationAdjustment)]).toEqual(["13800", "228", "-28"])
  })

  test("keep the part of a yen hledger balances the translation adjustment to", async () => {
    const { session } = await madeUpBook()
    expect(await recordPrizeExchange(session, BOOK, { ...EXCHANGE, date: "2026-09-20" as IsoDate, tokens: dec("1455"), specialPrizes: dec("5000") })).toEqual({ ok: true, value: undefined })
    const overall = await loadOverall(session, BOOK, "date:2026-09-20")
    expect(overall.ok && [toPlainString(overall.value.oddPrizes), toPlainString(overall.value.translationAdjustment)]).toEqual(["220", "-25.65"])
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

describe("savings a parlor took back", () => {
  const madeUpBook = async () => setUp(await fixtureBook("basic-play", { id: BOOK, members: [{ id: ME, displayName: "me", role: "owner" }] }))
  const FORFEITURE = { parlor: MALEHAN, pool: { kind: "ball", tier: "4円" } as const, date: "2026-10-04" as IsoDate, tokens: dec("4000") }
  const results = async (session: Awaited<ReturnType<typeof setUp>>["session"], query: string) =>
    ((overview) => overview.ok && [toPlainString(overview.value.actual), toPlainString(overview.value.theoretical)])(await loadOverview(session, BOOK, query))

  test("leave the pool as a loss beside 収支, never in it, at the rate of the day, and are no play", async () => {
    const { session, storage, history } = await madeUpBook()
    const before = await results(session, "")
    const overallBefore = await loadOverall(session, BOOK, "")
    expect(await recordForfeiture(session, BOOK, FORFEITURE)).toEqual({ ok: true, value: undefined })
    expect(await held(session)).toContainEqual(["マレハン東京皇国第8支店", "4円", "800"])
    expect(await results(session, "date:2026-10-04")).toEqual(["0", "0"])
    expect(await results(session, "")).toEqual(before)
    expect(await loadOverall(session, BOOK, "")).toEqual(overallBefore)
    const gains = await loadOtherGains(session, BOOK, "date:2026-10-04")
    expect(gains.ok && toPlainString(gains.value.forfeited)).toBe("14000")
    const files = storage.peek(BOOK)?.files
    expect(files?.[BOOK_FILES.accounts]).toContain("account 費用:失効損\n")
    expect(transactionsOf(files)).toContain("2026-10-04 マレハン東京皇国第8支店 | 失効  ; parlor-id: malehan-tokyokoukoku, savings: forfeiture")
    expect(transactionsOf(files)).not.toContain("資産:現金                         -14000")
    const activity = await loadActivity(session, history, BOOK)
    expect(activity.ok && activity.value.lines.map((line) => line.did).at(-1)).toBe("savings-forfeited")
  })

  test("are no group of a breakdown, but その他損益 under it", async () => {
    const { session } = await madeUpBook()
    const before = await loadBreakdown(session, BOOK, "machine", "")
    await recordForfeiture(session, BOOK, FORFEITURE)
    const after = await loadBreakdown(session, BOOK, "machine", "")
    expect(after).toEqual(before)
    const gains = await loadOtherGains(session, BOOK, "")
    expect(gains.ok && toPlainString(gains.value.forfeited)).toBe("14000")
  })

  test("declare their account once, however many are recorded", async () => {
    const { session, storage } = await madeUpBook()
    await recordForfeiture(session, BOOK, { ...FORFEITURE, tokens: dec("1000") })
    await recordForfeiture(session, BOOK, { ...FORFEITURE, tokens: dec("1000") })
    expect(storage.peek(BOOK)?.files[BOOK_FILES.accounts]?.split("account 費用:失効損").length).toBe(2)
  })

  test("are refused beyond what the pool holds by that day, or where none were taken", async () => {
    const { session } = await madeUpBook()
    expect(await recordForfeiture(session, BOOK, { ...FORFEITURE, tokens: dec("4801") })).toEqual({ ok: false, error: { type: "forfeiture", problem: { type: "savings-short", kind: "ball", held: dec("4800") } } })
    expect(await recordForfeiture(session, BOOK, { ...FORFEITURE, tokens: dec("0") })).toEqual({ ok: false, error: { type: "forfeiture", problem: { type: "nothing-forfeited" } } })
  })

  test("of a whole parlor are every pool it holds any in, forfeited whole, each its own entry, and then nothing", async () => {
    const { session, history } = await madeUpBook()
    const forfeited = await recordParlorForfeiture(session, BOOK, MALEHAN, "2026-10-04" as IsoDate)
    expect(forfeited.ok && forfeited.value.map((each) => [each.pool.tier, toPlainString(each.tokens)])).toEqual([["4円", "4800"]])
    expect(await held(session, "date:..2026-10-05")).toEqual([["723修羅の国店", "20円", "1650"], ["723修羅の国店", "4円", "6600"], ["マレハン東京皇国第8支店", "4円", "0"], ["マレハン東京皇国第8支店", "20円", "0"]])
    const activity = await loadActivity(session, history, BOOK)
    expect(activity.ok && activity.value.lines.map((line) => line.did).at(-1)).toBe("savings-forfeited")
    expect(await recordParlorForfeiture(session, BOOK, MALEHAN, "2026-10-04" as IsoDate)).toEqual({ ok: true, value: [] })
  })
})
