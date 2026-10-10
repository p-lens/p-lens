import { expect, test } from "bun:test"

import type { SpecDto } from "../../src/pachinko/engine.ts"
import expected from "../../fixtures/pachinko/made-up/expected.json"
import spec from "../../fixtures/pachinko/made-up/spec.json"

test("the made-up fixture is a spec in the contract's shape", () => {
  const typed: SpecDto = spec as SpecDto
  expect(typed.components.allotment?.["regular"]?.reduce((sum, share) => sum + share.shareBasisPoints, 0)).toBe(10_000)
  expect(typed.entities).toEqual(["regular", "RUSH"])
})

test("its expected figures are the ones worked out by hand", () => {
  expect(expected.averageRounds).toBeCloseTo(10 + (0.5 * (0.8 * 10)) / (1 - 0.8), 12)
  expect(expected.averagePayout).toBe(expected.averageRounds * 140)
})
