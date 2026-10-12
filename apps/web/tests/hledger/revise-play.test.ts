import { describe, expect, test } from "bun:test"

import { loadActivity } from "../../src/application/activity"
import { createBookSession } from "../../src/application/book-session"
import { loadOverview } from "../../src/application/overview"
import { loadPlay, loadPlays } from "../../src/application/plays"
import { recordPlay, recordTalliedPlay } from "../../src/application/record-play"
import { loadRecordedPlay, removePlay, revisePlay, reviseTalliedPlay } from "../../src/application/revise-play"
import type { BookId } from "../../src/core/book/book"
import type { IsoDate } from "../../src/core/calendar/calendar"
import { toPlainString } from "../../src/core/decimal/decimal"
import { BOOK_FILES } from "../../src/core/journal/layout"
import type { PlayId, PlayRecord, TalliedPlay } from "../../src/core/play/play"
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

const TODAY: PlayRecord = { ...RENTED_PLAY, id: "today" as PlayId, date: "2026-10-04" as IsoDate }

/** A play that rented, replayed at a fee and left tokens: every sum a record can carry. */
const FULL: PlayRecord = { ...TODAY, id: "full" as PlayId, rental: { outlay: dec("2000"), tokens: dec("500") }, replay: { paidOut: dec("1000"), deducted: dec("1100") }, payout: dec("2500"), cabinetNumber: undefined, theoreticalValue: undefined }

const TALLIED: TalliedPlay = { id: "tally" as PlayId, date: "2026-10-04" as IsoDate, parlor: UMEDA, gameKind: "slot", machine: "スマスロ流星", cabinetNumber: "7", result: dec("-12000"), theoreticalValue: dec("8000") }

const figures = async (session: Awaited<ReturnType<typeof setUp>>["session"], query: string) =>
  mapOk(await loadOverview(session, BOOK, query), (found) => [toPlainString(found.actual), toPlainString(found.theoretical)])

const recordedOf = async (session: Awaited<ReturnType<typeof setUp>>["session"], id: string) => mapOk(await loadRecordedPlay(session, BOOK, ME, id as PlayId), (found) => found.recorded)

describe("a recorded play, read back from its entry", () => {
  test("is the record it was written from, whatever sums it carried", async () => {
    const { session } = await setUp()
    await recordPlay(session, BOOK, TODAY)
    await recordPlay(session, BOOK, FULL)
    expect(await recordedOf(session, "today")).toEqual({ ok: true, value: { type: "at-parlor", record: TODAY } })
    expect(await recordedOf(session, "full")).toEqual({ ok: true, value: { type: "at-parlor", record: FULL } })
  })

  test("is the play kept in yen it was written from, a gain, a loss or an even day", async () => {
    const { session } = await setUp()
    const gain = { ...TALLIED, id: "gain" as PlayId, parlor: undefined, result: dec("3000"), theoreticalValue: undefined }
    const even = { ...TALLIED, id: "even" as PlayId, result: dec("0") }
    await recordTalliedPlay(session, BOOK, TALLIED)
    await recordTalliedPlay(session, BOOK, gain)
    await recordTalliedPlay(session, BOOK, even)
    expect(await recordedOf(session, "tally")).toEqual({ ok: true, value: { type: "tallied", play: TALLIED } })
    expect(await recordedOf(session, "gain")).toEqual({ ok: true, value: { type: "tallied", play: gain } })
    expect(await recordedOf(session, "even")).toEqual({ ok: true, value: { type: "tallied", play: even } })
  })

  test("reads every play of the made-up book", async () => {
    const { session } = await setUp()
    const plays = await loadPlays(session, BOOK, "", 0)
    const read = await Promise.all((plays.ok ? plays.value.plays : []).map((play) => recordedOf(session, play.id)))
    expect(read.map((each) => each.ok && each.value.type)).toEqual(["at-parlor", "at-parlor", "at-parlor", "at-parlor", "at-parlor"])
  })

  test("is the same record where its entry is one written when rented tokens still passed through savings", async () => {
    const { session, storage } = await setUp()
    const asWritten = await recordedOf(session, "made-up-0905")
    const text = storage.peek(BOOK)?.files[BOOK_FILES.transactions] ?? ""
    const older = text.replace(
      '    費用:遊技                        3000 "玉(4円・ホシゾラ梅田店)" @ 3.57 JPY\n',
      '    資産:貯玉:ホシゾラ梅田店:4円         3000 "玉(4円・ホシゾラ梅田店)" @ 3.57 JPY\n    資産:貯玉:ホシゾラ梅田店:4円         -3000 "玉(4円・ホシゾラ梅田店)"\n    費用:遊技                        3000 "玉(4円・ホシゾラ梅田店)"\n',
    )
    expect(older).not.toBe(text)
    const edited = await session.write(BOOK, async (_journal, stored) => Ok({ files: { ...stored.files, [BOOK_FILES.transactions]: older }, intent: { type: "file-edited", path: BOOK_FILES.transactions } }))
    expect(edited.ok).toBe(true)
    expect(asWritten.ok && asWritten.value.type).toBe("at-parlor")
    expect(await recordedOf(session, "made-up-0905")).toEqual(asWritten)
  })

  test("is read at its pool where cash alone was played and nothing was left, so that no savings account says which", async () => {
    const { session } = await setUp()
    const lost: PlayRecord = { ...TODAY, id: "lost" as PlayId, payout: dec("0") }
    await recordPlay(session, BOOK, lost)
    expect(await recordedOf(session, "lost")).toEqual({ ok: true, value: { type: "at-parlor", record: lost } })
  })

  test("is refused where its entry was changed by hand into what no record makes, and where the book has no such play", async () => {
    const { session, storage } = await setUp()
    const text = storage.peek(BOOK)?.files[BOOK_FILES.transactions] ?? ""
    const byHand = text.replace("    費用:遊技                        3000 \"玉(4円・ホシゾラ梅田店)\" @ 3.57 JPY\n", "    費用:遊技                        2000 \"玉(4円・ホシゾラ梅田店)\" @ 3.57 JPY\n    費用:再プレイ手数料                  1000 \"玉(4円・ホシゾラ梅田店)\" @ 3.57 JPY\n")
    expect(byHand).not.toBe(text)
    const edited = await session.write(BOOK, async (_journal, stored) => Ok({ files: { ...stored.files, [BOOK_FILES.transactions]: byHand }, intent: { type: "file-edited", path: BOOK_FILES.transactions } }))
    expect(edited.ok).toBe(true)
    expect(await recordedOf(session, "made-up-0905")).toEqual({ ok: false, error: { type: "play-unreadable" } })
    expect(await recordedOf(session, "nowhere")).toEqual({ ok: false, error: { type: "play-missing" } })
  })
})

describe("setting a recorded play right", () => {
  test("writes its entry anew where it stood, and moves the figures to what it now says", async () => {
    const { session, storage } = await setUp()
    await recordPlay(session, BOOK, TODAY)
    await recordTalliedPlay(session, BOOK, TALLIED)
    expect(await figures(session, "date:2026-10-04")).toEqual({ ok: true, value: ["-7200", "13500"] })
    const revised = await revisePlay(session, BOOK, { ...TODAY, machine: "森物語", rental: { outlay: dec("16000"), tokens: dec("4000") }, theoreticalValue: dec("1000") })
    expect(revised.ok).toBe(true)
    expect(await figures(session, "date:2026-10-04")).toEqual({ ok: true, value: ["-11200", "9000"] })
    const transactions = storage.peek(BOOK)?.files[BOOK_FILES.transactions] ?? ""
    expect(transactions.match(/play-id: today,/g)?.length).toBe(1)
    expect(transactions.indexOf("play-id: today,")).toBeLessThan(transactions.indexOf("play-id: tally,"))
    expect(mapOk(await loadPlay(session, BOOK, "today" as PlayId), (found) => found.summary.description)).toEqual({ ok: true, value: "ホシゾラ梅田店 森物語 123番台" })
  })

  test("moves a play to the day it now says, at that day's rate", async () => {
    const { session } = await setUp()
    await recordPlay(session, BOOK, TODAY)
    await revisePlay(session, BOOK, { ...TODAY, date: "2026-09-10" as IsoDate })
    expect(await figures(session, "date:2026-10-04")).toEqual({ ok: true, value: ["0", "0"] })
    expect(await figures(session, "date:2026-09-10")).toEqual({ ok: true, value: ["5136", "5500"] })
  })

  test("moves a play to a day before any rate the book has, giving that day the pool's first", async () => {
    const { session, storage } = await setUp()
    await recordPlay(session, BOOK, TODAY)
    const pricesBefore = storage.peek(BOOK)?.files[BOOK_FILES.prices] ?? ""
    expect((await revisePlay(session, BOOK, { ...TODAY, date: "2016-10-11" as IsoDate })).ok).toBe(true)
    expect(storage.peek(BOOK)?.files[BOOK_FILES.prices]).toBe(`${pricesBefore}\nP 2016-10-11 "玉(4円・ホシゾラ梅田店)" 3.57 JPY\n`)
    expect(await recordedOf(session, "today")).toEqual({ ok: true, value: { type: "at-parlor", record: { ...TODAY, date: "2016-10-11" as IsoDate } } })
    expect((await recordPlay(session, BOOK, { ...TODAY, id: "older" as PlayId, date: "2016-10-10" as IsoDate })).ok).toBe(true)
  })

  test("sets a play kept in yen right the same way", async () => {
    const { session } = await setUp()
    await recordTalliedPlay(session, BOOK, TALLIED)
    await reviseTalliedPlay(session, BOOK, { ...TALLIED, result: dec("4000"), theoreticalValue: undefined })
    expect(await figures(session, "date:2026-10-04")).toEqual({ ok: true, value: ["4000", "0"] })
  })

  test("says in the activity what was done, and is refused for a play the book lacks or a member who may only read", async () => {
    const { session, history } = await setUp()
    await recordPlay(session, BOOK, TODAY)
    await revisePlay(session, BOOK, { ...TODAY, theoreticalValue: undefined })
    const activity = await loadActivity(session, history, BOOK)
    expect(mapOk(activity, (found) => found.lines.map((line) => [line.did, saidIn(line.parts)]))).toEqual({
      ok: true,
      value: [
        ["play-recorded", { play: { id: "today" as PlayId, description: "ホシゾラ梅田店 流星 123番台" }, theoretical: { value: dec("5500") } }],
        ["play-revised", { play: { id: "today" as PlayId, description: "ホシゾラ梅田店 流星 123番台" } }],
      ],
    })
    expect(await revisePlay(session, BOOK, { ...TODAY, id: "nowhere" as PlayId })).toEqual({ ok: false, error: { type: "play-missing" } })
    const reader = await setUp("viewer")
    expect(await revisePlay(reader.session, BOOK, { ...RENTED_PLAY })).toEqual({ ok: false, error: { type: "forbidden", capability: "write" } })
  })
})

describe("taking a recorded play out of a book", () => {
  test("leaves the journal as it was before the play, and says so in the activity", async () => {
    const { session, storage, history } = await setUp()
    const before = storage.peek(BOOK)?.files[BOOK_FILES.transactions]
    await recordPlay(session, BOOK, TODAY)
    expect((await removePlay(session, BOOK, "today" as PlayId)).ok).toBe(true)
    expect(storage.peek(BOOK)?.files[BOOK_FILES.transactions]).toBe(before as string)
    expect(await figures(session, "date:2026-10-04")).toEqual({ ok: true, value: ["0", "0"] })
    expect(mapOk(await loadActivity(session, history, BOOK), (found) => found.lines.map((line) => line.did))).toEqual({ ok: true, value: ["play-recorded", "play-removed"] })
  })

  test("takes out one of the made-up book's own, and nothing of a play the book lacks", async () => {
    const { session } = await setUp()
    expect((await removePlay(session, BOOK, "made-up-0912" as PlayId)).ok).toBe(true)
    expect(await figures(session, "date:2026-09")).toEqual({ ok: true, value: ["21112", "8700"] })
    expect(await removePlay(session, BOOK, "made-up-0912" as PlayId)).toEqual({ ok: false, error: { type: "play-missing" } })
  })
})
