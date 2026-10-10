import { describe, expect, test } from "bun:test"

import { loadActivity } from "../../src/application/activity"
import { createBookSession } from "../../src/application/book-session"
import { importPrecord, type ImportPorts } from "../../src/application/import"
import { loadOverview } from "../../src/application/overview"
import { loadPlays } from "../../src/application/plays"
import { loadRecordedPlay } from "../../src/application/revise-play"
import type { BookId } from "../../src/core/book/book"
import { toPlainString } from "../../src/core/decimal/decimal"
import { Ok } from "../../src/core/result/result"
import { createMemoryHistory } from "../../src/history/adapters/memory-history"
import { ME, fixtureBook, inProcessHledger, memoryStorage } from "../support/in-process"
import { saidIn } from "../support/values"

const BOOK = "import" as BookId

const FILE = [
  "日付,店舗コード,店舗,メーカー,機種コード,機種,台番号,投資額,回収額,収支,メモ,稼働時間,時給,貯玉",
  "2019/01/05,S1,駅前ホール,メーカーA,M1,ピエロット,45,10000,0,-10000,,,,",
  '2019/01/02,S1,駅前ホール,メーカーB,M2,昔の台,123,12000,20000,8000,"朝イチ, 並んだ",,,',
  "",
].join("\r\n")

const setUp = async () => {
  const storage = memoryStorage()
  const history = createMemoryHistory(() => crypto.randomUUID())
  const session = createBookSession({ hledger: await inProcessHledger(), storage, history, clock: () => new Date("2026-10-09T20:00:00+09:00"), newId: () => crypto.randomUUID(), member: ME })
  await session.createBook(await fixtureBook("basic-play", { id: BOOK, members: [{ id: ME, displayName: "me", role: "owner" }] }))
  const machines = { pachinko: ["森物語"], pachislot: ["ピエロット"] }
  const ports: ImportPorts = { session, catalog: { search: async (_query: string, gameKind: "pachinko" | "pachislot") => Ok(machines[gameKind].map((name) => ({ name }))) } as never }
  return { session, history, ports }
}

describe("a pRecord file taken into a book", () => {
  test("adds its plays, which hledger reads, to the results of their own days and to nothing else", async () => {
    const { session, ports } = await setUp()
    expect(await importPrecord(ports, BOOK, FILE)).toEqual({ ok: true, value: { written: 2, alreadyHere: 0 } })
    const month = await loadOverview(session, BOOK, "date:2019-01")
    expect(month.ok && [toPlainString(month.value.actual), toPlainString(month.value.savings)]).toEqual(["-2000", "68808"])
    const before = await loadOverview(session, BOOK, "date:2026-09")
    expect(before.ok && toPlainString(before.value.actual)).toBe("41142")
    const plays = await loadPlays(session, BOOK, "date:2019", 0)
    expect(plays.ok && plays.value.plays.map((play) => [play.date, play.description, play.gameKind, play.machine, play.cabinetNumber])).toEqual([
      ["2019-01-05", "駅前ホール ピエロット 45番台", "slot", "ピエロット", "45"],
      ["2019-01-02", "駅前ホール 昔の台 123番台", undefined, undefined, "123"],
    ] as never)
  })

  test("writes nothing the second time, and says so", async () => {
    const { ports, history, session } = await setUp()
    await importPrecord(ports, BOOK, FILE)
    expect(await importPrecord(ports, BOOK, FILE)).toEqual({ ok: false, error: { type: "import", problem: { type: "nothing-new", count: 2 } } })
    const more = `${FILE}2019/02/01,,別の店,,,,,3000,9000,6000,,,,\r\n`
    expect(await importPrecord(ports, BOOK, more)).toEqual({ ok: true, value: { written: 1, alreadyHere: 2 } })
    const activity = await loadActivity(session, history, BOOK)
    expect(activity.ok && activity.value.lines.map((line) => [line.did, saidIn(line.parts)]).slice(-2)).toEqual([
      ["plays-imported", { imported: { from: "precord", count: 2 } }],
      ["plays-imported", { imported: { from: "precord", count: 1 } }],
    ])
  })

  test("is not set right in a form, which holds neither its two sides nor the source's names", async () => {
    const { session, ports } = await setUp()
    await importPrecord(ports, BOOK, FILE)
    const plays = await loadPlays(session, BOOK, "date:2019-01-05", 0)
    const id = plays.ok ? plays.value.plays[0]?.id : undefined
    expect(await loadRecordedPlay(session, BOOK, ME, id as never)).toEqual({ ok: false, error: { type: "play-unreadable" } })
  })

  test("takes nothing in from a file with a row that does not read", async () => {
    const { session, ports } = await setUp()
    expect(await importPrecord(ports, BOOK, `${FILE}いつか,,,,,,,1,1,0,,,,\r\n`)).toEqual({ ok: false, error: { type: "import", problem: { type: "rows-unreadable", rows: [{ line: 4, fields: ["date"] }] } } })
    const plays = await loadPlays(session, BOOK, "date:2019", 0)
    expect(plays.ok && plays.value.total).toBe(0)
  })
})
