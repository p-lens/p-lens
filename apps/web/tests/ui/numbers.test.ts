import { describe, expect, test } from "bun:test"

import { decimal } from "../../src/core/decimal/decimal"
import { formatMan, formatTheoreticalYen, theoreticalFigureText } from "../../src/ui/wording/numbers"

describe("large counts as they are said", () => {
  test("in 万 from ten thousand up, as they are below", () => {
    expect(formatMan(9_999)).toBe("9,999")
    expect(formatMan(4_120_000)).toBe("412万")
    expect(formatMan(10_000_000)).toBe("1,000万")
    expect(formatMan(100_000_000)).toBe("1億")
    expect(formatMan(1_250_000_000)).toBe("12億5,000万")
  })
})

describe("a theoretical value in yen", () => {
  test("is always marked with the way it went, and with both where it comes to nothing", () => {
    expect(formatTheoreticalYen(decimal(1240n, 0))).toBe("+¥1,240")
    expect(formatTheoreticalYen(decimal(-380n, 0))).toBe("-¥380")
    expect(formatTheoreticalYen(decimal(0n, 0))).toBe("±¥0")
    expect(formatTheoreticalYen(decimal(-4n, 1))).toBe("±¥0")
  })

  test("worked out in floating point is marked the same way, and keeps its shape where there is none", () => {
    expect(theoreticalFigureText(980.6)).toBe("+¥981")
    expect(theoreticalFigureText(-1234.4)).toBe("-¥1,234")
    expect(theoreticalFigureText(0)).toBe("±¥0")
    expect(theoreticalFigureText(-0.4)).toBe("±¥0")
    expect(theoreticalFigureText(undefined)).toBe("±¥---")
    expect(theoreticalFigureText(null)).toBe("±¥---")
  })
})
