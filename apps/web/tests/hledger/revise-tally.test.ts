import { describe, expect, test } from "bun:test"

import { loadActivity } from "../../src/application/activity"
import { createBookSession } from "../../src/application/book-session"
import { loadOverview } from "../../src/application/overview"
import { loadTally, loadTallies } from "../../src/application/tallies"
import { recordTokenTally, recordYenTally } from "../../src/application/record-tally"
import { loadRecordedTally, removeTally, reviseTokenTally, reviseYenTally } from "../../src/application/revise-tally"
import { loadBreakdown, loadSpinPerformances } from "../../src/application/breakdown"
import type { BookId } from "../../src/core/book/book"
import type { IsoDate } from "../../src/core/calendar/calendar"
import { toPlainString } from "../../src/core/decimal/decimal"
import { BOOK_FILES } from "../../src/core/journal/layout"
import { keptSpinPerformance } from "../../src/core/tally/aside"
import { allSpinPerformances, averageOf, mergedSpinPerformances, type SpinPerformances } from "../../src/core/report/spin-performance"
import type { TokenTally, YenTally } from "../../src/core/tally/tally"
import type { PlayId } from "../../src/core/play/play"
import { Ok, mapOk } from "../../src/core/result/result"
import { createMemoryHistory } from "../../src/history/adapters/memory-history"
import { ME, fixtureBook, inProcessHledger, memoryStorage } from "../support/in-process"
import { RENTED_PLAY, UMEDA, dec, saidIn } from "../support/values"

const BOOK = "revise" as BookId

const setUp = async (role: "owner" | "viewer" = "owner") => {
  const storage = memoryStorage()
  const history = createMemoryHistory(() => crypto.randomUUID())
  await storage.createBook(await fixtureBook("basic-play", { id: BOOK, members: [{ id: ME, displayName: "me", role }] }))
  const session = createBookSession({ hledger: await inProcessHledger(), storage, history, clock: () => new Date("2026-10-04T20:00:00+09:00"), newId: () => crypto.randomUUID(), member: ME })
  return { storage, history, session }
}

const TODAY: TokenTally = { ...RENTED_PLAY, id: "today" as PlayId, date: "2026-10-04" as IsoDate }

/** A tally that rented, replayed at a fee and left tokens: every sum a record can carry. */
const FULL: TokenTally = { ...TODAY, id: "full" as PlayId, rental: { outlay: dec("2000"), tokens: dec("500") }, replay: { paidOut: dec("1000"), deducted: dec("1100") }, payout: dec("2500"), cabinetNumber: undefined, theoreticalValue: undefined }

const TALLIED: YenTally = { id: "tally" as PlayId, date: "2026-10-04" as IsoDate, parlor: UMEDA, gameKind: "slot", machine: "スマスロ流星", cabinetNumber: "7", outlay: dec("15000"), takings: dec("3000"), settlement: undefined, theoreticalValue: dec("8000") , told: undefined}

const figures = async (session: Awaited<ReturnType<typeof setUp>>["session"], query: string) =>
  mapOk(await loadOverview(session, BOOK, query), (found) => [toPlainString(found.actual), toPlainString(found.theoretical)])

const recordedOf = async (session: Awaited<ReturnType<typeof setUp>>["session"], id: string) => mapOk(await loadRecordedTally(session, BOOK, ME, id as PlayId), (found) => found.recorded)

describe("a recorded tally, read back from its entry", () => {
  test("is the tally it was written from, whatever sums it carried", async () => {
    const { session } = await setUp()
    await recordTokenTally(session, BOOK, TODAY)
    await recordTokenTally(session, BOOK, FULL)
    expect(await recordedOf(session, "today")).toEqual({ ok: true, value: { type: "token", tally: TODAY } })
    expect(await recordedOf(session, "full")).toEqual({ ok: true, value: { type: "token", tally: FULL } })
  })

  test("is the tally kept in yen it was written from, a gain, a loss or an even day", async () => {
    const { session } = await setUp()
    const gain = { ...TALLIED, id: "gain" as PlayId, parlor: undefined, outlay: dec("0"), takings: dec("3000"), theoreticalValue: undefined }
    const even = { ...TALLIED, id: "even" as PlayId, outlay: dec("5000"), takings: dec("5000") }
    await recordYenTally(session, BOOK, TALLIED)
    await recordYenTally(session, BOOK, gain)
    await recordYenTally(session, BOOK, even)
    expect(await recordedOf(session, "tally")).toEqual({ ok: true, value: { type: "yen", tally: TALLIED } })
    expect(await recordedOf(session, "gain")).toEqual({ ok: true, value: { type: "yen", tally: gain } })
    expect(await recordedOf(session, "even")).toEqual({ ok: true, value: { type: "yen", tally: even } })
    const tallies = await loadTallies(session, BOOK, "", 0)
    const madeBy = (id: string): string | undefined => ((actual) => (actual === undefined ? undefined : toPlainString(actual)))((tallies.ok ? tallies.value.tallies : []).find((tally) => tally.id === id)?.actual)
    expect(["gain", "even"].map(madeBy)).toEqual(["3000", "0"])
  })

  test("keeps how a play at no parlor was settled, against savings the book does not keep or in cash and prizes, in a book hledger checks strictly", async () => {
    const { session, storage } = await setUp()
    const carried: YenTally = { ...TALLIED, id: "carried" as PlayId, parlor: undefined, outlay: dec("1000"), takings: dec("4000"), settlement: { type: "off-book-savings", cash: dec("1000") } }
    const spent: YenTally = { ...TALLIED, id: "spent" as PlayId, parlor: undefined, outlay: dec("6000"), takings: dec("0"), settlement: { type: "off-book-savings", cash: dec("1000") } }
    const prized: YenTally = { ...TALLIED, id: "prized" as PlayId, parlor: undefined, outlay: dec("12000"), takings: dec("30000"), settlement: { type: "cash-and-prizes" } }
    for (const tally of [carried, spent, prized]) expect((await recordYenTally(session, BOOK, tally)).ok).toBe(true)
    expect(await recordedOf(session, "carried")).toEqual({ ok: true, value: { type: "yen", tally: carried } })
    expect(await recordedOf(session, "spent")).toEqual({ ok: true, value: { type: "yen", tally: spent } })
    expect(await recordedOf(session, "prized")).toEqual({ ok: true, value: { type: "yen", tally: prized } })
    expect(storage.peek(BOOK)?.files[BOOK_FILES.accounts]).toContain("account 純資産:簿外貯メダル")
  })

  test("keeps when its play began and finished by the clock, a time written as a book writes one, and the spin performance its log measured", async () => {
    const { session } = await setUp()
    const timed: TokenTally = { ...TODAY, id: "timed" as PlayId, clock: { started: { hour: 9, minute: 5 }, finished: { hour: 23, minute: 40 } }, spinPerformance: keptSpinPerformance(18.234) }
    const finished: YenTally = { ...TALLIED, id: "finished" as PlayId, clock: { started: undefined, finished: { hour: 0, minute: 30 } } }
    await recordTokenTally(session, BOOK, timed)
    await recordYenTally(session, BOOK, finished)
    expect(await recordedOf(session, "timed")).toEqual({ ok: true, value: { type: "token", tally: timed } })
    expect(await recordedOf(session, "finished")).toEqual({ ok: true, value: { type: "yen", tally: finished } })
  })

  test("keeps who sent its play, so a tally a sender played is theirs still once set right", async () => {
    const { session } = await setUp()
    const sent: TokenTally = { ...TODAY, id: "sent" as PlayId, sender: { id: "grant-1", name: "けんじ" } }
    await recordTokenTally(session, BOOK, sent)
    expect(await recordedOf(session, "sent")).toEqual({ ok: true, value: { type: "token", tally: sent } })
  })

  test("keeps what was told of a tally and what it was taken to be worth, apart from what was measured and summed with it", async () => {
    const { session, storage } = await setUp()
    const told = { ...TALLIED, id: "told" as PlayId, theoreticalValue: undefined, told: { hours: dec("4.25"), jackpots: 8, inferred: { value: dec("-5300"), formulaId: "formula-1", tokenRental: dec("4"), tokenExchange: dec("28"), spinPerformance: dec("16.4") } } }
    const before = await figures(session, "")
    expect((await recordYenTally(session, BOOK, told)).ok).toBe(true)
    expect(await recordedOf(session, "told")).toEqual({ ok: true, value: { type: "yen", tally: told } })
    const text = storage.peek(BOOK)?.files[BOOK_FILES.transactions] ?? ""
    expect(text).toContain("hours: 4.25, jackpots: 8, inferred-formula: formula-1, token-rental: 4, token-exchange: 28")
    expect(text).toContain("(統計:期待値:推定)")
    const after = await figures(session, "")
    expect(after.ok && before.ok && Number(after.value[1]) - Number(before.value[1])).toBe(-5300)
    const inferredBy = async (dimension: "month" | "machine") => mapOk(await loadBreakdown(session, BOOK, dimension, ""), (groups) => groups.map((group) => [group.key, toPlainString(group.inferred)]))
    expect(await inferredBy("month")).toEqual({ ok: true, value: [["2026-10", "-5300"], ["2026-09", "0"]] })
    expect(mapOk(await inferredBy("machine"), (groups) => groups.filter(([, inferred]) => inferred !== "0"))).toEqual({ ok: true, value: [["スマスロ流星", "-5300"]] })
    const listed = await loadTallies(session, BOOK, "", 0)
    const row = listed.ok ? listed.value.tallies.find((tally) => tally.id === "told") : undefined
    expect([row?.theoreticalValue, row?.inferredValue === undefined ? undefined : toPlainString(row.inferredValue)]).toEqual([undefined, "-5300"])
    const given = { ...told, id: "given" as PlayId, theoreticalValue: dec("1200") }
    await recordYenTally(session, BOOK, given)
    expect(mapOk(await recordedOf(session, "given"), (found) => found.type === "yen" && [found.tally.theoreticalValue && toPlainString(found.tally.theoreticalValue), found.tally.told?.inferred])).toEqual({ ok: true, value: ["1200", undefined] })
  })

  test("keeps what an AT machine's tally was inferred to be worth from its history, its hours left unsaid", async () => {
    const { session, storage } = await setUp()
    const read = { ...TALLIED, id: "read" as PlayId, theoreticalValue: undefined, told: { hours: undefined, jackpots: undefined, inferred: { value: dec("-2100"), formulaId: "formula-2", tokenRental: dec("21.73913"), tokenExchange: dec("5.1"), spinPerformance: undefined } } }
    expect((await recordYenTally(session, BOOK, read)).ok).toBe(true)
    expect(await recordedOf(session, "read")).toEqual({ ok: true, value: { type: "yen", tally: read } })
    const text = storage.peek(BOOK)?.files[BOOK_FILES.transactions] ?? ""
    expect(text).toContain("cabinet-number: 7, inferred-formula: formula-2, token-rental: 21.73913, token-exchange: 5.1")
    expect(text).toContain("(統計:期待値:推定)")
  })

  test("lists every tally of the made-up book with what it made, the figure its own page gives", async () => {
    const { session } = await setUp()
    const tallies = await loadTallies(session, BOOK, "", 0)
    const listed = (tallies.ok ? tallies.value.tallies : []).map((tally) => (tally.actual === undefined ? undefined : toPlainString(tally.actual)))
    const alone = await Promise.all((tallies.ok ? tallies.value.tallies : []).map((tally) => loadTally(session, BOOK, tally.id)))
    expect(listed.length).toBe(5)
    expect(listed).toEqual(alone.map((each) => (each.ok ? toPlainString(each.value.actual) : undefined)))
  })

  test("reads every tally of the made-up book", async () => {
    const { session } = await setUp()
    const tallies = await loadTallies(session, BOOK, "", 0)
    const read = await Promise.all((tallies.ok ? tallies.value.tallies : []).map((tally) => recordedOf(session, tally.id)))
    expect(read.map((each) => each.ok && each.value.type)).toEqual(["token", "token", "token", "token", "token"])
  })

  test("is the same tally where its entry is one written when rented tokens still passed through savings", async () => {
    const { session, storage } = await setUp()
    const asWritten = await recordedOf(session, "made-up-0905")
    const text = storage.peek(BOOK)?.files[BOOK_FILES.transactions] ?? ""
    const older = text.replace(
      '    費用:遊技                        3000 "玉(4円・マレハン第3新東京店)" @ 3.57 JPY\n',
      '    資産:貯玉:マレハン第3新東京店:4円         3000 "玉(4円・マレハン第3新東京店)" @ 3.57 JPY\n    資産:貯玉:マレハン第3新東京店:4円         -3000 "玉(4円・マレハン第3新東京店)"\n    費用:遊技                        3000 "玉(4円・マレハン第3新東京店)"\n',
    )
    expect(older).not.toBe(text)
    const edited = await session.write(BOOK, async (_journal, stored) => Ok({ files: { ...stored.files, [BOOK_FILES.transactions]: older }, intent: { type: "file-edited", path: BOOK_FILES.transactions } }))
    expect(edited.ok).toBe(true)
    expect(asWritten.ok && asWritten.value.type).toBe("token")
    expect(await recordedOf(session, "made-up-0905")).toEqual(asWritten)
  })

  test("is read at its pool where cash alone was played and nothing was left, so that no savings account says which", async () => {
    const { session } = await setUp()
    const lost: TokenTally = { ...TODAY, id: "lost" as PlayId, payout: dec("0") }
    await recordTokenTally(session, BOOK, lost)
    expect(await recordedOf(session, "lost")).toEqual({ ok: true, value: { type: "token", tally: lost } })
  })

  test("is the tally it was written from where its play was begun with tokens in hand, a replay's fee beside them or not", async () => {
    const { session } = await setUp()
    const carried: TokenTally = { ...FULL, id: "carried" as PlayId, carriedIn: dec("1500") }
    const carriedOnly: TokenTally = { ...TODAY, id: "carried-only" as PlayId, rental: undefined, carriedIn: dec("1500"), payout: dec("0"), theoreticalValue: undefined }
    expect((await recordTokenTally(session, BOOK, carried)).ok).toBe(true)
    expect((await recordTokenTally(session, BOOK, carriedOnly)).ok).toBe(true)
    expect(await recordedOf(session, "carried")).toEqual({ ok: true, value: { type: "token", tally: carried } })
    expect(await recordedOf(session, "carried-only")).toEqual({ ok: true, value: { type: "token", tally: carriedOnly } })
  })

  test("is refused where its entry was changed by hand into what no form makes, and where the book has no such tally", async () => {
    const { session, storage } = await setUp()
    const text = storage.peek(BOOK)?.files[BOOK_FILES.transactions] ?? ""
    const byHand = text.replace("    費用:遊技                        3000 \"玉(4円・マレハン第3新東京店)\" @ 3.57 JPY\n", "    費用:遊技                        2000 \"玉(4円・マレハン第3新東京店)\" @ 3.57 JPY\n    費用:再プレイ手数料                  1000 \"玉(4円・マレハン第3新東京店)\" @ 3.57 JPY\n")
    expect(byHand).not.toBe(text)
    const edited = await session.write(BOOK, async (_journal, stored) => Ok({ files: { ...stored.files, [BOOK_FILES.transactions]: byHand }, intent: { type: "file-edited", path: BOOK_FILES.transactions } }))
    expect(edited.ok).toBe(true)
    expect(await recordedOf(session, "made-up-0905")).toEqual({ ok: false, error: { type: "tally-unreadable" } })
    expect(await recordedOf(session, "nowhere")).toEqual({ ok: false, error: { type: "tally-missing" } })
  })

  test("is refused where a tag on its entry was changed by hand into what no form writes, so setting it right loses none", async () => {
    const { session, storage } = await setUp()
    const text = storage.peek(BOOK)?.files[BOOK_FILES.transactions] ?? ""
    const withTag = (tag: string): string => text.replace("play-id: made-up-0905", `play-id: made-up-0905, ${tag}`)
    const refusedWith = async (tag: string): Promise<unknown> => {
      const edited = await session.write(BOOK, async (_journal, stored) => Ok({ files: { ...stored.files, [BOOK_FILES.transactions]: withTag(tag) }, intent: { type: "file-edited", path: BOOK_FILES.transactions } }))
      expect(edited.ok).toBe(true)
      return recordedOf(session, "made-up-0905")
    }
    expect(withTag("memo: x")).not.toBe(text)
    expect(await refusedWith("finished: 25:00")).toEqual({ ok: false, error: { type: "tally-unreadable" } })
    expect(await refusedWith("spin-performance: x")).toEqual({ ok: false, error: { type: "tally-unreadable" } })
    expect(await refusedWith("memo: x")).toEqual({ ok: false, error: { type: "tally-unreadable" } })
  })
})

describe("setting a recorded tally right", () => {
  test("writes its entry anew where it stood, and moves the figures to what it now says", async () => {
    const { session, storage } = await setUp()
    await recordTokenTally(session, BOOK, TODAY)
    await recordYenTally(session, BOOK, TALLIED)
    expect(await figures(session, "date:2026-10-04")).toEqual({ ok: true, value: ["-7200", "13500"] })
    const revised = await reviseTokenTally(session, BOOK, { ...TODAY, machine: "森物語", rental: { outlay: dec("16000"), tokens: dec("4000") }, theoreticalValue: dec("1000") })
    expect(revised.ok).toBe(true)
    expect(await figures(session, "date:2026-10-04")).toEqual({ ok: true, value: ["-11200", "9000"] })
    const transactions = storage.peek(BOOK)?.files[BOOK_FILES.transactions] ?? ""
    expect(transactions.match(/play-id: today,/g)?.length).toBe(1)
    expect(transactions.indexOf("play-id: today,")).toBeLessThan(transactions.indexOf("play-id: tally,"))
    expect(mapOk(await loadTally(session, BOOK, "today" as PlayId), (found) => found.summary.description)).toEqual({ ok: true, value: "マレハン第3新東京店 | 森物語 123番台" })
  })

  test("moves a tally to the day it now says, at that day's rate", async () => {
    const { session } = await setUp()
    await recordTokenTally(session, BOOK, TODAY)
    await reviseTokenTally(session, BOOK, { ...TODAY, date: "2026-09-10" as IsoDate })
    expect(await figures(session, "date:2026-10-04")).toEqual({ ok: true, value: ["0", "0"] })
    expect(await figures(session, "date:2026-09-10")).toEqual({ ok: true, value: ["5136", "5500"] })
  })

  test("moves a tally to a day before any rate the book has, giving that day the pool's first", async () => {
    const { session, storage } = await setUp()
    await recordTokenTally(session, BOOK, TODAY)
    const pricesBefore = storage.peek(BOOK)?.files[BOOK_FILES.prices] ?? ""
    expect((await reviseTokenTally(session, BOOK, { ...TODAY, date: "2016-10-11" as IsoDate })).ok).toBe(true)
    expect(storage.peek(BOOK)?.files[BOOK_FILES.prices]).toBe(`${pricesBefore}\nP 2016-10-11 "玉(4円・マレハン第3新東京店)" 3.57 JPY\n`)
    expect(await recordedOf(session, "today")).toEqual({ ok: true, value: { type: "token", tally: { ...TODAY, date: "2016-10-11" as IsoDate } } })
    expect((await recordTokenTally(session, BOOK, { ...TODAY, id: "older" as PlayId, date: "2016-10-10" as IsoDate })).ok).toBe(true)
  })

  test("sets a tally kept in yen right the same way", async () => {
    const { session } = await setUp()
    await recordYenTally(session, BOOK, TALLIED)
    await reviseYenTally(session, BOOK, { ...TALLIED, outlay: dec("1000"), takings: dec("5000"), theoreticalValue: undefined })
    expect(await figures(session, "date:2026-10-04")).toEqual({ ok: true, value: ["4000", "0"] })
  })

  test("says in the activity what was done, and is refused for a tally the book lacks or a member who may only read", async () => {
    const { session, history } = await setUp()
    await recordTokenTally(session, BOOK, TODAY)
    await reviseTokenTally(session, BOOK, { ...TODAY, theoreticalValue: undefined })
    const activity = await loadActivity(session, history, BOOK)
    expect(mapOk(activity, (found) => found.lines.map((line) => [line.did, saidIn(line.parts)]))).toEqual({
      ok: true,
      value: [
        ["play-recorded", { play: { id: "today" as PlayId, description: "マレハン第3新東京店 | 流星 123番台" }, theoretical: { value: dec("5500") } }],
        ["play-revised", { play: { id: "today" as PlayId, description: "マレハン第3新東京店 | 流星 123番台" } }],
      ],
    })
    expect(await reviseTokenTally(session, BOOK, { ...TODAY, id: "nowhere" as PlayId })).toEqual({ ok: false, error: { type: "tally-missing" } })
    const reader = await setUp("viewer")
    expect(await reviseTokenTally(reader.session, BOOK, { ...RENTED_PLAY })).toEqual({ ok: false, error: { type: "forbidden", capability: "write" } })
  })
})

describe("taking a recorded tally out of a book", () => {
  test("leaves the journal as it was before the tally, and says so in the activity", async () => {
    const { session, storage, history } = await setUp()
    const before = storage.peek(BOOK)?.files[BOOK_FILES.transactions]
    await recordTokenTally(session, BOOK, TODAY)
    expect((await removeTally(session, BOOK, "today" as PlayId)).ok).toBe(true)
    expect(storage.peek(BOOK)?.files[BOOK_FILES.transactions]).toBe(before as string)
    expect(await figures(session, "date:2026-10-04")).toEqual({ ok: true, value: ["0", "0"] })
    expect(mapOk(await loadActivity(session, history, BOOK), (found) => found.lines.map((line) => line.did))).toEqual({ ok: true, value: ["play-recorded", "play-removed"] })
  })

  test("takes out one of the made-up book's own, and nothing of a tally the book lacks", async () => {
    const { session } = await setUp()
    expect((await removeTally(session, BOOK, "made-up-0912" as PlayId)).ok).toBe(true)
    expect(await figures(session, "date:2026-09")).toEqual({ ok: true, value: ["21112", "8700"] })
    expect(await removeTally(session, BOOK, "made-up-0912" as PlayId)).toEqual({ ok: false, error: { type: "tally-missing" } })
  })
})

describe("the spin performances of a book's tallies", () => {
  const averages = (performances: SpinPerformances | undefined) =>
    performances === undefined ? undefined : [performances.measured, performances.inferred].map((sum) => ((average) => (average === undefined ? undefined : toPlainString(average)))(averageOf(sum)))

  test("are averaged by machine, those measured apart from those inferred, and tallies that say none are not counted", async () => {
    const { session } = await setUp()
    await recordTokenTally(session, BOOK, { ...TODAY, id: "a" as PlayId, machine: "流星", spinPerformance: dec("18.2") })
    await recordTokenTally(session, BOOK, { ...TODAY, id: "b" as PlayId, machine: "流星", spinPerformance: dec("17.5") })
    await recordTokenTally(session, BOOK, { ...TODAY, id: "c" as PlayId, machine: "流星" })
    await recordYenTally(session, BOOK, { ...TALLIED, id: "d" as PlayId, machine: "流星", theoreticalValue: undefined, told: { hours: dec("3"), jackpots: undefined, inferred: { value: dec("-2000"), formulaId: "formula-1", tokenRental: dec("4"), tokenExchange: dec("28"), spinPerformance: dec("16.4") } } })
    await recordTokenTally(session, BOOK, { ...TODAY, id: "e" as PlayId, machine: "海", spinPerformance: dec("20") })
    const found = await loadSpinPerformances(session, BOOK, "")
    const byMachine = found.ok ? found.value : new Map<string, SpinPerformances>()
    expect(averages(byMachine.get("流星"))).toEqual(["17.9", "16.4"])
    expect(averages(byMachine.get("海"))).toEqual(["20", undefined])
    expect(averages(allSpinPerformances(byMachine))).toEqual(["18.6", "16.4"])
    expect(averages(mergedSpinPerformances([byMachine, byMachine]).get("流星"))).toEqual(["17.9", "16.4"])
  })
})
