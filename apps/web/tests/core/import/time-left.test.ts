import { describe, expect, test } from "bun:test"

import { secondsLeftOf } from "../../../src/core/import/time-left"

describe("the time a run of like steps has left", () => {
  test("goes at the pace of those done, and is none before any is", () => {
    expect(secondsLeftOf(0, 10, 5_000)).toBeUndefined()
    expect(secondsLeftOf(2, 10, 4_000)).toBe(16)
    expect(secondsLeftOf(10, 10, 4_000)).toBe(0)
  })
})
