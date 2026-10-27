import { describe, expect, test } from "bun:test"

import { focusOf, inLiveSpace, parentOf, pathOf, placeOf, screenOf, type Place } from "../../../src/ui/navigation/place"

const PLACES: readonly Place[] = [
  { kind: "pachislot-machine-search" },
  { kind: "pachislot-machine", machineId: "m 1" },
  { kind: "pachislot-formula", machineId: "m1", formulaId: "f/1" },
  { kind: "pachislot-formula-grounds", machineId: "m1", formulaId: "f1" },
  { kind: "pachislot-formula-basis", machineId: "m1", formulaId: "f1" },
  { kind: "pachislot-formula-value", machineId: "m1", formulaId: "f/1" },
  { kind: "pachislot-machine-value", machineId: "m 1" },
  { kind: "pachislot-formula-new", tab: "basis" },
  { kind: "pachislot-distribution-new", machineId: "m1" },
]

describe("pachislot places", () => {
  test("every one is read back from the address it writes, under /pachislot", () => {
    PLACES.forEach((place) => {
      expect(pathOf(place).startsWith("/pachislot/")).toBe(true)
      expect(placeOf(pathOf(place))).toEqual(place)
    })
  })

  test("each sits in the live space, shown in the content pane", () => {
    PLACES.forEach((place) => {
      expect(inLiveSpace(place)).toBe(true)
      expect(focusOf(place)).toBe("content")
    })
  })

  test("a step back climbs to the pachislot start screen, one depth at a time", () => {
    expect(parentOf({ kind: "pachislot-machine-search" })).toEqual({ kind: "live-new", game: "pachislot" })
    expect(parentOf({ kind: "pachislot-formula-new", tab: "manual" })).toEqual({ kind: "live-new", game: "pachislot" })
    expect(parentOf({ kind: "pachislot-distribution-new", machineId: "m1" })).toEqual({ kind: "pachislot-machine", machineId: "m1" })
    expect(parentOf({ kind: "pachislot-formula-basis", machineId: "m1", formulaId: "f1" })).toEqual({
      kind: "pachislot-formula-grounds",
      machineId: "m1",
      formulaId: "f1",
    })
  })

  test("an address under /pachislot the app has no screen for is not found", () => {
    expect(placeOf("/pachislot")).toEqual({ kind: "not-found", path: "/pachislot" })
    expect(placeOf("/pachislot/machines/m1/formulas/f1/grounds/more")).toEqual({ kind: "not-found", path: "/pachislot/machines/m1/formulas/f1/grounds/more" })
    expect(placeOf("/pachislot/formulas/new/nonsense")).toEqual({ kind: "not-found", path: "/pachislot/formulas/new/nonsense" })
  })

  test("a formula's 期待値算出 is laid over the formula's own screen, and closing it steps up to the formula", () => {
    const value: Place = { kind: "pachislot-formula-value", machineId: "m1", formulaId: "f1" }
    expect(pathOf(value)).toBe("/pachislot/machines/m1/formulas/f1/value")
    expect(screenOf(value)).toBe(screenOf({ kind: "pachislot-formula", machineId: "m1", formulaId: "f1" }))
    expect(parentOf(value)).toEqual({ kind: "pachislot-formula", machineId: "m1", formulaId: "f1" })
  })

  test("the way in from outside names the machine alone, at /value under it", () => {
    expect(placeOf("/pachislot/machines/m1/value")).toEqual({ kind: "pachislot-machine-value", machineId: "m1" })
    expect(parentOf({ kind: "pachislot-machine-value", machineId: "m1" })).toEqual({ kind: "pachislot-machine", machineId: "m1" })
  })
})
