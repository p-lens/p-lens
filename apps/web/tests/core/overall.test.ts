import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../src/core/calendar/calendar"
import { parseDecimal, toPlainString, type Decimal } from "../../src/core/decimal/decimal"
import { averageOf, daysWonOf, mergedOverall, prizesOf, shareOf, type Overall } from "../../src/core/report/overall"

const yen = (text: string): Decimal => ((read) => (read.ok ? read.value : (() => { throw new Error(text) })()))(parseDecimal(text))

const book = (days: readonly (readonly [string, string])[], plays: number, playsWon: number): Overall => ({
  plays,
  playsWon,
  days: days.map(([day, actual]) => ({ day: day as IsoDate, actual: yen(actual) })),
  actual: yen(days.reduce((total, [, actual]) => total + Number(actual), 0).toString()),
  theoretical: yen("1000"),
  inferred: yen("0"),
  cash: yen("5000"),
  specialPrizes: yen("3000"),
  oddPrizes: yen("120"),
  savingsDrawn: yen("2000"),
})

describe("a period's tallies taken as one", () => {
  test("adds books together, a day played in both one day, its results added", () => {
    const merged = mergedOverall([book([["2026-10-01", "5000"], ["2026-10-02", "-3000"]], 3, 2), book([["2026-10-02", "4000"]], 1, 1)])
    expect(merged.plays).toBe(4)
    expect(merged.playsWon).toBe(3)
    expect(merged.days.map((day) => [day.day, toPlainString(day.actual)])).toEqual([["2026-10-01", "5000"], ["2026-10-02", "1000"]])
    expect(daysWonOf(merged)).toBe(2)
    expect(toPlainString(merged.cash)).toBe("10000")
    expect(toPlainString(prizesOf(merged))).toBe("6240")
  })

  test("averages to the yen and takes shares, with none where there is nothing", () => {
    expect(toPlainString(averageOf(yen("10000"), 3) ?? yen("0"))).toBe("3333")
    expect(averageOf(yen("10000"), 0)).toBeUndefined()
    expect(shareOf(3, 4)).toBe(0.75)
    expect(shareOf(0, 0)).toBeUndefined()
  })
})
