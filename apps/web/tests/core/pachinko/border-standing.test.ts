import { describe, expect, test } from "bun:test"

import { borderStandingOf } from "../../../src/core/pachinko/border-standing"

describe("where a spin performance stands against a border", () => {
  test("is above, below or level, by the rates as they are told to one place", () => {
    expect(borderStandingOf(18.2, 17.6)).toBe("above")
    expect(borderStandingOf(17.1, 17.6)).toBe("below")
    expect(borderStandingOf(17.6, 17.6)).toBe("level")
    expect(borderStandingOf(17.64, 17.56)).toBe("level")
    expect(borderStandingOf(17.65, 17.56)).toBe("above")
  })

  test("is nothing where either is not known", () => {
    expect(borderStandingOf(undefined, 17.6)).toBeUndefined()
    expect(borderStandingOf(18.2, undefined)).toBeUndefined()
  })
})
