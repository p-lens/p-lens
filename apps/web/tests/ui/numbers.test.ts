import { describe, expect, test } from "bun:test"

import { formatMan } from "../../src/ui/wording/numbers"

describe("large counts as they are said", () => {
  test("in 万 from ten thousand up, as they are below", () => {
    expect(formatMan(9_999)).toBe("9,999")
    expect(formatMan(4_120_000)).toBe("412万")
    expect(formatMan(10_000_000)).toBe("1,000万")
    expect(formatMan(100_000_000)).toBe("1億")
    expect(formatMan(1_250_000_000)).toBe("12億5,000万")
  })
})
