import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../src/core/calendar/calendar"
import { decimal } from "../../src/core/decimal/decimal"
import { latestRate, rateOn, type PricePoint } from "../../src/core/valuation/valuation"

const point = (date: string, commodity: string, cents: bigint): PricePoint => ({
  date: date as IsoDate,
  commodity,
  rate: decimal(cents, 2),
})

const POINTS = [
  point("2026-09-01", "玉(梅田)", 357n),
  point("2026-09-01", "玉(松原)", 333n),
  point("2026-09-25", "玉(梅田)", 350n),
]

describe("price points", () => {
  test("the rate in force is the latest on or before the day", () => {
    expect(rateOn(POINTS, "玉(梅田)", "2026-09-24" as IsoDate)?.rate).toEqual(decimal(357n, 2))
    expect(rateOn(POINTS, "玉(梅田)", "2026-09-25" as IsoDate)?.rate).toEqual(decimal(350n, 2))
    expect(rateOn(POINTS, "玉(梅田)", "2026-08-31" as IsoDate)).toBeUndefined()
  })

  test("a change of rate leaves every earlier day its own rate", () => {
    expect(rateOn(POINTS, "玉(梅田)", "2026-09-05" as IsoDate)?.rate).toEqual(decimal(357n, 2))
    expect(latestRate(POINTS, "玉(梅田)")?.rate).toEqual(decimal(350n, 2))
  })

  test("of two points on one day, the one written later wins", () => {
    const sameDay = [...POINTS, point("2026-09-25", "玉(梅田)", 340n)]
    expect(rateOn(sameDay, "玉(梅田)", "2026-09-30" as IsoDate)?.rate).toEqual(decimal(34n, 1))
  })
})
