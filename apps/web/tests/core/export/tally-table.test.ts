import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../../src/core/calendar/calendar"
import { decimal } from "../../../src/core/decimal/decimal"
import { csvOf } from "../../../src/core/export/csv"
import { tallyTableOf } from "../../../src/core/export/tally-table"
import type { PlayId } from "../../../src/core/play/play"

const yen = (amount: number) => decimal(BigInt(amount), 0)

describe("tallies as a table", () => {
  test("a tally is a row under the column names, its amounts plain numbers", () => {
    expect(
      tallyTableOf([
        {
          tally: { id: "one" as PlayId, date: "2026-10-08" as IsoDate, description: "", parlorId: undefined, gameKind: "slot", machine: "ピエロット", cabinetNumber: "45", importedFrom: undefined, theoreticalValue: yen(-800) , inferredValue: undefined},
          parlorName: "723修羅の国店",
          machineName: "ピエロット",
          maker: undefined,
          sides: { spent: yen(10000), won: decimal(123455n, 1) },
          actual: decimal(23455n, 1),
        },
      ]),
    ).toEqual([
      ["営業日", "店舗", "種別", "機種", "台番号", "投資", "回収", "収支", "期待値"],
      ["2026-10-08", "723修羅の国店", "スロット", "ピエロット", "45", "10000", "12345.5", "2345.5", "-800"],
    ])
  })

  test("what a tally does not say is an empty cell", () => {
    expect(
      tallyTableOf([
        {
          tally: { id: "one" as PlayId, date: "2026-10-08" as IsoDate, description: "", parlorId: undefined, gameKind: undefined, machine: undefined, cabinetNumber: undefined, importedFrom: undefined, theoreticalValue: undefined , inferredValue: undefined},
          parlorName: undefined,
          machineName: undefined,
          maker: undefined,
          sides: { spent: yen(0), won: yen(3000) },
          actual: yen(3000),
        },
      ])[1],
    ).toEqual(["2026-10-08", "", "", "", "", "0", "3000", "3000", ""])
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
