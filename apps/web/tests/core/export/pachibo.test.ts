import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../../src/core/calendar/calendar"
import { decimal, type Decimal } from "../../../src/core/decimal/decimal"
import { pachiboCsvOf, pachiboPcbOf } from "../../../src/core/export/pachibo"
import { readPachibo } from "../../../src/core/import/pachibo"
import type { PlayGameKind, PlayId } from "../../../src/core/play/play"
import type { TallyLine } from "../../../src/core/report/tally-line"
import type { TallyNotes } from "../../../src/core/report/tally-notes"
import type { PlayClock } from "../../../src/core/tally/tally"
import { dec } from "../../support/values"

const yen = (amount: number): Decimal => decimal(BigInt(amount), 0)

const NO_NOTES: TallyNotes = {
  aside: { clock: undefined, spinPerformance: undefined, sender: undefined, netCounts: undefined },
  playSeconds: undefined,
  netJackpots: undefined,
  carriedIn: undefined,
  inferredFormula: undefined,
  tokenRental: undefined,
  tokenExchange: undefined,
  inferredSpinPerformance: undefined,
}

const lineOf = (line: {
  readonly id: string
  readonly date: string
  readonly gameKind?: PlayGameKind
  readonly parlorName?: string
  readonly machineName?: string
  readonly maker?: string
  readonly cabinetNumber?: string
  readonly labels?: readonly string[]
  readonly clock?: PlayClock
  readonly playSeconds?: number
  readonly spent: number
  readonly won: number
}): TallyLine => ({
  tally: { id: line.id as PlayId, date: line.date as IsoDate, description: "", parlorId: undefined, gameKind: line.gameKind, machine: line.machineName, cabinetNumber: line.cabinetNumber, importedFrom: undefined, theoreticalValue: undefined, inferredValue: undefined },
  parlorName: line.parlorName,
  machineName: line.machineName,
  maker: line.maker,
  labels: line.labels ?? [],
  notes: { ...NO_NOTES, aside: { ...NO_NOTES.aside, clock: line.clock }, playSeconds: line.playSeconds === undefined ? undefined : yen(line.playSeconds) },
  sides: { spent: yen(line.spent), won: yen(line.won) },
  actual: yen(line.won - line.spent),
})

/** Newest first, as a book's lines come. */
const LINES: readonly TallyLine[] = [
  lineOf({ id: "c", date: "2026-11-09", gameKind: "pachislot", parlorName: "キコーネ浅草", machineName: "スマスロ 星の舞踏", maker: "月工房", labels: ["20スロ", "ハイエナ", "自分だけのタグ"], playSeconds: 32_700, spent: 88_000, won: 20_000 }),
  lineOf({ id: "b", date: "2026-11-09", gameKind: "pachinko", parlorName: "マレハン東京皇国第8支店", machineName: "流星の剣", spent: 500, won: 0 }),
  lineOf({ id: "a", date: "2026-10-26", gameKind: "pachinko", parlorName: "マレハン東京皇国第8支店", machineName: "流星の剣", maker: "星工房", cabinetNumber: "1223", labels: ["新台", "イベント"], clock: { started: { hour: 10, minute: 0 }, finished: { hour: 19, minute: 40 } }, playSeconds: 34_800, spent: 37_000, won: 165_000 }),
  lineOf({ id: "d", date: "2026-10-01", spent: 1_000, won: 0 }),
]

const NOTES: ReadonlyMap<PlayId, string> = new Map([["a" as PlayId, "めもめま\n据え置き"]])

const utf8In = (text: string): Uint8Array => new TextEncoder().encode(text)

const utf8Out = (bytes: Uint8Array): string | undefined => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return undefined
  }
}

describe("tallies as ぱち簿's CSV", () => {
  test("is its columns and a tally a row, oldest first, its days without their zeros, its hours on a clock, its memo on one line, each line ended in LF", () => {
    expect(pachiboCsvOf(LINES, NOTES)).toBe(
      [
        "日付,ホール,タイプ,機種,投資,回収,収支,時間,メモ",
        "2026/10/1,,,,1000,0,-1000,,",
        "2026/10/26,マレハン東京皇国第8支店,パチンコ,流星の剣,37000,165000,128000,9:40,めもめま 据え置き",
        "2026/11/9,マレハン東京皇国第8支店,パチンコ,流星の剣,500,0,-500,,",
        "2026/11/9,キコーネ浅草,スロット,スマスロ 星の舞踏,88000,20000,-68000,9:05,",
        "",
      ].join("\n"),
    )
  })
})

describe("tallies as ぱち簿's own file", () => {
  const bytes = pachiboPcbOf(LINES, NOTES, 1_794_000_000_000, utf8In)

  test("is read back by this app's taking in of ぱち簿's files as the same tallies, those of its labels ぱち簿 has words for kept", () => {
    const read = readPachibo(bytes, utf8Out)
    expect(read.ok && read.value).toEqual([
      { date: "2026-10-01", parlor: { name: "", code: "" }, machine: { name: "", code: "", maker: "" }, cabinetNumber: "", outlay: dec("1000"), takings: dec("0"), memo: "", hours: undefined, gameKind: undefined, countedSpins: undefined, countedJackpots: undefined, sourceLabels: [] },
      { date: "2026-10-26", parlor: { name: "マレハン東京皇国第8支店", code: "990001" }, machine: { name: "流星の剣", code: "9001", maker: "星工房" }, cabinetNumber: "1223", outlay: dec("37000"), takings: dec("165000"), memo: "めもめま\n据え置き", hours: dec("9.67"), gameKind: "pachinko", countedSpins: undefined, countedJackpots: undefined, sourceLabels: ["新台", "イベント"] },
      { date: "2026-11-09", parlor: { name: "マレハン東京皇国第8支店", code: "990001" }, machine: { name: "流星の剣", code: "9001", maker: "星工房" }, cabinetNumber: "", outlay: dec("500"), takings: dec("0"), memo: "", hours: undefined, gameKind: "pachinko", countedSpins: undefined, countedJackpots: undefined, sourceLabels: [] },
      { date: "2026-11-09", parlor: { name: "キコーネ浅草", code: "990002" }, machine: { name: "スマスロ 星の舞踏", code: "19001", maker: "月工房" }, cabinetNumber: "", outlay: dec("88000"), takings: dec("20000"), memo: "", hours: dec("9.08"), gameKind: "pachislot", countedSpins: undefined, countedJackpots: undefined, sourceLabels: ["20スロ", "ハイエナ"] },
    ] as never)
  })

  test("writes ぱち簿's own settings, each value's length in characters, every byte turned over", () => {
    const text = utf8Out(bytes.map((byte) => 255 - byte)) ?? ""
    expect(text.startsWith("Long,first,13,1794000000000,Integer,first_result,8,20261001,Integer,last_result,8,20261109,")).toBe(true)
    expect(text).toContain("String,hall990001_name,12,マレハン東京皇国第8支店,")
    expect(text).toContain("Integer,item20261109_count,1,2,")
    expect(text).toContain("Integer,item20261001_0_hall_id,2,-1,Integer,item20261001_0_machine_id,2,-1,")
  })
})
