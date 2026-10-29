import { beforeAll, describe, expect, test } from "bun:test"

import { createBookSession, type BookSession } from "../../src/application/book-session"
import { handOver, makeForPrecord, makeSingleJournal, makeTallyTable, makeTogether, type ExportPorts, type ExportReport, type ExportWatch, type Made } from "../../src/application/export"
import { loadOverview } from "../../src/application/overview"
import type { BookId, Member, MemberId } from "../../src/core/book/book"
import type { IsoDate } from "../../src/core/calendar/calendar"
import { toPlainString } from "../../src/core/decimal/decimal"
import { BOOK_FILES } from "../../src/core/journal/layout"
import { Ok, mapOk } from "../../src/core/result/result"
import type { Outcome } from "../../src/application/errors"
import { createZipArchiver } from "../../src/backup/zip/zip-archiver"
import type { HledgerClient } from "../../src/hledger/client/client"
import { createMemoryHistory } from "../../src/history/adapters/memory-history"
import { memoryHandover } from "../support/backup"
import { fixtureBook, inProcessHledger, memoryStorage } from "../support/in-process"

const BOOK = "basic-play" as BookId

const ME: Member = { id: "me" as MemberId, displayName: "me", role: "owner" }

const decoder = new TextDecoder("utf-8", { ignoreBOM: true })

/** A making watched by no one, never stopped. */
const UNWATCHED: ExportWatch = { onReport: () => undefined, stopped: new AbortController().signal }

/** What a making came to, handed over where it made a file. */
const handed = async (ports: ExportPorts, made: Promise<Outcome<Made>>) => {
  const outcome = await made
  if (!outcome.ok) return outcome
  return outcome.value.type === "made" ? handOver(ports, outcome.value.file) : Ok(undefined)
}

const figuresOf = (session: BookSession, bookId: BookId) =>
  loadOverview(session, bookId, "").then((overview) => mapOk(overview, (found) => ({ actual: toPlainString(found.actual), theoretical: toPlainString(found.theoretical) })))

describe("the basic-play book, written out", () => {
  const context: { session?: BookSession } = {}
  const session = (): BookSession => context.session as BookSession
  const portsWith = (handover: ExportPorts["handover"]): ExportPorts => ({ session: session(), archiver: createZipArchiver(), handover, today: () => "2026-10-09" as IsoDate })

  beforeAll(async () => {
    const storage = memoryStorage()
    context.session = createBookSession({
      hledger: await inProcessHledger(),
      storage,
      history: createMemoryHistory(() => crypto.randomUUID()),
      clock: () => new Date("2026-10-09T12:00:00+09:00"),
      newId: () => crypto.randomUUID(),
      member: ME.id,
    })
    await session().createBook(await fixtureBook("basic-play", { id: BOOK, members: [ME] }))
  })

  test("its tallies are a table, a tally a row, newest first, with hledger's figures", async () => {
    const handover = memoryHandover()
    expect(await handed(portsWith(handover), makeTallyTable(portsWith(handover), BOOK, UNWATCHED))).toEqual({ ok: true, value: undefined })
    const [file] = handover.given()
    expect(file?.name).toBe("サンプル帳簿_収支_2026-10-09_exported.csv")
    expect(file?.type).toBe("text/csv")
    expect(decoder.decode(file?.bytes).split("\r\n")).toEqual([
      "﻿営業日,店舗,種別,機種,台番号,投資,回収,収支,期待値,推定期待値,メーカー,開始時刻,終了時刻,稼働時間,大当り回数,回転率,開始時の持ち玉・持ちメダル,推定の算出条件ID,推定の貸玉単価,推定の交換率,推定の回転率,送り主,送り主ID,摘要,店舗ID,稼働ID,取込元",
      "2026-10-03,723豚の帽子亭店,パチンコ,森物語,210,9990,7992,-1998,900,,,,,,,,,,,,,,,723豚の帽子亭店 | 森物語 210番台,723-butanoboushitei,made-up-1003,",
      "2026-10-01,マレハン東京皇国第8支店,パチンコ,流星,123,14000,14000,0,1800,,,,,,,,,,,,,,,マレハン東京皇国第8支店 | 流星 123番台,malehan-tokyokoukoku,made-up-1001,",
      "2026-09-20,723豚の帽子亭店,パチンコ,森物語,210,8000,23976,15976,3200,,,,,,,,,,,,,,,723豚の帽子亭店 | 森物語 210番台,723-butanoboushitei,made-up-0920,",
      "2026-09-12,723豚の帽子亭店,スロット,ピエロット,45,10000,30030,20030,1800,,,,,2:30,,,,,,,,,,723豚の帽子亭店 | ピエロット 45番台,723-butanoboushitei,made-up-0912,",
      "2026-09-05,マレハン東京皇国第8支店,パチンコ,流星,123,12000,17136,5136,5500,,,,,3:00,,,,,,,,,,マレハン東京皇国第8支店 | 流星 123番台,malehan-tokyokoukoku,made-up-0905,",
      "",
    ])
  })

  test("its tallies are pRecord's CSV, newest first, their sides hledger's in whole yen", async () => {
    const handover = memoryHandover()
    expect(await handed(portsWith(handover), makeForPrecord(portsWith(handover), BOOK, UNWATCHED))).toEqual({ ok: true, value: undefined })
    const [file] = handover.given()
    expect([file?.name, file?.type]).toEqual(["サンプル帳簿_pRecord_2026-10-09_exported.csv", "text/csv"])
    expect(decoder.decode(file?.bytes).split("\r\n")).toEqual([
      '"日付","店舗コード","店舗","メーカー","機種コード","機種","種別","台番号","投資額","回収額","収支","メモ","稼働時間","時給","経費"',
      '"2026/10/03","","723豚の帽子亭店","","","森物語","パチンコ","210","9990","7992","-1998","","0.0","0.0","0"',
      '"2026/10/01","","マレハン東京皇国第8支店","","","流星","パチンコ","123","14000","14000","0","","0.0","0.0","0"',
      '"2026/09/20","","723豚の帽子亭店","","","森物語","パチンコ","210","8000","23976","15976","","0.0","0.0","0"',
      '"2026/09/12","","723豚の帽子亭店","","","ピエロット","パチスロ","45","10000","30030","20030","","2.5","8012.0","0"',
      '"2026/09/05","","マレハン東京皇国第8支店","","","流星","パチンコ","123","12000","17136","5136","","3.0","1712.0","0"',
      "",
    ])
  })

  test("its journals are one file, which hledger reads to the same figures", async () => {
    const handover = memoryHandover()
    expect(await handed(portsWith(handover), makeSingleJournal(portsWith(handover), BOOK, UNWATCHED))).toEqual({ ok: true, value: undefined })
    const [file] = handover.given()
    expect(file?.name).toBe("サンプル帳簿_2026-10-09_exported.journal")
    expect(file?.type).toBe("text/plain")
    const single = "single" as BookId
    await session().createBook({ book: { id: single, members: [ME] }, files: { [BOOK_FILES.main]: decoder.decode(file?.bytes) } })
    expect(await figuresOf(session(), single)).toEqual(await figuresOf(session(), BOOK))
    expect(await figuresOf(session(), single)).toEqual({ ok: true, value: { actual: "39144", theoretical: "13200" } })
  })

  test("several books go together as one zip, each book's two files under their own names", async () => {
    const handover = memoryHandover()
    const twin = "twin" as BookId
    await session().createBook(await fixtureBook("basic-play", { id: twin, members: [ME] }))
    const reports: ExportReport[] = []
    expect(await handed(portsWith(handover), makeTogether(portsWith(handover), [BOOK, twin], { onReport: (report) => void reports.push(report), stopped: new AbortController().signal }))).toEqual({ ok: true, value: undefined })
    expect(reports).toEqual([{ type: "book", done: 0, of: 2 }, { type: "book", done: 1, of: 2 }, { type: "packing" }])
    const [file] = handover.given()
    expect([file?.name, file?.type]).toEqual(["帳簿_2026-10-09_exported.zip", "application/zip"])
    const unpacked = createZipArchiver().unpack(file?.bytes as never)
    expect(unpacked.ok && Object.keys(unpacked.value)).toEqual(["サンプル帳簿(basic-play)_2026-10-09_exported.journal", "サンプル帳簿(basic-play)_収支_2026-10-09_exported.csv", "サンプル帳簿(twin)_2026-10-09_exported.journal", "サンプル帳簿(twin)_収支_2026-10-09_exported.csv"])
    expect(unpacked.ok && unpacked.value["サンプル帳簿(twin)_収支_2026-10-09_exported.csv"]?.split("\r\n").length).toBe(7)
    const alone = memoryHandover()
    await handed(portsWith(alone), makeTogether(portsWith(alone), [twin], UNWATCHED))
    expect(((only) => only.ok && Object.keys(only.value))(createZipArchiver().unpack(alone.given()[0]?.bytes as never))).toEqual(["サンプル帳簿_2026-10-09_exported.journal", "サンプル帳簿_収支_2026-10-09_exported.csv"])
  })

  test("a handover the person closed is said as it happened", async () => {
    const ports = portsWith(memoryHandover({ type: "handover-cancelled" }))
    expect(await handed(ports, makeSingleJournal(ports, BOOK, UNWATCHED))).toEqual({ ok: false, error: { type: "handover", failure: { type: "handover-cancelled" } } })
  })

  test("one book's file is told stage by stage as it is made", async () => {
    const reports: ExportReport[] = []
    const made = await makeTallyTable(portsWith(memoryHandover()), BOOK, { onReport: (report) => void reports.push(report), stopped: new AbortController().signal })
    expect(made.ok && made.value.type).toBe("made")
    expect(reports).toEqual([{ type: "reading" }, { type: "totalling" }])
  })

  test("a making the person stopped makes nothing, and stops between books", async () => {
    expect(await makeForPrecord(portsWith(memoryHandover()), BOOK, { onReport: () => undefined, stopped: AbortSignal.abort() })).toEqual({ ok: true, value: { type: "stopped" } })
    const stopping = new AbortController()
    const reports: ExportReport[] = []
    const together = await makeTogether(portsWith(memoryHandover()), [BOOK, BOOK], {
      onReport: (report) => {
        reports.push(report)
        if (report.type === "book" && report.done === 1) stopping.abort()
      },
      stopped: stopping.signal,
    })
    expect(together).toEqual({ ok: true, value: { type: "stopped" } })
    expect(reports).toEqual([{ type: "book", done: 0, of: 2 }, { type: "book", done: 1, of: 2 }])
  })

  test("a making stopped while it waits its turn in hledger never opens the book", async () => {
    const hledger = await inProcessHledger()
    const opened: { count: number } = { count: 0 }
    const counted: HledgerClient = { inTurn: (work) => hledger.inTurn((journal) => work({ ...journal, open: (files, entry) => ((opened.count += 1), journal.open(files, entry)) })) }
    const own = createBookSession({ hledger: counted, storage: memoryStorage(), history: createMemoryHistory(() => crypto.randomUUID()), clock: () => new Date("2026-10-09T12:00:00+09:00"), newId: () => crypto.randomUUID(), member: ME.id })
    await own.createBook(await fixtureBook("basic-play", { id: BOOK, members: [ME] }))
    const busy = Promise.withResolvers<void>()
    const holding = counted.inTurn(() => busy.promise)
    const stopping = new AbortController()
    const making = makeTallyTable({ ...portsWith(memoryHandover()), session: own }, BOOK, { onReport: () => undefined, stopped: stopping.signal })
    stopping.abort()
    busy.resolve()
    await holding
    expect(await making).toEqual({ ok: true, value: { type: "stopped" } })
    expect(opened.count).toBe(0)
  })
})
