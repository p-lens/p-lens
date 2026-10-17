import { describe, expect, test } from "bun:test"

import { toPlainString } from "../../src/core/decimal/decimal"
import { bestFirst, byColumn, byRow, byWeekday, groupsOf, inOrder, merged, totalOf, type Group } from "../../src/core/report/breakdown"
import { secondsIn } from "../../src/core/report/figures"
import type { BalanceReport, MixedAmount } from "../../src/hledger/protocol/wire"
import { dec } from "../support/values"

const yen = (amount: number): MixedAmount => [{ acommodity: "JPY", aquantity: { decimalMantissa: amount, decimalPlaces: 0 } }]

const pivoted = (rows: readonly (readonly [string, number])[]): BalanceReport => ({ prDates: [[null, null]], prRows: rows.map(([name, amount]) => ({ prrName: name, prrAmounts: [yen(amount)], prrTotal: yen(amount) })), prTotals: { prrName: [], prrAmounts: [], prrTotal: [] } })

const periodic = (columns: readonly (readonly [string, number])[]): BalanceReport => ({
  prDates: columns.map(([day]) => [{ contents: day, tag: "Exact" }, null]),
  prRows: [],
  prTotals: { prrName: [], prrAmounts: columns.map(([, amount]) => yen(amount)), prrTotal: [] },
})

const read = (groups: readonly Group[]) => groups.map((group) => [group.key, toPlainString(group.actual), toPlainString(group.theoretical)])

const figures = (report: BalanceReport) => ((found) => (found.ok ? found.value : new Map()))(byRow(report))

describe("a report pivoted on a tag", () => {
  test("is a group a row, its income statement turned over, what carries no such tag under the empty key", () => {
    const groups = groupsOf(figures(pivoted([["流星", -3000], ["", -1000], ["ピエロット", 8000]])), figures(pivoted([["流星", 4000]])), figures(pivoted([["流星", 1500], ["よその台", 900]])), new Map([["流星", dec("7200")]]))
    expect(read(bestFirst(groups))).toEqual([["流星", "3000", "4000"], ["", "1000", "0"], ["ピエロット", "-8000", "0"]])
    expect(bestFirst(groups).map((group) => toPlainString(group.inferred))).toEqual(["1500", "0", "0"])
    expect(bestFirst(groups).map((group) => toPlainString(group.seconds))).toEqual(["7200", "0", "0"])
  })

  test("has no group for what comes to nothing in both reports and was played for no time, and one for what only the theoretical values or the play time have", () => {
    expect(read(groupsOf(figures(pivoted([["流星", 0]])), figures(pivoted([["森物語", 500]])), figures(pivoted([])), new Map()))).toEqual([["森物語", "0", "500"]])
    expect(read(groupsOf(figures(pivoted([["流星", 0]])), figures(pivoted([])), figures(pivoted([])), new Map([["流星", dec("3600")]])))).toEqual([["流星", "0", "0"]])
  })

  test("reads play time as seconds", () => {
    expect(byRow({ ...pivoted([]), prRows: [{ prrName: "流星", prrAmounts: [], prrTotal: [{ acommodity: "秒", aquantity: { decimalMantissa: 5400, decimalPlaces: 0 } }] }] }, secondsIn)).toEqual({ ok: true, value: new Map([["流星", dec("5400")]]) })
  })

  test("is refused where a figure was left in tokens no rate values", () => {
    expect(byRow({ ...pivoted([]), prRows: [{ prrName: "流星", prrAmounts: [], prrTotal: [{ acommodity: "玉", aquantity: { decimalMantissa: 100, decimalPlaces: 0 } }] }] })).toEqual({ ok: false, error: { type: "unvalued", commodities: ["玉"] } })
  })
})

describe("a report with a column a period", () => {
  const made = (period: "yearly" | "monthly" | "daily", columns: readonly (readonly [string, number])[]) => ((found) => (found.ok ? [...found.value].map(([key, value]) => [key, toPlainString(value)]) : found))(byColumn(periodic(columns), period))

  test("is a figure a column, keyed by the period each begins", () => {
    expect(made("monthly", [["2026-09-01", -100], ["2026-10-01", 200]])).toEqual([["2026-09", "-100"], ["2026-10", "200"]])
    expect(made("yearly", [["2026-01-01", -100]])).toEqual([["2026", "-100"]])
    expect(made("daily", [["2026-10-05", -100]])).toEqual([["2026-10-05", "-100"]])
  })
})

/** 2026-10-05 and 10-12 are Mondays; 10-10 a Saturday; 10-11 a Sunday. */
const DAYS: readonly Group[] = [
  { key: "2026-10-05", actual: dec("5000"), theoretical: dec("3000"), inferred: dec("0"), seconds: dec("3600") },
  { key: "2026-10-10", actual: dec("-2000"), theoretical: dec("1000"), inferred: dec("0"), seconds: dec("3600") },
  { key: "2026-10-11", actual: dec("-8000"), theoretical: dec("0"), inferred: dec("0"), seconds: dec("3600") },
  { key: "2026-10-12", actual: dec("1000"), theoretical: dec("0"), inferred: dec("0"), seconds: dec("3600") },
]

describe("groups set in order and brought together", () => {
  test("days fold into the days of the week, from Monday, the weekend last", () => {
    expect(read(inOrder(byWeekday(DAYS), "weekday"))).toEqual([["0", "6000", "3000"], ["5", "-2000", "1000"], ["6", "-8000", "0"]])
  })

  test("time runs newest first, and anything else best first", () => {
    expect(inOrder(DAYS, "day").map((group) => group.key)).toEqual(["2026-10-12", "2026-10-11", "2026-10-10", "2026-10-05"])
    expect(inOrder(DAYS, "machine").map((group) => group.key)).toEqual(["2026-10-05", "2026-10-12", "2026-10-10", "2026-10-11"])
  })

  test("the same key from several books is one group, and every group comes to the total", () => {
    expect(read(merged([[DAYS[0] as Group], [{ key: "2026-10-05", actual: dec("500"), theoretical: dec("100"), inferred: dec("0"), seconds: dec("3600") }, DAYS[1] as Group]]))).toEqual([["2026-10-05", "5500", "3100"], ["2026-10-10", "-2000", "1000"]])
    expect(read([totalOf(DAYS)])).toEqual([["", "-4000", "4000"]])
    expect(toPlainString(totalOf([{ ...(DAYS[0] as Group), inferred: dec("700") }, { ...(DAYS[1] as Group), inferred: dec("-200") }]).inferred)).toBe("500")
    expect(toPlainString(totalOf(DAYS).seconds)).toBe("14400")
  })
})
