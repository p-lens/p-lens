import { beforeAll, describe, expect, test } from "bun:test"

import { createBookSession, type BookSession } from "../../src/application/book-session"
import { exportTallyTable, exportSingleJournal, exportTogether, type ExportPorts } from "../../src/application/export"
import { loadOverview } from "../../src/application/overview"
import type { BookId, Member, MemberId } from "../../src/core/book/book"
import type { IsoDate } from "../../src/core/calendar/calendar"
import { toPlainString } from "../../src/core/decimal/decimal"
import { BOOK_FILES } from "../../src/core/journal/layout"
import { mapOk } from "../../src/core/result/result"
import { createZipArchiver } from "../../src/backup/zip/zip-archiver"
import { createMemoryHistory } from "../../src/history/adapters/memory-history"
import { memoryHandover } from "../support/backup"
import { fixtureBook, inProcessHledger, memoryStorage } from "../support/in-process"

const BOOK = "basic-play" as BookId

const ME: Member = { id: "me" as MemberId, displayName: "me", role: "owner" }

const decoder = new TextDecoder("utf-8", { ignoreBOM: true })

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
    expect(await exportTallyTable(portsWith(handover), BOOK)).toEqual({ ok: true, value: undefined })
    const [file] = handover.given()
    expect(file?.name).toBe("サンプル帳簿_収支_2026-10-09_exported.csv")
    expect(file?.type).toBe("text/csv")
    expect(decoder.decode(file?.bytes).split("\r\n")).toEqual([
      "﻿営業日,店舗,種別,機種,台番号,投資,回収,収支,期待値",
      "2026-10-03,723修羅の国店,パチンコ,森物語,210,9990,7992,-1998,900",
      "2026-10-01,マレハン東京皇国店,パチンコ,流星,123,14000,14000,0,1800",
      "2026-09-20,723修羅の国店,パチンコ,森物語,210,8000,23976,15976,3200",
      "2026-09-12,723修羅の国店,スロット,ピエロット,45,10000,30030,20030,1800",
      "2026-09-05,マレハン東京皇国店,パチンコ,流星,123,12000,17136,5136,5500",
      "",
    ])
  })

  test("its journals are one file, which hledger reads to the same figures", async () => {
    const handover = memoryHandover()
    expect(await exportSingleJournal(portsWith(handover), BOOK)).toEqual({ ok: true, value: undefined })
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
    expect(await exportTogether(portsWith(handover), [BOOK, twin])).toEqual({ ok: true, value: undefined })
    const [file] = handover.given()
    expect([file?.name, file?.type]).toEqual(["帳簿_2026-10-09_exported.zip", "application/zip"])
    const unpacked = createZipArchiver().unpack(file?.bytes as never)
    expect(unpacked.ok && Object.keys(unpacked.value)).toEqual(["サンプル帳簿(basic-play)_2026-10-09_exported.journal", "サンプル帳簿(basic-play)_収支_2026-10-09_exported.csv", "サンプル帳簿(twin)_2026-10-09_exported.journal", "サンプル帳簿(twin)_収支_2026-10-09_exported.csv"])
    expect(unpacked.ok && unpacked.value["サンプル帳簿(twin)_収支_2026-10-09_exported.csv"]?.split("\r\n").length).toBe(7)
    const alone = memoryHandover()
    await exportTogether(portsWith(alone), [twin])
    expect(((only) => only.ok && Object.keys(only.value))(createZipArchiver().unpack(alone.given()[0]?.bytes as never))).toEqual(["サンプル帳簿_2026-10-09_exported.journal", "サンプル帳簿_収支_2026-10-09_exported.csv"])
  })

  test("a handover the person closed is said as it happened", async () => {
    expect(await exportSingleJournal(portsWith(memoryHandover({ type: "handover-cancelled" })), BOOK)).toEqual({ ok: false, error: { type: "handover", failure: { type: "handover-cancelled" } } })
  })
})
