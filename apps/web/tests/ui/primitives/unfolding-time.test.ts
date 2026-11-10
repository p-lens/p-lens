import { describe, expect, test } from "bun:test"

import { unfoldingTimeOf } from "../../../src/ui/primitives/unfolding-time"

describe("how long a part takes to unfold", () => {
  test("is the shortest time for a line or two, longer the taller it is, and never past the longest", () => {
    expect([0, 40, 100].map(unfoldingTimeOf)).toEqual([300, 300, 300])
    expect(unfoldingTimeOf(416)).toBe(511)
    expect(unfoldingTimeOf(2000)).toBe(600)
  })
})
