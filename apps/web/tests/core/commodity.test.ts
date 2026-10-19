import { describe, expect, test } from "bun:test"

import { renderCommodity, tokenCommodity } from "../../src/core/commodity/commodity"

describe("commodity", () => {
  test("one commodity per parlor, kind of token and rental rate, the rate first", () => {
    expect(tokenCommodity("ball", "マレハン東京皇国店", "4円")).toBe("玉(4円・マレハン東京皇国店)")
    expect(tokenCommodity("medal", "723修羅の国店", "20円")).toBe("枚(20円・723修羅の国店)")
    expect(tokenCommodity("ball", "A", "4円")).not.toBe(tokenCommodity("ball", "B", "4円"))
    expect(tokenCommodity("ball", "A", "4円")).not.toBe(tokenCommodity("ball", "A", "1円"))
  })

  test("quotes a symbol only when hledger needs it quoted", () => {
    expect(renderCommodity("JPY")).toBe("JPY")
    expect(renderCommodity("玉(4円・マレハン東京皇国店)")).toBe('"玉(4円・マレハン東京皇国店)"')
  })
})
