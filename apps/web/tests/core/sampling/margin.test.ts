import { describe, expect, test } from "bun:test"

import { marginAtTrials } from "../../../src/core/sampling/margin"

describe("the margin a sampling would come to", () => {
  test("narrows as the square root of its trials, told from one already run", () => {
    expect(marginAtTrials({ margin: 400, trials: 10_000 }, 1_000_000)).toBe(40)
    expect(marginAtTrials({ margin: 400, trials: 10_000 }, 100)).toBe(4000)
  })
})
