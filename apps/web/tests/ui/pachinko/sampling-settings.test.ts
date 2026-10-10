import { describe, expect, test } from "bun:test"

import { seedOf, trialsOf } from "../../../src/ui/features/pachinko/formulas/sampling-settings"

describe("the settings tucked behind a sampling's question mark", () => {
  test("trials are a whole number from one to a hundred million, typed any width", () => {
    expect(trialsOf("１,０００,０００")).toBe(1_000_000)
    expect(trialsOf("0")).toBeUndefined()
    expect(trialsOf("1000000000")).toBe(1_000_000_000)
    expect(trialsOf("1000000001")).toBeUndefined()
    expect(trialsOf("1.5")).toBeUndefined()
  })

  test("a seed is any 64-bit decimal", () => {
    expect(seedOf("18446744073709551615")).toBe("18446744073709551615")
    expect(seedOf("18446744073709551616")).toBeUndefined()
    expect(seedOf("abc")).toBeUndefined()
  })
})
