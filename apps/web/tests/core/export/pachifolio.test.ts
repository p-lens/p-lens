import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../../src/core/calendar/calendar"
import { decimal, type Decimal } from "../../../src/core/decimal/decimal"
import { pachifolioCsvOf } from "../../../src/core/export/pachifolio"
import { readPachifolio } from "../../../src/core/import/pachifolio"
import type { PlayGameKind, PlayId } from "../../../src/core/play/play"
import type { TallyLine } from "../../../src/core/report/tally-line"
import type { TallyNotes } from "../../../src/core/report/tally-notes"
import type { NetCounts } from "../../../src/core/tally/tally"

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

const lineOf = (line: { readonly date: string; readonly gameKind?: PlayGameKind; readonly parlorName?: string; readonly machineName?: string; readonly netCounts?: NetCounts; readonly netJackpots?: number; readonly spent: number; readonly won: number; readonly actual: Decimal }): TallyLine => ({
  tally: { id: `play-${line.date}` as PlayId, date: line.date as IsoDate, description: "", parlorId: undefined, gameKind: line.gameKind, machine: line.machineName, cabinetNumber: undefined, importedFrom: undefined, theoreticalValue: undefined, inferredValue: undefined },
  parlorName: line.parlorName,
  machineName: line.machineName,
  maker: undefined,
  labels: [],
  notes: { ...NO_NOTES, aside: { ...NO_NOTES.aside, netCounts: line.netCounts }, netJackpots: line.netJackpots },
  sides: { spent: yen(line.spent), won: yen(line.won) },
  actual: line.actual,
})

const LINES: readonly TallyLine[] = [
  lineOf({ date: "2026-11-09", gameKind: "pachinko", parlorName: "マレハン東京皇国第8支店", machineName: "流星の剣", netCounts: { type: "pachinko", spins: 700, jackpots: 3 }, spent: 15000, won: 78000, actual: yen(63000) }),
  lineOf({ date: "2026-11-08", gameKind: "pachislot", parlorName: "名もなき店", machineName: "星の舞踏, 改", netCounts: { type: "at-machine", games: 1800, ats: 2 }, spent: 8000, won: 0, actual: yen(-8000) }),
  lineOf({ date: "2026-11-07", gameKind: "pachinko", machineName: "流星の剣", netJackpots: 4, spent: 5000, won: 5000, actual: yen(0) }),
  lineOf({ date: "2026-11-06", spent: 1000, won: 0, actual: yen(-1000) }),
]

describe("tallies as パチフォリオ's CSV", () => {
  const text = pachifolioCsvOf(LINES, new Map([["play-2026-11-09" as PlayId, "朝一\n据え置き"]]))

  test("is its columns and a tally a row, with a byte order mark, quoted only where it must be, each line ended in LF", () => {
    expect(text).toBe(
      [
        "﻿日付,店舗,機種,投資,回収,種別,タグ,回転数,大当り,メモ",
        '2026/11/09,マレハン東京皇国第8支店,流星の剣,15000,78000,パチ,,700,3,"朝一\n据え置き"',
        '2026/11/08,名もなき店,"星の舞踏, 改",8000,0,スロ,,1800,2,',
        "2026/11/07,,流星の剣,5000,5000,パチ,,,4,",
        "2026/11/06,,,1000,0,,,,,",
        "",
      ].join("\n"),
    )
  })

  test("is read back as パチフォリオ's own file is", () => {
    const read = readPachifolio(text)
    expect(read.ok && read.value.map((tally) => [tally.date, tally.parlor.name, tally.machine.name, tally.gameKind, tally.countedSpins, tally.countedJackpots, tally.memo])).toEqual([
      ["2026-11-09", "マレハン東京皇国第8支店", "流星の剣", "pachinko", 700, 3, "朝一\n据え置き"],
      ["2026-11-08", "名もなき店", "星の舞踏, 改", "pachislot", 1800, 2, ""],
      ["2026-11-07", "", "流星の剣", "pachinko", undefined, 4, ""],
      ["2026-11-06", "", "", undefined, undefined, undefined, ""],
    ] as never)
  })
})
