import { describe, expect, test } from "bun:test"

import { add, apportioned, compare, decimal, multiply, negate, parseDecimal, subtract, sum, toPlainString } from "../../src/core/decimal/decimal"

const d = (text: string) => {
  const parsed = parseDecimal(text)
  if (!parsed.ok) throw new Error(`test value ${text} does not parse`)
  return parsed.value
}

describe("decimal", () => {
  test("arithmetic is exact where binary floats are not", () => {
    expect(toPlainString(add(d("0.1"), d("0.2")))).toBe("0.3")
    expect(toPlainString(multiply(d("3000"), d("3.57")))).toBe("10710")
    expect(toPlainString(subtract(d("12000"), multiply(d("333"), d("3.57"))))).toBe("10811.19")
  })

  test("equal values share one shape", () => {
    expect(decimal(1800n, 2)).toEqual(decimal(18n, 0))
    expect(compare(d("18.20"), d("18.2"))).toBe(0)
  })

  test("signs and sums", () => {
    expect(toPlainString(negate(d("1290")))).toBe("-1290")
    expect(toPlainString(sum([d("1.5"), d("-0.25"), d("3")]))).toBe("4.25")
    expect(toPlainString(d("-0.05"))).toBe("-0.05")
  })

  test("reads what a person types, and refuses what is not a number", () => {
    expect(toPlainString(d("12,000"))).toBe("12000")
    expect(parseDecimal("1.2.3")).toEqual({ ok: false, error: { type: "not-a-number", text: "1.2.3" } })
    expect(parseDecimal("")).toEqual({ ok: false, error: { type: "not-a-number", text: "" } })
  })

  test("rounds parts so they still add up to their whole rounded", () => {
    const whole = (parts: readonly string[]): readonly string[] => apportioned(parts.map(d), 0).map(toPlainString)
    expect(whole(["1000.3", "200.3", "0.4"])).toEqual(["1000", "200", "1"])
    expect(whole(["5000", "120", "0.4"])).toEqual(["5000", "120", "0"])
    expect(whole(["5000", "120", "-0.6"])).toEqual(["5000", "120", "-1"])
    expect(whole(["0.5", "0.5"])).toEqual(["1", "0"])
    expect(whole([])).toEqual([])
  })
})
