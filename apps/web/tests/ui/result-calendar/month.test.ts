import { describe, expect, test } from "bun:test"

import type { IsoMonth } from "../../../src/core/calendar/calendar"
import { fittedSize } from "../../../src/ui/features/result-calendar/fit"
import { byDay, monthAfter, monthBefore, weeksOf } from "../../../src/ui/features/result-calendar/month"
import { cellResult, cellWorth, dayNumber, daySays, monthTitle } from "../../../src/ui/features/result-calendar/wording"
import { dec } from "../../support/values"

const month = (text: string): IsoMonth => text as IsoMonth

describe("a month of the result calendar", () => {
  test("is laid out in weeks of seven, Sunday first, with gaps before its first day and after its last", () => {
    const weeks = weeksOf(month("2026-10"))
    expect(weeks.map((week) => week.length)).toEqual([7, 7, 7, 7, 7])
    expect(weeks[0]).toEqual([undefined, undefined, undefined, undefined, "2026-10-01", "2026-10-02", "2026-10-03"] as never)
    expect(weeks.at(-1)).toEqual(["2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"] as never)
  })

  test("has every day of it once, a leap February and a month of six weeks included", () => {
    const days = (text: string): readonly unknown[] => weeksOf(month(text)).flat().filter((cell) => cell !== undefined)
    expect(days("2028-02").length).toBe(29)
    expect(days("2026-02").length).toBe(28)
    expect(weeksOf(month("2026-02")).length).toBe(4)
    expect(weeksOf(month("2026-08")).length).toBe(6)
    expect(days("2026-08").at(0)).toBe("2026-08-01" as never)
    expect(days("2026-08").at(-1)).toBe("2026-08-31" as never)
  })

  test("is followed and preceded by its neighbours, over a year's end", () => {
    expect(monthAfter(month("2026-12"))).toBe(month("2027-01"))
    expect(monthBefore(month("2027-01"))).toBe(month("2026-12"))
    expect(monthAfter(month("2026-09"))).toBe(month("2026-10"))
  })

  test("finds a day's figures by its day", () => {
    const groups = [{ key: "2026-10-04", actual: dec("-12000"), theoretical: dec("8000"), inferred: dec("0") }]
    expect(byDay(groups).get("2026-10-04")).toEqual(groups[0])
    expect(byDay(groups).get("2026-10-05")).toBeUndefined()
  })
})

describe("the result calendar's words", () => {
  test("say a month, a day's number, and a day's result as a cell has room for", () => {
    expect(monthTitle(month("2026-10"))).toBe("2026年10月")
    expect(dayNumber("2026-10-03" as never)).toBe("3")
    expect(cellResult(dec("12340"))).toBe("+12,340")
    expect(cellResult(dec("-560"))).toBe("-560")
    expect(cellResult(dec("0"))).toBe("0")
    expect(cellWorth(dec("1240.4"))).toBe("+1,240")
    expect(cellWorth(dec("-380"))).toBe("-380")
    expect(cellWorth(dec("0.2"))).toBe("±0")
  })

  test("are written in one size up to six digits, and smaller only for a great win, which still fits its cell", () => {
    expect(fittedSize(cellResult(dec("1234")))).toBe("min(0.75rem, calc(100cqw / 5.12))")
    expect(fittedSize(cellResult(dec("12340")))).toBe("min(0.75rem, calc(100cqw / 5.12))")
    expect(fittedSize(cellResult(dec("360000")))).toBe("min(0.75rem, calc(100cqw / 5.12))")
    expect(fittedSize(cellResult(dec("-1360000")))).toBe("min(0.75rem, calc(100cqw / 6.40))")
    expect(fittedSize("")).toBe("min(0.75rem, calc(100cqw / 5.12))")
  })

  test("say a day aloud, with what it made or that it had no plays", () => {
    expect(daySays("2026-10-03" as never, dec("-560"), undefined)).toBe("10月3日 実収支 -¥560")
    expect(daySays("2026-10-03" as never, dec("-560"), dec("1240"))).toBe("10月3日 実収支 -¥560 期待値 +¥1,240")
    expect(daySays("2026-10-03" as never, undefined, undefined)).toBe("10月3日 収支なし")
  })
})
