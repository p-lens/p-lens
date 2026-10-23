import { afterEach, describe, expect, test } from "bun:test"

import { decimal } from "../../src/core/decimal/decimal"
import { seal, turnMumming } from "../../src/mummer"
import { amountText, formatSignedYen, formatMan, formatTheoreticalYen, formatTokens, formatYen, theoreticalFigureText, theoreticalFractionText, toneOf } from "../../src/ui/wording/numbers"

describe("large counts as they are said", () => {
  test("in 万 from ten thousand up, as they are below", () => {
    expect(formatMan(9_999)).toBe("9,999")
    expect(formatMan(4_120_000)).toBe("412万")
    expect(formatMan(10_000_000)).toBe("1,000万")
    expect(formatMan(100_000_000)).toBe("1億")
    expect(formatMan(1_250_000_000)).toBe("12億5,000万")
  })
})

describe("tokens", () => {
  test("are whole, whatever places hledger hands them back with, rounded half up", () => {
    expect(formatTokens(seal.play(decimal(123400n, 2)), "ball")).toBe("1,234玉")
    expect(formatTokens(seal.play(decimal(125n, 1)), "medal")).toBe("13枚")
    expect(formatTokens(seal.play(decimal(-12340n, 1)), "ball")).toBe("-1,234玉")
  })
})

describe("a theoretical value in yen", () => {
  test("is always marked with the way it went, and with both where it comes to nothing", () => {
    expect(formatTheoreticalYen(seal.play(decimal(1240n, 0)))).toBe("+¥1,240")
    expect(formatTheoreticalYen(seal.play(decimal(-380n, 0)))).toBe("-¥380")
    expect(formatTheoreticalYen(seal.play(decimal(0n, 0)))).toBe("±¥0")
    expect(formatTheoreticalYen(seal.play(decimal(-4n, 1)))).toBe("±¥0")
  })

  test("worked out in floating point is marked the same way, and keeps its shape where there is none", () => {
    expect(theoreticalFigureText(seal.play(980.6))).toBe("+¥981")
    expect(theoreticalFigureText(seal.play(-1234.4))).toBe("-¥1,234")
    expect(theoreticalFigureText(seal.play(0))).toBe("±¥0")
    expect(theoreticalFigureText(seal.play(-0.4))).toBe("±¥0")
    expect(theoreticalFigureText(seal.play(undefined))).toBe("±¥---")
    expect(theoreticalFigureText(seal.play(null))).toBe("±¥---")
  })

  test("too small for whole yen keeps its places, and its mark", () => {
    expect(theoreticalFractionText(seal.play(102.34561), 4)).toBe("+¥102.3456")
    expect(theoreticalFractionText(seal.play(-0.031), 4)).toBe("-¥0.0310")
    expect(theoreticalFractionText(seal.play(1234.5), 4)).toBe("+¥1,234.5000")
    expect(theoreticalFractionText(seal.play(-0.00004), 4)).toBe("±¥0.0000")
    expect(theoreticalFractionText(seal.play(undefined), 4)).toBe("±¥---")
  })
})

describe("an amount while mumming", () => {
  afterEach(() => turnMumming(false))

  test("is veiled in one shape whatever its size, keeping the way it went where its kind lets that be seen", () => {
    turnMumming(true)
    expect(formatSignedYen(seal.tally(decimal(-123_456n, 0)))).toBe("-¥•,•••")
    expect(formatSignedYen(seal.tally(decimal(5n, 0)))).toBe("+¥•,•••")
    expect(formatTheoreticalYen(seal.tally(decimal(0n, 0)))).toBe("±¥•,•••")
    expect(formatYen(seal.savings(decimal(-800n, 0)))).toBe("¥•,•••")
    expect(formatTokens(seal.savings(decimal(12_340n, 0)), "medal")).toBe("•,•••枚")
    expect(theoreticalFractionText(seal.tally(0.0123), 4)).toBe("+¥•.••••")
    expect(amountText(seal.savings(-3))).toBe("•,•••")
  })

  test("is coloured by the way it went only where its kind lets that be seen", () => {
    turnMumming(true)
    expect([toneOf(seal.tally(decimal(-1n, 0))), toneOf(seal.savings(decimal(-1n, 0))), toneOf(seal.play(decimal(-1n, 0)))]).toEqual(["negative", "neutral", "negative"])
  })

  test("of a play is shown as it is", () => {
    turnMumming(true)
    expect([formatSignedYen(seal.play(decimal(-1_643n, 0))), amountText(seal.play(12_340))]).toEqual(["-¥1,643", "12,340"])
  })
})
