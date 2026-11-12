import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../../src/core/calendar/calendar"
import { decimal, toPlainString, type Decimal } from "../../../src/core/decimal/decimal"
import { maxbetJsonOf } from "../../../src/other-apps/maxbet/json-export"
import { readMaxbetJson } from "../../../src/other-apps/maxbet/json-import"
import type { PlayGameKind, PlayId } from "../../../src/core/play/play"
import type { TallyLine } from "../../../src/core/report/tally-line"
import type { TallyNotes } from "../../../src/core/report/tally-notes"

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

const lineOf = (line: { readonly date: string; readonly gameKind?: PlayGameKind; readonly labels?: readonly string[]; readonly spent: number; readonly won: number; readonly actual: Decimal }): TallyLine => ({
  tally: { id: `play-${line.date}` as PlayId, date: line.date as IsoDate, description: "", parlorId: undefined, gameKind: line.gameKind, machine: undefined, cabinetNumber: undefined, importedFrom: undefined, theoreticalValue: undefined, inferredValue: undefined },
  parlorName: "マレハン東京皇国第8支店",
  machineName: "流星の剣",
  maker: undefined,
  labels: line.labels ?? [],
  notes: NO_NOTES,
  sides: { spent: yen(line.spent), won: yen(line.won) },
  actual: line.actual,
})

const LINES: readonly TallyLine[] = [
  lineOf({ date: "2026-11-09", gameKind: "pachislot", labels: ["イベント", "朝一"], spent: 15000, won: 78000, actual: yen(63000) }),
  lineOf({ date: "2026-11-04", gameKind: "pachinko", labels: ["イベント"], spent: 13000, won: 212500, actual: yen(199500) }),
  lineOf({ date: "2026-11-01", spent: 1000, won: 0, actual: yen(-1000) }),
]

const NOW = Date.UTC(2026, 10, 10, 10, 6, 47, 123)

const written = maxbetJsonOf(LINES, new Map([["play-2026-11-04" as PlayId, "メモあり"]]), NOW)

const records = JSON.parse(written) as readonly { readonly id: string; readonly tags: readonly unknown[]; readonly [field: string]: unknown }[]

describe("tallies as MAXBET's backup", () => {
  test("is a record a tally in its fields, its day as that day's midnight in Japan, and no tags, not even its game's", () => {
    const second = records[1]
    expect(second).toEqual({ id: second?.id, modification_date: "2026-11-10T10:06:47Z", tags: [], memo: "メモあり", revenue: 212500, expense: 13000, date: "2026-11-03T15:00:00Z" } as never)
    expect(records.every((record) => record.tags.length === 0)).toBe(true)
  })

  test("gives each record an id of its own its tally always gives", () => {
    expect(records.every((record) => /^[0-9A-F]{8}-[0-9A-F]{4}-8[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/.test(record.id))).toBe(true)
    expect(new Set(records.map((record) => record.id)).size).toBe(3)
    expect(JSON.parse(maxbetJsonOf(LINES, new Map(), NOW + 60_000)).map((record: { id: string }) => record.id)).toEqual(records.map((record) => record.id))
  })

  test("is read back as MAXBET's own backup is", () => {
    const read = readMaxbetJson(written)
    expect(read.ok && read.value.tallies.map((tally) => [tally.date, tally.gameKind, toPlainString(tally.outlay), toPlainString(tally.takings), tally.memo])).toEqual([
      ["2026-11-09", undefined, "15000", "78000", ""],
      ["2026-11-04", undefined, "13000", "212500", "メモあり"],
      ["2026-11-01", undefined, "1000", "0", ""],
    ])
  })
})
