import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../../src/core/calendar/calendar"
import { decimal, type Decimal } from "../../../src/core/decimal/decimal"
import { precordCsvOf } from "../../../src/core/export/precord"
import { readPrecord } from "../../../src/core/import/precord"
import { importedTallyEntry } from "../../../src/core/import/source-tally"
import { renderEntry } from "../../../src/core/journal/entry"
import type { PlayId } from "../../../src/core/play/play"
import type { TallyLine } from "../../../src/core/report/tally-line"
import type { TallyNotes } from "../../../src/core/report/tally-notes"
import { tallyNotesIn } from "../../../src/core/tally/in-journal"

const yen = (amount: number): Decimal => decimal(BigInt(amount), 0)

const NO_NOTES: TallyNotes = {
  aside: { clock: undefined, spinPerformance: undefined, sender: undefined },
  playSeconds: undefined,
  jackpots: undefined,
  carriedIn: undefined,
  inferredFormula: undefined,
  tokenRental: undefined,
  tokenExchange: undefined,
  inferredSpinPerformance: undefined,
}

const HEADER = '"日付","店舗コード","店舗","メーカー","機種コード","機種","種別","台番号","投資額","回収額","収支","メモ","稼働時間","時給","経費"\r\n'

const lineOf = (line: {
  readonly date: string
  readonly description: string
  readonly parlorName?: string
  readonly machineName?: string
  readonly maker?: string
  readonly cabinetNumber?: string
  readonly playSeconds?: number
  readonly spent: Decimal
  readonly won: Decimal
  readonly actual: Decimal
}): TallyLine => ({
  tally: {
    id: `play-${line.date}` as PlayId,
    date: line.date as IsoDate,
    description: line.description,
    parlorId: undefined,
    gameKind: undefined,
    machine: line.machineName,
    cabinetNumber: line.cabinetNumber,
    importedFrom: undefined,
    theoreticalValue: undefined,
    inferredValue: undefined,
  },
  parlorName: line.parlorName,
  machineName: line.machineName,
  maker: line.maker,
  notes: { ...NO_NOTES, playSeconds: line.playSeconds === undefined ? undefined : yen(line.playSeconds) },
  sides: { spent: line.spent, won: line.won },
  actual: line.actual,
})

/** Tokens at a parlor exchanged for prizes, at a rate that leaves fractions of a yen, its play timed. */
const TOKENS_FOR_PRIZES = lineOf({
  date: "2026-10-03",
  description: "723豚の帽子亭店 | 森物語 210番台",
  parlorName: "723豚の帽子亭店",
  machineName: "森物語",
  cabinetNumber: "210",
  playSeconds: 9300,
  spent: decimal(123455n, 1),
  won: decimal(1500025n, 2),
  actual: decimal(265475n, 2),
})

/** A tally kept in yen, a loss, as pRecord's own export has one. */
const IN_YEN = lineOf({
  date: "2026-10-02",
  description: "天王寺ホール本館 | e 東京喰種 99番台",
  parlorName: "天王寺ホール本館",
  machineName: "e 東京喰種",
  maker: "ビスティ",
  cabinetNumber: "99",
  playSeconds: 8700,
  spent: yen(5500),
  won: yen(0),
  actual: yen(-5500),
})

/** IN_YEN as it was said, for a line made from it. */
const IN_YEN_SAID = {
  date: "2026-10-02",
  parlorName: "天王寺ホール本館",
  maker: "ビスティ",
  cabinetNumber: "99",
  playSeconds: 8700,
  spent: yen(5500),
  won: yen(0),
  actual: yen(-5500),
} as const

/** A play on savings alone that lost them, its length not told. */
const SAVINGS_LOST = lineOf({
  date: "2026-10-01",
  description: "マレハン東京皇国第8支店 | 流星 123番台",
  parlorName: "マレハン東京皇国第8支店",
  machineName: "流星",
  cabinetNumber: "123",
  spent: yen(1785),
  won: yen(0),
  actual: yen(-1785),
})

/** A tally at no parlor and on no machine, with a note of the person's own under its entry. */
const NOTED = lineOf({
  date: "2026-09-30",
  description: "",
  spent: yen(1000),
  won: yen(3000),
  actual: yen(2000),
})

/** The note under NOTED's entry, with what a cell must be quoted for. */
const NOTES: ReadonlyMap<PlayId, string> = new Map([[NOTED.tally.id, '朝イチ, "設定6"\nたぶん']])

const NONE: ReadonlyMap<PlayId, string> = new Map()

describe("tallies as pRecord's CSV", () => {
  test("is pRecord's header and a row of fifteen quoted cells a tally, in the order given, each line ended in CRLF, with no byte order mark", () => {
    expect(precordCsvOf([TOKENS_FOR_PRIZES, IN_YEN, SAVINGS_LOST, NOTED], NOTES)).toBe(
      [
        HEADER,
        '"2026/10/03","","723豚の帽子亭店","","","森物語","","210","12346","15001","2655","","2時間35分","1027.742","0"\r\n',
        '"2026/10/02","","天王寺ホール本館","ビスティ","","e 東京喰種","","99","5500","0","-5500","","2時間25分","-2275.862","0"\r\n',
        '"2026/10/01","","マレハン東京皇国第8支店","","","流星","","123","1785","0","-1785","","","0.0","0"\r\n',
        '"2026/09/30","","","","","","","","1000","3000","2000","朝イチ, ""設定6""\nたぶん","","0.0","0"\r\n',
      ].join(""),
    )
  })

  test("writes 稼働時間 in words to the nearest minute, as pRecord takes it into the memo", () => {
    const lengths = [7200, 2700, 7229, 7231].map((playSeconds) => lineOf({ ...IN_YEN_SAID, description: "", playSeconds }))
    expect(precordCsvOf(lengths, NONE).split("\r\n").slice(1, 5).map((row) => row.split(",")[12])).toEqual(['"2時間"', '"45分"', '"2時間"', '"2時間1分"'])
  })

  test("is nothing but the header for a book without tallies", () => {
    expect(precordCsvOf([], NONE)).toBe(HEADER)
  })

  test("keeps what came back less what went in the 収支 shown, neither side below nothing, whatever a hand-written entry says", () => {
    const rows = precordCsvOf([
      lineOf({ date: "2026-09-01", description: "", spent: yen(-100), won: yen(200), actual: yen(300) }),
      lineOf({ date: "2026-09-02", description: "", spent: yen(1000), won: yen(0), actual: yen(-1500) }),
      lineOf({ date: "2026-09-03", description: "", spent: decimal(5n, 1), won: yen(0), actual: decimal(-5n, 1) }),
    ], NONE)
      .split("\r\n")
      .slice(1, 4)
      .map((row) => row.split(",").slice(8, 11))
    expect(rows).toEqual([
      ['"0"', '"300"', '"300"'],
      ['"1500"', '"0"', '"-1500"'],
      ['"1"', '"0"', '"-1"'],
    ])
  })

  test("is read back by this app's own reading of pRecord's CSV, to the same days, names and sides", () => {
    const read = readPrecord(precordCsvOf([TOKENS_FOR_PRIZES, IN_YEN, NOTED], NOTES))
    expect(
      read.ok &&
        read.value.map((tally) => [tally.date, tally.parlor.name, tally.machine.name, tally.machine.maker, tally.cabinetNumber, tally.outlay, tally.takings, tally.memo, tally.hours]),
    ).toEqual([
      ["2026-10-03", "723豚の帽子亭店", "森物語", "", "210", yen(12346), yen(15001), "", decimal(258n, 2)],
      ["2026-10-02", "天王寺ホール本館", "e 東京喰種", "ビスティ", "99", yen(5500), yen(0), "", decimal(242n, 2)],
      ["2026-09-30", "", "", "", "", yen(1000), yen(3000), '朝イチ, "設定6"\nたぶん', undefined],
    ])
  })

  test("never takes a description's note for a memo, though it name a machine other than the tally's own", () => {
    const matched = lineOf({ ...IN_YEN_SAID, description: "天王寺ホール本館 | e 東京喰種 99番台", machineName: "e東京喰種" })
    const barred = lineOf({ ...IN_YEN_SAID, description: "天王寺ホール本館 | 北斗｜無双 99番台", machineName: "北斗|無双" })
    expect(precordCsvOf([matched, barred], NONE).split("\r\n").slice(1, 3).map((row) => row.split(",")[11])).toEqual(['""', '""'])
  })

  test("carries a tally taken in from pRecord back out with its own memo, the machine its catalog name", () => {
    const read = readPrecord(`${HEADER}"2026/10/11","7289","天王寺ホール本館","ビスティ","4782","e 東京喰種","パチンコ","99","5500","0","-5500","ちょっと回ってた","2時間25分","-2275.862","0"\r\n`)
    const source = read.ok ? read.value[0] : undefined
    if (source === undefined) throw new Error("the row is not read")
    const id = "imported" as PlayId
    const entry = importedTallyEntry({ id, from: "precord", source, machine: { name: "e東京喰種", gameKind: "pachinko" }, inferred: undefined })
    const line = lineOf({ ...IN_YEN_SAID, description: entry.description, machineName: "e東京喰種" })
    const row = precordCsvOf([{ ...line, tally: { ...line.tally, id } }], tallyNotesIn([`; 稼働\n\n${renderEntry(entry)}`])).split("\r\n")[1]
    expect(row).toBe('"2026/10/02","","天王寺ホール本館","ビスティ","","e東京喰種","","99","5500","0","-5500","ちょっと回ってた","2時間25分","-2275.862","0"')
  })
})
