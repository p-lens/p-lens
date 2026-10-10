import { expect, test } from "bun:test"

import type { NormalizedSpecDto, SpecDto } from "../../src/pachislot/engine.ts"
import expected from "../../fixtures/pachislot/made-up/expected.json"
import normalized from "../../fixtures/pachislot/made-up/normalized.json"
import spec from "../../fixtures/pachislot/made-up/spec.json"

test("the made-up pachislot machine is a spec in the contract's shape", () => {
  const typed = spec as SpecDto
  expect(typed.resources.settingLevels).toEqual([1, 6])
  expect(typed.components.bonus).toEqual(["big", "reg"])
  expect(Object.keys(typed.components.partOf ?? {})).toEqual(["reg-solo", "reg-cherry"])
  expect(typed.entities.filter((entity) => typed.components.chance?.[entity] === undefined)).toEqual(["reg"])
})

test("its normalised form lists every way a game comes up, under every setting level", () => {
  const typed = normalized as NormalizedSpecDto
  expect(typed.tables.map((table) => table.events.length)).toEqual([6, 6])
  expect(typed.tables[1]?.events.filter((event) => event.group === "reg").map((event) => event.id)).toEqual(["reg-solo", "reg-cherry"])
})

test("its expected figures are the ones worked out by hand", () => {
  const [low, high] = expected.settingLevels
  expect(low?.netPerGame).toBeCloseTo(0.004 * 237 + 0.0025 * 93 + 0.16 * 5 - 0.025 - 0.6715 * 3, 12)
  expect(high?.netPerGame).toBeCloseTo(0.005 * 237 + 0.004 * 93 + 0.17 * 5 - 0.025 - 0.659 * 3, 12)
  expect(high?.payoutRate).toBeCloseTo(1 + 0.405 / 3, 12)
})
