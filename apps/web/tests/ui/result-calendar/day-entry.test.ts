import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../../src/core/calendar/calendar"
import { decimal } from "../../../src/core/decimal/decimal"
import { dayAfter, enteredOf, enteredTotal, typedResult } from "../../../src/ui/features/result-calendar/day-entry"
import { dayTitle } from "../../../src/ui/features/result-calendar/wording"

const yen = (amount: number) => decimal(BigInt(amount), 0)

const day = (date: string) => date as IsoDate

describe("a day's 収支 as it is typed", () => {
  test("is whole yen, its thousands grouped or not, the way it went chosen beside it", () => {
    expect(typedResult({ sign: "gain", amount: "12000" })).toEqual({ ok: true, value: yen(12000) })
    expect(typedResult({ sign: "loss", amount: "12,000" })).toEqual({ ok: true, value: yen(-12000) })
  })

  test("is nothing where nothing was typed, or nought", () => {
    expect(typedResult({ sign: "loss", amount: " " })).toEqual({ ok: true, value: undefined })
    expect(typedResult({ sign: "gain", amount: "0" })).toEqual({ ok: true, value: undefined })
  })

  test("is no sum where it is not whole yen", () => {
    expect(["-500", "1.5", "12,00", "千円"].map((amount) => typedResult({ sign: "gain", amount }).ok)).toEqual([false, false, false, false])
  })
})

describe("the days typed", () => {
  const typed = new Map([
    [day("2026-10-09"), { sign: "gain", amount: "5000" }],
    [day("2026-09-30"), { sign: "loss", amount: "12000" }],
    [day("2026-10-01"), { sign: "loss", amount: "" }],
    [day("2026-10-02"), { sign: "loss", amount: "abc" }],
  ] as const)

  test("are written in date order, those that came to something, and a day that is no sum is told apart", () => {
    const entered = enteredOf(typed)
    expect(entered.days).toEqual([
      { date: day("2026-09-30"), result: yen(-12000) },
      { date: day("2026-10-09"), result: yen(5000) },
    ])
    expect(entered.unread).toEqual([day("2026-10-02")])
    expect(enteredTotal(entered.days)).toEqual(yen(-7000))
  })
})

describe("the next day", () => {
  test("runs on into the next month and the next year", () => {
    expect([dayAfter(day("2026-10-09")), dayAfter(day("2026-10-31")), dayAfter(day("2026-12-31")), dayAfter(day("2028-02-28"))]).toEqual(["2026-10-10", "2026-11-01", "2027-01-01", "2028-02-29"] as never)
  })

  test("is titled with its weekday", () => {
    expect(dayTitle(day("2026-10-09"))).toBe("10月9日(金)")
  })
})
