import { describe, expect, test } from "bun:test"

import { readPressAmount } from "../../../src/ui/features/pachinko/live/press-amounts"

describe("what a press adds, as typed", () => {
  test("is a whole number of one to four digits, and is never nothing", () => {
    expect(["200", "９９９９", "1"].map(readPressAmount)).toEqual([200, 9999, 1])
    expect(["", "0", "10000", "2.5", "abc"].map(readPressAmount)).toEqual([undefined, undefined, undefined, undefined, undefined])
  })
})
