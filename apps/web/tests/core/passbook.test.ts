import { describe, expect, test } from "bun:test"

import type { MixedAmount, Posting, Transaction } from "../../src/hledger/protocol/wire"
import { parseDecimal, toPlainString, type Decimal } from "../../src/core/decimal/decimal"
import { passbookOf, type PassbookDay } from "../../src/core/report/passbook"
import type { PricePoint } from "../../src/core/valuation/valuation"
import { rateChangeLine } from "../../src/core/savings/rate-change"

const ACCOUNT = "資産:貯玉:梅田:4円"
const COMMODITY = "玉(4円・梅田)"

const dec = (text: string): Decimal => ((parsed) => (parsed.ok ? parsed.value : (() => { throw new Error(text) })()))(parseDecimal(text))

const amount = (quantity: string, commodity: string = COMMODITY): MixedAmount => {
  const value = dec(quantity)
  return [{ acommodity: commodity, aquantity: { decimalMantissa: Number(value.mantissa), decimalPlaces: value.places, floatingPoint: Number(quantity) } } as never]
}

const posting = (account: string, quantity: string): Posting => ({ paccount: account, pamount: amount(quantity), preal: "RealPosting", ptags: [] }) as never

const entry = (date: string, tags: readonly (readonly [string, string])[], ...quantities: readonly string[]): Transaction => ({
  tdate: date,
  tdescription: "梅田 | ",
  ttags: tags,
  tpostings: [...quantities.map((quantity) => posting(ACCOUNT, quantity)), posting("収益:遊技", "0")],
})

const price = (date: string, rate: string): PricePoint => ({ date: date as never, commodity: COMMODITY, rate: dec(rate) })

const shown = (days: readonly PassbookDay[]) =>
  days.map((day) => ({
    date: String(day.date),
    out: toPlainString(day.withdrawn),
    in: toPlainString(day.deposited),
    balance: toPlainString(day.balance),
    lines: day.lines.map((line) => [line.cause.type === "tally" ? (line.cause.machine ?? "") : line.cause.type, line.entries, toPlainString(line.withdrawn), toPlainString(line.deposited)]),
    rate: day.rateSet === undefined ? undefined : [day.rateSet.before === undefined ? undefined : toPlainString(day.rateSet.before), toPlainString(day.rateSet.rate)],
  }))

describe("a pool's passbook", () => {
  test("is the days its savings moved or its rate was set, newest first, each with what went out and came in, what was left, and what moved them by machine", () => {
    const days = passbookOf(
      [
        entry("2026-10-01", [["savings", "opening"]], "1000"),
        entry("2026-10-03", [["play-id", "p1"], ["machine", "海物語"]], "-500", "1200"),
        entry("2026-10-03", [["play-id", "p2"], ["machine", "海物語"]], "300"),
        entry("2026-10-03", [["play-id", "p3"], ["machine", "牙狼"]], "-1000"),
        entry("2026-10-05", [["savings", "prize-exchange"]], "-800"),
      ],
      ACCOUNT,
      COMMODITY,
      [price("2026-10-01", "3.571429"), price("2026-10-04", "3.4"), price("2026-10-04", "3.5")],
    )
    expect(shown(days)).toEqual([
      { date: "2026-10-05", out: "800", in: "0", balance: "200", lines: [["prize-exchange", 1, "800", "0"]], rate: undefined },
      { date: "2026-10-04", out: "0", in: "0", balance: "1000", lines: [], rate: ["3.571429", "3.5"] },
      { date: "2026-10-03", out: "1500", in: "1500", balance: "1000", lines: [["海物語", 2, "500", "1500"], ["牙狼", 1, "1000", "0"]], rate: undefined },
      { date: "2026-10-01", out: "0", in: "1000", balance: "1000", lines: [["opening", 1, "0", "1000"]], rate: [undefined, "3.571429"] },
    ])
  })

  test("says no rate set on a day whose price repeats the rate in force, nor lists the day for it alone", () => {
    const days = passbookOf(
      [entry("2026-10-01", [["savings", "opening"]], "1000"), entry("2026-10-03", [["play-id", "p1"], ["machine", "海物語"]], "200")],
      ACCOUNT,
      COMMODITY,
      [price("2026-10-01", "3.5"), price("2026-10-03", "3.50"), price("2026-10-04", "3.5"), price("2026-10-06", "3.4")],
    )
    expect(shown(days).map((day) => [day.date, day.rate])).toEqual([
      ["2026-10-06", ["3.5", "3.4"]],
      ["2026-10-03", undefined],
      ["2026-10-01", [undefined, "3.5"]],
    ])
  })

  test("is empty for a pool nothing has moved and no rate was set for", () => {
    expect(passbookOf([], ACCOUNT, COMMODITY, [price("2026-10-01", "3.5")].map((point) => ({ ...point, commodity: "玉(4円・難波)" })))).toEqual([])
  })
})

describe("setting a pool's rate", () => {
  const change = { parlorName: "梅田", pool: { kind: "ball" as const, tier: "4円" }, date: "2026-10-10" as never, rate: dec("3.5") }

  test("writes the price line for the day, and nothing where the day already has that rate", () => {
    expect(rateChangeLine(change, [price("2026-10-01", "3.571429")])).toEqual({ ok: true, value: `P 2026-10-10 "${COMMODITY}" 3.5 JPY\n` })
    expect(rateChangeLine(change, [price("2026-10-10", "3.5")])).toEqual({ ok: true, value: undefined })
    expect(rateChangeLine(change, [price("2026-10-01", "3.5")])).toEqual({ ok: true, value: undefined })
    expect(rateChangeLine({ ...change, rate: dec("0") }, [])).toEqual({ ok: false, error: { type: "rate-not-positive" } })
  })
})
