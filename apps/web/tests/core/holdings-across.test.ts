import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../src/core/calendar/calendar"
import { toPlainString } from "../../src/core/decimal/decimal"
import type { ParlorId } from "../../src/core/parlor/parlor"
import { parlorsAcross, type Holdings, type ParlorHolding } from "../../src/core/report/holdings"
import { dec } from "../support/values"

const parlor = (id: string, name: string, quantity: string, rate: string, value: string): ParlorHolding => ({
  parlorName: name,
  parlor: { identity: { type: "listed", id: id as ParlorId }, name, pools: [{ kind: "ball", tier: "4円" }] },
  tokens: [{ kind: "ball", tier: "4円", commodity: `玉(4円・${name})`, quantity: dec(quantity), value: dec(value), rate: { date: "2026-10-01" as IsoDate, commodity: `玉(4円・${name})`, rate: dec(rate) } }],
  value: dec(value),
})

const book = (...parlors: readonly ParlorHolding[]): Holdings => ({ parlors, total: dec("0"), valuedOn: undefined })

describe("several books' savings, parlor by parlor", () => {
  test("make a parlor the books keep one, its tokens and their worth added, every rate kept, and the books counted", () => {
    const across = parlorsAcross([book(parlor("a", "梅田店", "1000", "3.57", "3570"), parlor("b", "難波店", "200", "4", "800")), book(parlor("a", "梅田店", "500", "4", "2000")), book(parlor("a", "梅田店", "100", "3.57", "357"))])
    expect(across.map((each) => [each.parlorName, each.books, toPlainString(each.value), each.pools.map((pool) => [pool.tier, toPlainString(pool.quantity), toPlainString(pool.value), pool.rates.map(toPlainString)])])).toEqual([
      ["梅田店", 3, "5927", [["4円", "1600", "5927", ["3.57", "4"]]]],
      ["難波店", 1, "800", [["4円", "200", "800", ["4"]]]],
    ])
  })
})
