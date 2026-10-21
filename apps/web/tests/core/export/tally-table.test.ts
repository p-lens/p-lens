import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../../src/core/calendar/calendar"
import { decimal } from "../../../src/core/decimal/decimal"
import { csvOf } from "../../../src/core/export/csv"
import { tallyTableOf } from "../../../src/core/export/tally-table"
import type { PlayId } from "../../../src/core/play/play"
import type { TallyNotes } from "../../../src/core/report/tally-notes"

const yen = (amount: number) => decimal(BigInt(amount), 0)

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

/** The cells of what is written beside a tally, from 開始時刻 to 送り主ID, where nothing is. */
const EMPTY_NOTES = ["", "", "", "", "", "", "", "", "", "", "", ""]

const COLUMNS = [
  "営業日",
  "店舗",
  "種別",
  "機種",
  "台番号",
  "投資",
  "回収",
  "収支",
  "期待値",
  "推定期待値",
  "メーカー",
  "開始時刻",
  "終了時刻",
  "稼働時間",
  "大当り回数",
  "回転率",
  "開始時の持ち玉・持ちメダル",
  "推定の算出条件ID",
  "推定の貸玉単価",
  "推定の交換率",
  "推定の回転率",
  "送り主",
  "送り主ID",
  "摘要",
  "店舗ID",
  "稼働ID",
  "取込元",
]

describe("tallies as a table", () => {
  test("a tally is a row under the column names, its amounts plain numbers", () => {
    expect(
      tallyTableOf([
        {
          tally: { id: "one" as PlayId, date: "2026-10-08" as IsoDate, description: "", parlorId: undefined, gameKind: "slot", machine: "ピエロット", cabinetNumber: "45", importedFrom: undefined, theoreticalValue: yen(-800) , inferredValue: undefined},
          parlorName: "723修羅の国店",
          machineName: "ピエロット",
          maker: undefined,
          notes: NO_NOTES,
          sides: { spent: yen(10000), won: decimal(123455n, 1) },
          actual: decimal(23455n, 1),
        },
      ]),
    ).toEqual([COLUMNS, ["2026-10-08", "723修羅の国店", "スロット", "ピエロット", "45", "10000", "12345.5", "2345.5", "-800", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "one", ""]])
  })

  test("what was written beside a tally follows its figures, its play time in hours and minutes", () => {
    expect(
      tallyTableOf([
        {
          tally: { id: "two" as PlayId, date: "2026-10-09" as IsoDate, description: "ネルフ第3新東京店 | 稼働", parlorId: "p-1" as never, gameKind: "pachinko", machine: "m-1", cabinetNumber: "101", importedFrom: undefined, theoreticalValue: undefined, inferredValue: yen(1200) },
          parlorName: "ネルフ第3新東京店",
          machineName: "初号機",
          maker: "ゼーレ",
          notes: {
            aside: { clock: { started: { hour: 22, minute: 30 }, finished: { hour: 1, minute: 5 } }, spinPerformance: decimal(185n, 1), sender: { id: "s-1", name: "シンジ" } },
            playSeconds: yen(9300),
            jackpots: 3,
            carriedIn: yen(250),
            inferredFormula: "f-1",
            tokenRental: yen(4),
            tokenExchange: yen(28),
            inferredSpinPerformance: decimal(172n, 1),
          },
          sides: { spent: yen(5000), won: yen(8000) },
          actual: yen(3000),
        },
      ])[1],
    ).toEqual(["2026-10-09", "ネルフ第3新東京店", "パチンコ", "初号機", "101", "5000", "8000", "3000", "", "1200", "ゼーレ", "22:30", "01:05", "2:35", "3", "18.5", "250", "f-1", "4", "28", "17.2", "シンジ", "s-1", "ネルフ第3新東京店 | 稼働", "p-1", "two", ""])
  })

  test("what a tally does not say is an empty cell", () => {
    expect(
      tallyTableOf([
        {
          tally: { id: "one" as PlayId, date: "2026-10-08" as IsoDate, description: "", parlorId: undefined, gameKind: undefined, machine: undefined, cabinetNumber: undefined, importedFrom: undefined, theoreticalValue: undefined , inferredValue: undefined},
          parlorName: undefined,
          machineName: undefined,
          maker: undefined,
          notes: NO_NOTES,
          sides: { spent: yen(0), won: yen(3000) },
          actual: yen(3000),
        },
      ])[1],
    ).toEqual(["2026-10-08", "", "", "", "", "0", "3000", "3000", "", "", "", ...EMPTY_NOTES, "", "", "one", ""])
  })
})

describe("rows as CSV", () => {
  test("opens with the mark of UTF-8 and ends each line in CRLF", () => {
    expect(csvOf([["店舗", "収支"], ["東京皇国", "-500"]])).toBe("﻿店舗,収支\r\n東京皇国,-500\r\n")
  })

  test("a cell holding a comma, a quote or a line break is quoted, its quotes doubled", () => {
    expect(csvOf([['a,b', 'say "x"', "two\nlines", "plain"]])).toBe('﻿"a,b","say ""x""","two\nlines",plain\r\n')
  })
})
