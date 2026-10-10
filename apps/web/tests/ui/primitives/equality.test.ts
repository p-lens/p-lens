import { describe, expect, test } from "bun:test"

import { sameFields } from "../../../src/ui/primitives/equality"

describe("two records told apart by their fields", () => {
  test("are the same where every field is the very same value", () => {
    const basis = { spec: 1 }
    expect(sameFields({ basis, spins: 512 }, { basis, spins: 512 })).toBe(true)
    expect(sameFields({ basis, spins: 512 }, { basis, spins: 51 })).toBe(false)
    expect(sameFields({ basis, spins: 512 }, { basis: { spec: 1 }, spins: 512 })).toBe(false)
  })

  test("are told from nothing, and nothing is the same as nothing", () => {
    expect(sameFields<{ readonly spins: number }>(undefined, undefined)).toBe(true)
    expect(sameFields({ spins: 512 }, undefined)).toBe(false)
  })
})
