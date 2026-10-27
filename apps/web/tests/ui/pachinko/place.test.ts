import { describe, expect, test } from "bun:test"

import { focusOf, inLiveSpace, parentOf, pathOf, placeOf, screenOf, type Place } from "../../../src/ui/navigation/place"

const PLACES: readonly Place[] = [
  { kind: "pachinko-machine-search" },
  { kind: "pachinko-machine", machineId: "m 1" },
  { kind: "pachinko-formula", machineId: "m1", formulaId: "f/1" },
  { kind: "pachinko-formula-grounds", machineId: "m1", formulaId: "f1" },
  { kind: "pachinko-formula-basis", machineId: "m1", formulaId: "f1" },
  { kind: "pachinko-formula-value", machineId: "m1", formulaId: "f/1" },
  { kind: "pachinko-machine-value", machineId: "m 1" },
  { kind: "pachinko-formula-new", tab: "basis" },
]

describe("pachinko places", () => {
  test("every one is read back from the address it writes, under /pachinko", () => {
    PLACES.forEach((place) => {
      expect(pathOf(place).startsWith("/pachinko/")).toBe(true)
      expect(placeOf(pathOf(place))).toEqual(place)
    })
  })

  test("each sits in the live space, shown in the content pane", () => {
    PLACES.forEach((place) => {
      expect(inLiveSpace(place)).toBe(true)
      expect(focusOf(place)).toBe("content")
    })
  })

  test("a step back climbs to the pachinko start screen, one depth at a time", () => {
    expect(parentOf({ kind: "pachinko-machine-search" })).toEqual({ kind: "live-new", game: "pachinko" })
    expect(parentOf({ kind: "pachinko-formula-new", tab: "manual" })).toEqual({ kind: "live-new", game: "pachinko" })
    expect(parentOf({ kind: "pachinko-formula", machineId: "m1", formulaId: "f1" })).toEqual({ kind: "pachinko-machine", machineId: "m1" })
    expect(parentOf({ kind: "pachinko-formula-basis", machineId: "m1", formulaId: "f1" })).toEqual({
      kind: "pachinko-formula-grounds",
      machineId: "m1",
      formulaId: "f1",
    })
  })

  test("a formula's 期待値算出 is laid over the formula's own screen, and closing it steps up to the formula", () => {
    const value: Place = { kind: "pachinko-formula-value", machineId: "m1", formulaId: "f1" }
    expect(pathOf(value)).toBe("/pachinko/machines/m1/formulas/f1/value")
    expect(screenOf(value)).toBe(screenOf({ kind: "pachinko-formula", machineId: "m1", formulaId: "f1" }))
    expect(parentOf(value)).toEqual({ kind: "pachinko-formula", machineId: "m1", formulaId: "f1" })
  })

  test("the way in from outside names the machine alone, at /value under it", () => {
    expect(placeOf("/pachinko/machines/m1/value")).toEqual({ kind: "pachinko-machine-value", machineId: "m1" })
    expect(parentOf({ kind: "pachinko-machine-value", machineId: "m1" })).toEqual({ kind: "pachinko-machine", machineId: "m1" })
  })

  test("an address under /pachinko the app has no screen for is not found", () => {
    expect(placeOf("/pachinko")).toEqual({ kind: "not-found", path: "/pachinko" })
    expect(placeOf("/pachinko/machines/m1/formulas/f1/grounds/more")).toEqual({ kind: "not-found", path: "/pachinko/machines/m1/formulas/f1/grounds/more" })
    expect(placeOf("/pachinko/formulas/new/nonsense")).toEqual({ kind: "not-found", path: "/pachinko/formulas/new/nonsense" })
  })
})
