import { describe, expect, test } from "bun:test"

import { toPlainString } from "../../src/core/decimal/decimal"
import { flippedSign } from "../../src/ui/primitives/flipped-sign"
import { readOptionalYen } from "../../src/ui/features/record-tally/form"

describe("a number's sign turned over by its button", () => {
  test("puts a minus before a number and takes it off again, a full-width or true minus too, and reads below nothing", () => {
    expect(flippedSign("1200")).toBe("-1200")
    expect(flippedSign("-1200")).toBe("1200")
    expect(flippedSign("－1,200")).toBe("1,200")
    expect(flippedSign("−35.5")).toBe("35.5")
    expect(flippedSign("")).toBe("-")
    expect(flippedSign("-")).toBe("")
    const read = readOptionalYen(flippedSign("1,200"), "theoretical-value")
    expect(read.ok && read.value !== undefined ? toPlainString(read.value) : undefined).toBe("-1200")
  })
})
