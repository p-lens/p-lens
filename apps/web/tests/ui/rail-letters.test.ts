import { describe, expect, test } from "bun:test"

import { DEFAULT_RAIL_LETTERS, readRailLetters } from "../../src/ui/theme/rail-letters"

describe("the characters a book is shown by on the rail", () => {
  test("are one, until a person says two", () => {
    expect(DEFAULT_RAIL_LETTERS).toBe(1)
    expect(readRailLetters(undefined)).toBe(1)
    expect(readRailLetters("3")).toBe(1)
  })

  test("a stored choice is kept as it was", () => {
    expect(readRailLetters("1")).toBe(1)
    expect(readRailLetters("2")).toBe(2)
  })
})
