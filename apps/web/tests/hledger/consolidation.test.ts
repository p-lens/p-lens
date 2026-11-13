import { describe, expect, test } from "bun:test"
import { Ok } from "../../src/core/result/result"
import { BOOK_FILES } from "../../src/core/journal/layout"

import { createBookSession } from "../../src/application/book-session"
import { consolidationKeepsTheoreticalValues, loadConsolidatedHoldings, loadConsolidatedRates, loadConsolidatedSenderNames, loadConsolidation, type ConsolidatedGrouping } from "../../src/application/consolidation"
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
import { createAbsentSummaries } from "../../src/consolidation/absent/absent-summaries"
import { createMemorySummaries } from "../../src/consolidation/memory/memory-summaries"
import { webCryptoJournalsDigest } from "../../src/consolidation/web-crypto/journals-digest"
import type { BookSession } from "../../src/application/book-session"
import { consolidationPorts, oneLane, createOutdatedNotice, loadConsolidatedOverall, warmConsolidation } from "../../src/application/consolidation"

const [MINE, THEIRS, EMPTY] = ["mine", "theirs", "empty"] as BookId[]

/** The consolidation as these tests ask it: keeping nothing, so every figure is hledger's of the books as they stand. */
const consolidated = (session: BookSession) =>
  consolidationPorts({ session, lanes: oneLane(session), summaries: createAbsentSummaries(), digest: webCryptoJournalsDigest, today: () => "2026-10-09" as IsoDate, afterShown: (work) => work(), outdated: createOutdatedNotice() })

const setUp = async () => {
  const session = createBookSession({
    hledger: await inProcessHledger(),
    storage: memoryStorage(),
    history: createMemoryHistory(() => crypto.randomUUID()),
    clock: () => new Date("2026-10-09T20:00:00+09:00"),
    newId: () => crypto.randomUUID(),
    member: ME,
  })
  await session.createBook(await fixtureBook("basic-play", { id: MINE as BookId, members: [{ id: ME, displayName: "me", role: "owner" }] }))
  await session.createBook(await fixtureBook("basic-play", { id: THEIRS as BookId, members: [{ id: ME, displayName: "me", role: "viewer" }] }))
  await session.createBook(firstBook(EMPTY as BookId, ME, "マイ帳簿"))
  return session
}

const read = async (session: Awaited<ReturnType<typeof setUp>>, chosen: readonly BookId[] | undefined, by: ConsolidatedGrouping, query: string) => {
  const found = await loadConsolidation(consolidated(session), chosen, by, query)
  return found.ok && found.value.map((each) => [each.book.id, each.read.ok && each.read.value.map((group) => [group.key, toPlainString(group.actual), toPlainString(group.theoretical)])])
}

describe("several books consolidated", () => {
  test("are every book on the device, each one's results its own, book by book", async () => {
    const session = await setUp()
    expect(await read(session, undefined, "book", "")).toEqual([
      [MINE, [[MINE, "39144", "13200"]]],
      [THEIRS, [[THEIRS, "39144", "13200"]]],
      [EMPTY, [[EMPTY, "0", "0"]]],
    ] as never)
  })

  test("are only the books chosen, for the period asked about, grouped as one book's results are", async () => {
    const session = await setUp()
    const both = await read(session, [MINE as BookId, THEIRS as BookId], "machine", "date:2026-09")
    expect(both).toEqual([
      [
        MINE,
        [
          ["ピエロット", "20030", "1800"],
          ["森物語", "15976", "3200"],
          ["流星", "5136", "5500"],
        ],
      ],
      [
        THEIRS,
        [
          ["ピエロット", "20030", "1800"],
          ["森物語", "15976", "3200"],
          ["流星", "5136", "5500"],
        ],
      ],
    ] as never)
    const merged_ = merged(
      (await loadConsolidation(consolidated(session), [MINE as BookId, THEIRS as BookId], "machine", "date:2026-09").then((found) => (found.ok ? found.value : []))).flatMap((each) =>
        each.read.ok ? [each.read.value] : [],
      ),
    )
    expect(merged_.map((group) => [group.key, toPlainString(group.actual)])).toEqual([
      ["ピエロット", "40060"],
      ["森物語", "31952"],
      ["流星", "10272"],
    ])
    expect(await read(session, [EMPTY as BookId, "gone" as BookId], "month", "")).toEqual([[EMPTY, []]] as never)
  })

  test("hold what each book holds, book by book, and together the books' own totals added", async () => {
    const session = await setUp()
    const found = await loadConsolidatedHoldings(consolidated(session), undefined, "")
    const alone = await loadHoldings(session, MINE as BookId, "")
    const books = found.ok ? found.value : []
    expect(books.map((each) => each.book.id)).toEqual([MINE, THEIRS, EMPTY] as never)
    expect(books[0]?.read).toEqual(alone)
    const read = books.flatMap((each) => (each.read.ok ? [each.read.value] : []))
    expect(read.length).toBe(3)
    expect(alone.ok && toPlainString(totalAcross(read))).toBe(alone.ok ? toPlainString({ mantissa: alone.value.total.mantissa * 2n, places: alone.value.total.places }) : "")
    expect(latestValuedOn(read)).toBe(alone.ok ? alone.value.valuedOn : undefined)
    const one = await loadConsolidatedHoldings(consolidated(session), [EMPTY as BookId], "")
    expect(one.ok && one.value.map((each) => [each.book.id, each.read.ok && each.read.value.parlors.length])).toEqual([[EMPTY, 0]] as never)
  })

  test("keep theoretical values where any of the books chosen does", async () => {
    const session = await setUp()
    expect(await consolidationKeepsTheoreticalValues(consolidated(session), undefined)).toEqual({ ok: true, value: true })
    expect(await consolidationKeepsTheoreticalValues(consolidated(session), [MINE as BookId, EMPTY as BookId])).toEqual({ ok: true, value: true })
    expect(await consolidationKeepsTheoreticalValues(consolidated(session), [EMPTY as BookId])).toEqual({ ok: true, value: false })
  })

  test("are grouped by who played them, a sender by the id their tallies carry and named by the last, the book's own tallies apart", async () => {
    const session = await setUp()
    const sent = (id: string, date: string, sender: { readonly id: string; readonly name: string }) =>
      recordTokenTally(session, MINE as BookId, { ...RENTED_PLAY, id: id as PlayId, date: date as IsoDate, sender })
    await sent("hanma-1", "2026-10-01", { id: "grant-hanma", name: "ハンマ" })
    await sent("hanma-2", "2026-10-03", { id: "grant-hanma", name: "ハナヤマ" })
    await sent("jack-1", "2026-10-02", { id: "grant-jack", name: "ジャック" })
    const found = await read(session, [MINE as BookId], "sender", "date:2026-10")
    const groups = found === false ? [] : (found[0]?.[1] as readonly (readonly string[])[])
    expect(groups.map((group) => group[0]).toSorted()).toEqual(["", "grant-hanma", "grant-jack"])
    const figuresOf = async (by: ConsolidatedGrouping) =>
      ((found) => (found.ok ? found.value.flatMap((each) => (each.read.ok ? each.read.value.map((group) => [toPlainString(group.actual), toPlainString(group.theoretical)]) : [])) : []))(
        await loadConsolidation(consolidated(session), [MINE as BookId], by, "date:2026-09"),
      )
    expect(await read(session, [MINE as BookId], "sender", "date:2026-09")).toEqual([[MINE, [["", ...((await figuresOf("book"))[0] ?? [])]]]] as never)
    const names = await loadConsolidatedSenderNames(consolidated(session), undefined)
    expect(names.ok && [...names.value].toSorted()).toEqual([
      ["grant-hanma", { name: "ハナヤマ", date: "2026-10-03" }],
      ["grant-jack", { name: "ジャック", date: "2026-10-02" }],
    ] as never)
  })
})

describe("a consolidation keeping each book's answers", () => {
  const keeping = async () => {
    const session = await setUp()
    const opened: string[] = []
    const watched: BookSession = { ...session, read: (bookId, work) => (opened.push(bookId), session.read(bookId, work)) }
    const outdated = createOutdatedNotice()
    const told = { times: 0 }
    outdated.heard(() => (told.times += 1))
    const ports = consolidationPorts({ session: watched, lanes: oneLane(watched), summaries: createMemorySummaries(), digest: webCryptoJournalsDigest, today: () => "2026-10-09" as IsoDate, afterShown: (work) => work(), outdated })
    const actualOf = async (answering: "at-once" | "when-checked") =>
      ((found) => (found.ok ? found.value.map((each) => [each.book.id, each.read.ok ? toPlainString(each.read.value.actual) : "unread"]) : found))(
        await loadConsolidatedOverall({ ...ports, answering }, undefined, ""),
      )
    return { session, opened, told, actualOf }
  }

  test("answers again from what it kept, never opening a book unchanged", async () => {
    const { opened, told, actualOf } = await keeping()
    const first = await actualOf("at-once")
    expect(opened.length).toBeGreaterThan(0)
    opened.length = 0
    expect(await actualOf("when-checked")).toEqual(first)
    expect(await actualOf("at-once")).toEqual(first)
    expect(opened).toEqual([])
    expect(told.times).toBe(0)
  })

  test("shows a book written since as it was at once, asks hledger of it alone after, and tells whoever showed it", async () => {
    const { session, opened, told, actualOf } = await keeping()
    const first = await actualOf("at-once")
    await recordTokenTally(session, MINE as BookId, { ...RENTED_PLAY, id: "made-up-kept" as PlayId, date: "2026-10-08" as IsoDate })
    opened.length = 0
    expect(await actualOf("at-once")).toEqual(first)
    const checked = await actualOf("when-checked")
    expect(checked).not.toEqual(first)
    expect(opened.length).toBeGreaterThan(0)
    expect(opened.every((id) => id === MINE)).toBe(true)
    expect(told.times).toBeGreaterThan(0)
    expect(await actualOf("at-once")).toEqual(checked)
  })
})

describe("a consolidation narrowed", () => {
  test("keeps each book to the tallies narrowed to, grouped every way, book by book and taken as one", async () => {
    const session = await setUp()
    const ports = consolidated(session)
    const both = [MINE, THEIRS] as BookId[]
    const pachislot = { game: ["pachislot"] }
    const found = await loadConsolidation(ports, both, "machine", "", { rate: ["ball:4円"], parlor: ["723豚の帽子亭店"] })
    expect(found.ok && found.value.map((each) => each.read.ok && each.read.value.map((group) => [group.key, toPlainString(group.actual)]))).toEqual([[["森物語", "13978"]], [["森物語", "13978"]]])
    const books = await loadConsolidation(ports, both, "book", "", pachislot)
    expect(books.ok && books.value.map((each) => each.read.ok && each.read.value.map((group) => [group.key, toPlainString(group.actual)]))).toEqual([[[MINE, "20030"]], [[THEIRS, "20030"]]] as never)
    const overall = await loadConsolidatedOverall(ports, both, "", pachislot)
    expect(overall.ok && overall.value.map((each) => each.read.ok && each.read.value.plays)).toEqual([1, 1])
    expect(await loadConsolidatedRates(ports, undefined)).toEqual({ ok: true, value: ["medal:20円", "ball:4円"] })
  })

  test("is never answered with what was kept for the same question narrowed otherwise", async () => {
    const session = await setUp()
    const ports = { ...consolidationPorts({ session, lanes: oneLane(session), summaries: createMemorySummaries(), digest: webCryptoJournalsDigest, today: () => "2026-10-09" as IsoDate, afterShown: (work) => work(), outdated: createOutdatedNotice() }), answering: "when-checked" as const }
    const keys = async (narrowing: Parameters<typeof loadConsolidation>[4]) =>
      ((found) => (found.ok ? found.value.flatMap((each) => (each.read.ok ? each.read.value.map((group) => group.key) : [])) : found))(await loadConsolidation(ports, [MINE as BookId], "machine", "", narrowing))
    expect(await keys(undefined)).toEqual(["ピエロット", "森物語", "流星"])
    expect(await keys({ game: ["pachislot"] })).toEqual(["ピエロット"])
    expect(await keys({ game: ["pachinko"] })).toEqual(["森物語", "流星"])
    expect(await keys(undefined)).toEqual(["ピエロット", "森物語", "流星"])
  })
})

describe("a consolidation asked again the next day", () => {
  test("answers what no day changes from what it kept, and what stands as of today until a rate since is in force", async () => {
    const session = await setUp()
    const opened: string[] = []
    const watched: BookSession = { ...session, read: (bookId, work) => (opened.push(bookId), session.read(bookId, work)) }
    const day = { today: "2026-10-09" as IsoDate }
    const ports = { ...consolidationPorts({ session: watched, lanes: oneLane(watched), summaries: createMemorySummaries(), digest: webCryptoJournalsDigest, today: () => day.today, afterShown: (work) => work(), outdated: createOutdatedNotice() }), answering: "when-checked" as const }
    const overall = await loadConsolidatedOverall(ports, [MINE as BookId], "")
    await loadConsolidatedHoldings(ports, [MINE as BookId], "")
    day.today = "2026-10-10" as IsoDate
    opened.length = 0
    expect(await loadConsolidatedOverall(ports, [MINE as BookId], "")).toEqual(overall)
    await loadConsolidatedHoldings(ports, [MINE as BookId], "")
    expect(opened).toEqual([])
    const stored = await session.stored(MINE as BookId)
    const prices = stored.ok ? (stored.value.files[BOOK_FILES.prices] ?? "") : ""
    const rate = prices.split("\n").find((line) => line.startsWith("P ")) ?? ""
    await session.write(MINE as BookId, async (_journal, kept) => Ok({ files: { ...kept.files, [BOOK_FILES.prices]: `${prices}${rate.replace(/^P \S+/, "P 2026-10-12").replace(/ [\d.]+ JPY$/, " 3.2 JPY")}\n` }, intent: { type: "file-edited", path: BOOK_FILES.prices } }))
    opened.length = 0
    await loadConsolidatedHoldings(ports, [MINE as BookId], "")
    expect(opened).toEqual([MINE as BookId])
    day.today = "2026-10-12" as IsoDate
    opened.length = 0
    await loadConsolidatedHoldings(ports, [MINE as BookId], "")
    expect(opened).toEqual([MINE as BookId])
  })
})

describe("a consolidation read on several hledgers", () => {
  test("deals the books out among them, answers as one hledger reading them in turn would, in the books' order, and says when it works on several", async () => {
    const storage = memoryStorage()
    const sessionOn = async () =>
      createBookSession({ hledger: await inProcessHledger(), storage, history: createMemoryHistory(() => crypto.randomUUID()), clock: () => new Date("2026-10-09T20:00:00+09:00"), newId: () => crypto.randomUUID(), member: ME })
    const [first, second] = [await sessionOn(), await sessionOn()]
    await first.createBook(await fixtureBook("basic-play", { id: MINE as BookId, members: [{ id: ME, displayName: "me", role: "owner" }] }))
    await first.createBook(await fixtureBook("basic-play", { id: THEIRS as BookId, members: [{ id: ME, displayName: "me", role: "viewer" }] }))
    await first.createBook(firstBook(EMPTY as BookId, ME, "マイ帳簿"))
    const opened: string[] = []
    const watchedOn = (session: BookSession, lane: string): BookSession => ({ ...session, read: (bookId, work) => (opened.push(`${lane}:${bookId}`), session.read(bookId, work)) })
    const working: boolean[] = []
    const lanes = { sessionsFor: () => [watchedOn(first, "first"), watchedOn(second, "second")], working: (busy: boolean) => void working.push(busy) }
    const portsOn = (laned: boolean) => ({ ...consolidationPorts({ session: first, lanes: laned ? lanes : oneLane(first), summaries: createAbsentSummaries(), digest: webCryptoJournalsDigest, today: () => "2026-10-09" as IsoDate, afterShown: (work) => work(), outdated: createOutdatedNotice() }), answering: "when-checked" as const })
    const [several, one] = [await loadConsolidatedOverall(portsOn(true), undefined, ""), await loadConsolidatedOverall(portsOn(false), undefined, "")]
    expect(several).toEqual(one)
    expect(several.ok && several.value.map((each) => each.book.id)).toEqual([MINE, THEIRS, EMPTY] as never)
    expect(opened.toSorted()).toEqual([`first:${String(EMPTY)}`, `first:${String(MINE)}`, `second:${String(THEIRS)}`])
    expect(working).toEqual([true, false])
  })
})

describe("a consolidation asked ahead on several hledgers", () => {
  test("asks each book on the hledger a screen would read it on, all of them side by side", async () => {
    const storage = memoryStorage()
    const sessionOn = async () =>
      createBookSession({ hledger: await inProcessHledger(), storage, history: createMemoryHistory(() => crypto.randomUUID()), clock: () => new Date("2026-10-09T20:00:00+09:00"), newId: () => crypto.randomUUID(), member: ME })
    const [first, second] = [await sessionOn(), await sessionOn()]
    await first.createBook(await fixtureBook("basic-play", { id: MINE as BookId, members: [{ id: ME, displayName: "me", role: "owner" }] }))
    await first.createBook(await fixtureBook("basic-play", { id: THEIRS as BookId, members: [{ id: ME, displayName: "me", role: "viewer" }] }))
    const opened = new Set<string>()
    const watchedOn = (session: BookSession, lane: string): BookSession => ({ ...session, read: (bookId, work) => (opened.add(`${lane}:${bookId}`), session.read(bookId, work)), readViewed: (bookId, view, work) => (opened.add(`${lane}:${bookId}`), session.readViewed(bookId, view, work)) })
    const working: boolean[] = []
    const lanes = { sessionsFor: () => [watchedOn(first, "first"), watchedOn(second, "second")], working: (busy: boolean) => void working.push(busy) }
    const ports = consolidationPorts({ session: first, lanes, summaries: createMemorySummaries(), digest: webCryptoJournalsDigest, today: () => "2026-10-09" as IsoDate, afterShown: (work) => work(), outdated: createOutdatedNotice() })
    await warmConsolidation(ports, { month: "date:2026-10", periods: ["date:2026-01-01..2027-01-01"] })
    expect([...opened].toSorted()).toEqual([`first:${String(MINE)}`, `second:${String(THEIRS)}`])
    expect(working).toEqual([true, false])
  })

  test("lists the books once, not once for each question of each book", async () => {
    const session = await setUp()
    const listings = { count: 0 }
    const counted: BookSession = { ...session, books: () => ((listings.count += 1), session.books()) }
    await warmConsolidation(consolidated(counted), { month: "date:2026-10", periods: ["date:2026-01-01..2027-01-01"] })
    expect(listings.count).toBe(1)
  })
})
