import { describe, expect, test } from "bun:test"

import { focusOf, inLiveSpace, parentOf, pathOf, placeOf, type Place } from "../../../src/ui/navigation/place"

const PLACES: readonly Place[] = [
  { kind: "pachislot-machine-search" },
  { kind: "pachislot-machine", machineId: "m 1" },
  { kind: "pachislot-formula", machineId: "m1", formulaId: "f/1" },
  { kind: "pachislot-formula-grounds", machineId: "m1", formulaId: "f1" },
  { kind: "pachislot-formula-basis", machineId: "m1", formulaId: "f1" },
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

  test("a step back climbs to the slot start screen, one depth at a time", () => {
    expect(parentOf({ kind: "pachislot-machine-search" })).toEqual({ kind: "live-new", game: "slot" })
    expect(parentOf({ kind: "pachislot-formula-new", tab: "manual" })).toEqual({ kind: "live-new", game: "slot" })
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
})
