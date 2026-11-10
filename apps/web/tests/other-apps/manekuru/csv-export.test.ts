import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../../src/core/calendar/calendar"
import { decimal, type Decimal } from "../../../src/core/decimal/decimal"
import type { PlayGameKind, PlayId } from "../../../src/core/play/play"
import type { TallyLine } from "../../../src/core/report/tally-line"
import type { TallyNotes } from "../../../src/core/report/tally-notes"
import type { PlayClock } from "../../../src/core/tally/tally"
import { manekuruCsvOf } from "../../../src/other-apps/manekuru/csv-export"
import { readManekuru } from "../../../src/other-apps/manekuru/csv-import"
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

const lineOf = (line: { readonly date: string; readonly gameKind?: PlayGameKind; readonly parlorName?: string; readonly machineName?: string; readonly labels?: readonly string[]; readonly clock?: PlayClock; readonly playSeconds?: Decimal; readonly theoreticalValue?: Decimal; readonly inferredValue?: Decimal; readonly spent: number; readonly won: number; readonly actual: Decimal }): TallyLine => ({
  tally: { id: `play-${line.date}` as PlayId, date: line.date as IsoDate, description: "", parlorId: undefined, gameKind: line.gameKind, machine: line.machineName, cabinetNumber: undefined, importedFrom: undefined, theoreticalValue: line.theoreticalValue, inferredValue: line.inferredValue },
  parlorName: line.parlorName,
  machineName: line.machineName,
  maker: undefined,
  labels: line.labels ?? [],
  notes: { ...NO_NOTES, aside: { ...NO_NOTES.aside, clock: line.clock }, playSeconds: line.playSeconds },
  sides: { spent: yen(line.spent), won: yen(line.won) },
  actual: line.actual,
})

const LINES: readonly TallyLine[] = [
  lineOf({ date: "2026-11-09", gameKind: "pachinko", parlorName: "マレハン東京皇国第8支店", machineName: "流星の剣", labels: ["イベント", "4パチ"], clock: { started: { hour: 10, minute: 5 }, finished: { hour: 18, minute: 0 } }, playSeconds: dec("28500"), theoreticalValue: dec("4321.6"), spent: 15000, won: 78000, actual: yen(63000) }),
  lineOf({ date: "2026-11-08", gameKind: "pachislot", parlorName: "名もなき店", machineName: "星の舞踏, 改", inferredValue: dec("-1200.4"), spent: 8000, won: 0, actual: yen(-8000) }),
  lineOf({ date: "2026-11-06", labels: ["朝一"], spent: 1000, won: 0, actual: yen(-1000) }),
]

describe("tallies as マネクルSP's CSV", () => {
  const text = manekuruCsvOf(LINES, new Map([["play-2026-11-09" as PlayId, "朝一\n据え置き"]]))

  test("is the columns its import guide names and a tally a row, with no byte order mark, quoted only where it must be, each line ended in LF", () => {
    expect(text).toBe(
      [
        "日付,開始（時）,開始（分）,終了（時）,終了（分）,稼働時間(分間),投資金額,回収金額,期待値,投資種類,店舗,機種,タグ,メモ",
        "2026/11/09,10,5,18,0,475,15000,78000,4322,4パチ,マレハン東京皇国第8支店,流星の剣,イベント,朝一<br/>据え置き",
        '2026/11/08,,,,,,8000,0,-1200,スロット,名もなき店,"星の舞踏, 改",,',
        "2026/11/06,,,,,,1000,0,,,,,朝一,",
        "",
      ].join("\n"),
    )
  })

  test("is read back as マネクルSP's own file is", () => {
    const read = readManekuru(text)
    expect(read.ok && read.value.map((tally) => [tally.date, tally.clock, tally.hours, tally.theoreticalValue, tally.gameKind, tally.sourceLabels, tally.parlor.name, tally.machine.name, tally.memo])).toEqual([
      ["2026-11-09", { started: { hour: 10, minute: 5 }, finished: { hour: 18, minute: 0 } }, dec("7.92"), dec("4322"), "pachinko", ["4パチ", "イベント"], "マレハン東京皇国第8支店", "流星の剣", "朝一\n据え置き"],
      ["2026-11-08", undefined, undefined, dec("-1200"), "pachislot", ["スロット"], "名もなき店", "星の舞踏, 改", ""],
      ["2026-11-06", undefined, undefined, undefined, undefined, ["朝一"], "", "", ""],
    ] as never)
  })
})
