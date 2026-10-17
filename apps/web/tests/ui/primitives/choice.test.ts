import { describe, expect, test } from "bun:test"

import { isNarrowed, isTicked, tickedAll, tickedOne, tickStateOf } from "../../../src/ui/primitives/choice"

const EVERY = ["a", "b", "c"] as const

describe("a filter's choice", () => {
  test("is every one until something is left out", () => {
    expect(isNarrowed(undefined)).toBe(false)
    expect(isNarrowed(["a"])).toBe(true)
    expect(isNarrowed([])).toBe(true)
    expect(isTicked(undefined, "b")).toBe(true)
    expect(isTicked(["a"], "b")).toBe(false)
  })

  test("ticks and unticks one at a time in the list's order, every one again once nothing is left out", () => {
    expect(tickedOne(EVERY, undefined, "b", false)).toEqual(["a", "c"])
    expect(tickedOne(EVERY, ["c"], "a", true)).toEqual(["a", "c"])
    expect(tickedOne(EVERY, ["a", "c"], "b", true)).toBeUndefined()
    expect(tickedOne(EVERY, ["a"], "a", false)).toEqual([])
  })

  test("is all or none from the tick for all of them, which stands mixed while some are ticked", () => {
    expect(tickedAll(true)).toBeUndefined()
    expect(tickedAll(false)).toEqual([])
    expect(tickStateOf(EVERY, undefined)).toBe("all")
    expect(tickStateOf(EVERY, [])).toBe("none")
    expect(tickStateOf(EVERY, ["b"])).toBe("some")
    expect(tickStateOf(EVERY, ["gone"])).toBe("none")
  })
})
