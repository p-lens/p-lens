import { beforeAll, describe, expect, test } from "bun:test"

import { createBookSession, type BookSession } from "../../src/application/book-session"
import { loadBreakdown, loadRates } from "../../src/application/breakdown"
import { loadOverall } from "../../src/application/overall"
import { loadTallies } from "../../src/application/tallies"
import { importPrecord, previewPrecord } from "../../src/application/import"
import type { BookId } from "../../src/core/book/book"
import { toPlainString } from "../../src/core/decimal/decimal"
import { totalOf, type Dimension } from "../../src/core/report/breakdown"
import { EVERY_TALLY, type Narrowing } from "../../src/core/report/narrowing"
import { Ok } from "../../src/core/result/result"
import { createMemoryHistory } from "../../src/history/adapters/memory-history"
import { queryOf } from "../../src/ui/features/period/periods"
import { ME, fixtureBook, inProcessHledger, memoryStorage } from "../support/in-process"
import { recordYenTally } from "../../src/application/record-tally"
import type { IsoDate } from "../../src/core/calendar/calendar"
import type { PlayId } from "../../src/core/play/play"
import type { YenTally } from "../../src/core/tally/tally"
import { MALEHAN, dec } from "../support/values"

const BOOK = "basic-play" as BookId

describe("the basic-play book, broken down by the real hledger module", () => {
  const context: { session?: BookSession } = {}
  const session = (): BookSession => context.session as BookSession
  const read = async (dimension: Dimension, query = "", narrowing: Narrowing = EVERY_TALLY) =>
    ((found) => (found.ok ? found.value.map((group) => [group.key, toPlainString(group.actual), toPlainString(group.theoretical)]) : found))(await loadBreakdown(session(), BOOK, dimension, query, narrowing))

  beforeAll(async () => {
    const storage = memoryStorage()
    context.session = createBookSession({ hledger: await inProcessHledger(), storage, history: createMemoryHistory(() => crypto.randomUUID()), clock: () => new Date("2026-10-09T12:00:00+09:00"), newId: () => crypto.randomUUID(), member: ME })
    await session().createBook(await fixtureBook("basic-play", { id: BOOK, members: [{ id: ME, displayName: "me", role: "owner" }] }))
  })

  test("taken as one: its tallies and days counted, every sum hledger's", async () => {
    const found = await loadOverall(session(), BOOK, "")
    expect(found.ok && { ...found.value, days: found.value.days.map((day) => [day.day, toPlainString(day.actual)]), actual: toPlainString(found.value.actual), theoretical: toPlainString(found.value.theoretical), inferred: toPlainString(found.value.inferred), cash: toPlainString(found.value.cash), specialPrizes: toPlainString(found.value.specialPrizes), oddPrizes: toPlainString(found.value.oddPrizes), translationAdjustment: toPlainString(found.value.translationAdjustment), savingsDrawn: toPlainString(found.value.savingsDrawn), spent: toPlainString(found.value.spent), returned: toPlainString(found.value.returned), rentalSpread: toPlainString(found.value.rentalSpread), replayFee: toPlainString(found.value.replayFee), playSeconds: found.value.playSeconds === undefined ? undefined : toPlainString(found.value.playSeconds) }).toEqual({
      plays: 5,
      playsWon: 3,
      days: [
        ["2026-09-05", "5136"],
        ["2026-09-12", "20030"],
        ["2026-09-20", "15976"],
        ["2026-10-01", "0"],
        ["2026-10-03", "-1998"],
      ],
      actual: "39144",
      theoretical: "13200",
      inferred: "0",
      cash: "30000",
      spent: "53990",
      returned: "93134",
      rentalSpread: "4258",
      replayFee: "0",
      playSeconds: "19800",
      specialPrizes: "0",
      oddPrizes: "0",
      translationAdjustment: "0",
      savingsDrawn: "23990",
    } as never)
  })

  test("by machine and by game, each group hledger's own sum, best first", async () => {
    expect(await read("machine")).toEqual([["ピエロット", "20030", "1800"], ["森物語", "13978", "4100"], ["流星", "5136", "7300"]])
    expect(await read("game")).toEqual([["pachislot", "20030", "1800"], ["pachinko", "19114", "11400"]])
  })

  test("by parlor, under the name the book gives each", async () => {
    expect(await read("parlor")).toEqual([["723豚の帽子亭店", "34008", "5900"], ["マレハン東京皇国第8支店", "5136", "7300"]])
  })

  test("narrowed to a game, a parlor or a machine, and to several at once, each the tallies that say it", async () => {
    expect(await read("parlor", "", { game: ["pachinko"] })).toEqual([["723豚の帽子亭店", "13978", "4100"], ["マレハン東京皇国第8支店", "5136", "7300"]])
    expect(await read("machine", "", { parlor: ["723豚の帽子亭店"] })).toEqual([["ピエロット", "20030", "1800"], ["森物語", "13978", "4100"]])
    expect(await read("parlor", "", { machine: ["流星", "ピエロット"] })).toEqual([["723豚の帽子亭店", "20030", "1800"], ["マレハン東京皇国第8支店", "5136", "7300"]])
    expect(await read("machine", "", { game: ["pachislot"], parlor: ["723豚の帽子亭店"] })).toEqual([["ピエロット", "20030", "1800"]])
    expect(await read("machine", "date:2026-10", { parlor: ["マレハン東京皇国第8支店"] })).toEqual([["流星", "0", "1800"]])
    expect(await read("month", "", { parlor: ["存在しない店"] })).toEqual([])
  })

  test("narrowed to a rate, the tallies that played its tokens at any parlor, beside the period and what else is narrowed", async () => {
    expect(await loadRates(session(), BOOK)).toEqual({ ok: true, value: ["ball:4円", "medal:20円"] })
    expect(await read("parlor", "", { rate: ["ball:4円"] })).toEqual([["723豚の帽子亭店", "13978", "4100"], ["マレハン東京皇国第8支店", "5136", "7300"]])
    expect(await read("machine", "", { rate: ["medal:20円"] })).toEqual([["ピエロット", "20030", "1800"]])
    expect(await read("machine", "date:2026-10", { rate: ["ball:4円"], parlor: ["723豚の帽子亭店"] })).toEqual([["森物語", "-1998", "900"]])
    expect(await read("machine", "", { rate: ["ball:1円"] })).toEqual([])
    expect(await read("machine", "", { rate: ["ball:4円", "medal:20円"] })).toEqual([["ピエロット", "20030", "1800"], ["森物語", "13978", "4100"], ["流星", "5136", "7300"]])
  })

  test("taken as one and narrowed, its tallies counted among those it keeps to", async () => {
    const found = await loadOverall(session(), BOOK, "", { game: ["pachinko"] })
    expect(found.ok && [found.value.plays, toPlainString(found.value.actual), toPlainString(found.value.theoretical)]).toEqual([4, "19114", "11400"])
  })

  test("by year, month and day, newest first, and by the day of the week from Monday", async () => {
    expect(await read("year")).toEqual([["2026", "39144", "13200"]])
    expect(await read("month")).toEqual([["2026-10", "-1998", "2700"], ["2026-09", "41142", "10500"]])
    expect(await read("day")).toEqual([["2026-10-03", "-1998", "900"], ["2026-10-01", "0", "1800"], ["2026-09-20", "15976", "3200"], ["2026-09-12", "20030", "1800"], ["2026-09-05", "5136", "5500"]])
    expect(await read("weekday")).toEqual([["3", "0", "1800"], ["5", "23168", "8200"], ["6", "15976", "3200"]])
  })

  test("for a period, and to the same total and play time whichever way it is cut", async () => {
    expect(await read("machine", "date:2026-10")).toEqual([["流星", "0", "1800"], ["森物語", "-1998", "900"]])
    const totals = await Promise.all((["machine", "parlor", "game", "year", "month", "day", "weekday"] as const).map(async (dimension) => ((found) => (found.ok ? ((total) => [toPlainString(total.actual), toPlainString(total.theoretical), toPlainString(total.seconds)])(totalOf(found.value)) : found))(await loadBreakdown(session(), BOOK, dimension, ""))))
    expect(totals).toEqual(Array.from({ length: 7 }, () => ["39144", "13200", "19800"]))
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
    const catalog = { search: async () => Ok([]) } as never
    const preview = await previewPrecord({ catalog }, file)
    if (preview.ok) await importPrecord({ session: session(), catalog }, BOOK, preview.value, new Map(), undefined)
    expect(await read("machine", "date:2019")).toEqual([["昔の台", "-7000", "0"]])
    expect(await read("parlor", "date:2019")).toEqual([["駅前ホール", "-7000", "0"]])
    expect(await read("machine", "date:2019", { parlor: ["駅前ホール"] })).toEqual([["昔の台", "-7000", "0"]])
  })
})

describe("a book that wrote pachislot as `slot`, before the name was settled", () => {
  test("is read as pachislot, its plays one game with those written since", async () => {
    const OLDER = "older-play" as BookId
    const storage = memoryStorage()
    const session = createBookSession({ hledger: await inProcessHledger(), storage, history: createMemoryHistory(() => crypto.randomUUID()), clock: () => new Date("2026-10-09T12:00:00+09:00"), newId: () => crypto.randomUUID(), member: ME })
    const fixture = await fixtureBook("basic-play", { id: OLDER, members: [{ id: ME, displayName: "me", role: "owner" }] })
    const transactions = fixture.files["transactions/2026.journal"] ?? ""
    const earlier = (transactions.split("\n\n").find((entry) => entry.includes("game-kind: pachislot")) ?? "").replace("play-id: made-up-0912", "play-id: made-up-0911").replace("2026-09-12", "2026-09-11").replace("game-kind: pachislot", "game-kind: slot")
    await session.createBook({ ...fixture, files: { ...fixture.files, "transactions/2026.journal": `${earlier}\n\n${transactions}` } })
    const found = await loadBreakdown(session, OLDER, "game", "")
    expect(found.ok && found.value.map((group) => [group.key, toPlainString(group.actual)])).toEqual([["pachislot", "40060"], ["pachinko", "19114"]])
    const narrowed = await loadBreakdown(session, OLDER, "day", "", { game: ["pachislot"] })
    expect(narrowed.ok && narrowed.value.map((group) => group.key)).toEqual(["2026-09-12", "2026-09-11"])
    const tallies = await loadTallies(session, OLDER, "date:2026-09-11", 0)
    expect(tallies.ok && tallies.value.tallies.map((tally) => tally.gameKind)).toEqual(["pachislot"])
  })
})

describe("a book broken down by the words its tallies are tagged with", () => {
  const context: { session?: BookSession } = {}
  const session = (): BookSession => context.session as BookSession
  const read = async (dimension: Dimension, query = "", narrowing: Narrowing = EVERY_TALLY) =>
    ((found) => (found.ok ? found.value.map((group) => [group.key, toPlainString(group.actual)]) : found))(await loadBreakdown(session(), BOOK, dimension, query, narrowing))
  const tally = (id: string, takings: string, userTags: readonly string[], parlor = MALEHAN): YenTally => ({
    id: id as PlayId,
    date: "2026-10-05" as IsoDate,
    parlor,
    gameKind: "pachinko",
    machine: "流星",
    cabinetNumber: undefined,
    outlay: dec("10000"),
    takings: dec(takings),
    settlement: undefined,
    theoreticalValue: undefined,
    told: undefined,
    userTags,
  })

  beforeAll(async () => {
    const storage = memoryStorage()
    context.session = createBookSession({ hledger: await inProcessHledger(), storage, history: createMemoryHistory(() => crypto.randomUUID()), clock: () => new Date("2026-10-09T12:00:00+09:00"), newId: () => crypto.randomUUID(), member: ME })
    await session().createBook(await fixtureBook("basic-play", { id: BOOK, members: [{ id: ME, displayName: "me", role: "owner" }] }))
    await recordYenTally(session(), BOOK, tally("event-morning", "20000", ["イベント", "朝イチ"]))
    await recordYenTally(session(), BOOK, tally("event", "7000", ["イベント"]))
    await recordYenTally(session(), BOOK, tally("hyena", "15000", ["ハイエナ"]))
  })

  test("is a group a word, a tally tagged with several in each, and the tallies tagged with none together, best first", async () => {
    expect(await read("tag")).toEqual([["", "39144"], ["朝イチ", "10000"], ["イベント", "7000"], ["ハイエナ", "5000"]])
  })

  test("narrowed to words, is the tallies tagged with any of them, beside whatever else is narrowed", async () => {
    expect(await read("parlor", "", { tag: ["イベント"] })).toEqual([["マレハン東京皇国第8支店", "7000"]])
    expect(await read("tag", "", { tag: ["イベント", "ハイエナ"] })).toEqual([["朝イチ", "10000"], ["イベント", "7000"], ["ハイエナ", "5000"]])
    expect(await read("machine", "", { tag: ["朝イチ"], game: ["pachislot"] })).toEqual([])
    expect(await read("tag", "date:2026-10-05")).toEqual([["朝イチ", "10000"], ["イベント", "7000"], ["ハイエナ", "5000"]])
  })
})
