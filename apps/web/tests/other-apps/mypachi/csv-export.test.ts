import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../../src/core/calendar/calendar"
import { decimal, type Decimal } from "../../../src/core/decimal/decimal"
import type { PlayGameKind, PlayId } from "../../../src/core/play/play"
import type { TallyLine } from "../../../src/core/report/tally-line"
import type { TallyNotes } from "../../../src/core/report/tally-notes"
import { shiftJisOf } from "../../../src/other-apps/core/shift-jis"
import { mypachiCsvOf } from "../../../src/other-apps/mypachi/csv-export"
import { readMypachi } from "../../../src/other-apps/mypachi/csv-import"
import { dec } from "../../support/values"

const yen = (amount: number): Decimal => decimal(BigInt(amount), 0)

const NO_NOTES: TallyNotes = {
  aside: { clock: undefined, spinPerformance: undefined, realBorder: undefined, sender: undefined, netCounts: undefined },
  playSeconds: undefined,
  netJackpots: undefined,
  carriedIn: undefined,
  inferredFormula: undefined,
  tokenRental: undefined,
  tokenExchange: undefined,
  inferredSpinPerformance: undefined,
}

const lineOf = (line: { readonly date: string; readonly gameKind?: PlayGameKind; readonly parlorName?: string; readonly machineName?: string; readonly labels?: readonly string[]; readonly playSeconds?: Decimal; readonly theoreticalValue?: Decimal; readonly inferredValue?: Decimal; readonly spent: number; readonly won: number; readonly actual: Decimal }): TallyLine => ({
  tally: { id: `play-${line.date}` as PlayId, date: line.date as IsoDate, description: "", parlorId: undefined, gameKind: line.gameKind, machine: line.machineName, cabinetNumber: undefined, importedFrom: undefined, theoreticalValue: line.theoreticalValue, inferredValue: line.inferredValue },
  parlorName: line.parlorName,
  machineName: line.machineName,
  maker: undefined,
  labels: line.labels ?? [],
  notes: { ...NO_NOTES, playSeconds: line.playSeconds },
  sides: { spent: yen(line.spent), won: yen(line.won) },
  actual: line.actual,
})

const LINES: readonly TallyLine[] = [
  lineOf({ date: "2026-11-09", parlorName: "マレハン東京皇国第8支店", machineName: "スマスロ星の舞踏", playSeconds: dec("3600"), spent: 50000, won: 0, actual: yen(-50000) }),
  lineOf({ date: "2026-11-06", parlorName: "マレハン東京皇国第8支店", machineName: "e流星の剣", labels: ["ハイエナ", "朝一"], playSeconds: dec("2880"), theoreticalValue: dec("1499.6"), spent: 8929, won: 9821, actual: yen(892) }),
  lineOf({ date: "2026-10-29", parlorName: "名もなき店", machineName: "e流星の剣", playSeconds: dec("8280"), inferredValue: dec("-300.2"), spent: 5000, won: 23000, actual: yen(18000) }),
  lineOf({ date: "2026-10-28", spent: 1000, won: 1000, actual: yen(0) }),
]

/** 2026-11-10 22:10:18 in the device's own time. */
const MADE = new Date(2026, 10, 10, 22, 10, 18).getTime()

describe("tallies as Myパチ収支表's 件別収支表", () => {
  const text = mypachiCsvOf(LINES, new Map([["play-2026-11-06" as PlayId, "すぐやめ。\n次は朝から"]]), MADE)

  test("is its title, its columns, a tally a row and the row saying when it was made, its days with their weekdays, its yen signed as its own are and its 時給 short of the next yen, each line ended in CRLF", () => {
    expect(text).toBe(
      [
        "Myパチ収支表,件別収支表",
        "日,店,台,稼働,投資,回収,収支,時給,コメント,タグ,画像,期待値",
        "2026/11/09(月),マレハン東京皇国第8支店,スマスロ星の舞踏,1,\\50000,\\0,\\-50000,\\-50000,,,,",
        '2026/11/06(金),マレハン東京皇国第8支店,e流星の剣,0.8,\\8929,\\9821,\\+892,\\+1115,"すぐやめ。\n次は朝から",ハイエナ　朝一,,\\+1500',
        "2026/10/29(木),名もなき店,e流星の剣,2.3,\\5000,\\23000,\\+18000,\\+7826,,,,\\-300",
        "2026/10/28(水),,,,\\1000,\\1000,\\0,,,,,",
        ",,,,,,,,,,,作成日時 : 2026/11/10 22:10:18",
        "",
      ].join("\r\n"),
    )
  })

  test("is read back from its Shift_JIS as Myパチ収支表's own file is", () => {
    const read = readMypachi(shiftJisOf(text))
    expect(read.ok && read.value.map((tally) => [tally.date, tally.parlor.name, tally.machine.name, tally.hours, tally.outlay, tally.takings, tally.theoreticalValue, tally.sourceLabels, tally.memo])).toEqual([
      ["2026-11-09", "マレハン東京皇国第8支店", "スマスロ星の舞踏", dec("1.00"), dec("50000"), dec("0"), undefined, [], ""],
      ["2026-11-06", "マレハン東京皇国第8支店", "e流星の剣", dec("0.80"), dec("8929"), dec("9821"), dec("1500"), ["ハイエナ", "朝一"], "すぐやめ。\n次は朝から"],
      ["2026-10-29", "名もなき店", "e流星の剣", dec("2.30"), dec("5000"), dec("23000"), dec("-300"), [], ""],
      ["2026-10-28", "", "", undefined, dec("1000"), dec("1000"), undefined, [], ""],
    ] as never)
  })
})
