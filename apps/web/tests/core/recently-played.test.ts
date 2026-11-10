import { describe, expect, test } from "bun:test"

import type { MachineSummary } from "../../src/core/catalog/catalog"
import { playedFirst, recentlyPlayedAmong, RECENTLY_PLAYED_KEPT } from "../../src/core/catalog/recently-played"
import type { IsoDate } from "../../src/core/calendar/calendar"
import type { MachineId } from "../../src/core/machine/machine"

const ids = (...given: readonly string[]): readonly MachineId[] => given as MachineId[]

const machine = (id: string): MachineSummary => ({ id: id as MachineId, gameKind: "pachinko", name: id, modelName: undefined, keywords: [], hitChance: undefined, formulaHitChances: [], formulaCount: 1, releasedOn: "2026-01-01" as IsoDate })

describe("the machines played lately", () => {
  test("put the one just played at the head", () => {
    expect(playedFirst(ids(), "a" as MachineId)).toEqual(ids("a"))
    expect(playedFirst(ids("b", "c"), "a" as MachineId)).toEqual(ids("a", "b", "c"))
  })

  test("leave the order as it was when the head is played again", () => {
    expect(playedFirst(ids("a", "b", "c"), "a" as MachineId)).toEqual(ids("a", "b", "c"))
  })

  test("move one played before up to the head, kept once", () => {
    expect(playedFirst(ids("a", "b", "c"), "c" as MachineId)).toEqual(ids("c", "a", "b"))
  })

  test("keep no more than a few, letting the oldest go", () => {
    expect(RECENTLY_PLAYED_KEPT).toBe(3)
    expect(playedFirst(ids("a", "b", "c"), "d" as MachineId)).toEqual(ids("d", "a", "b"))
  })

  test("are found among those delivered in the order played, passing over one no longer delivered", () => {
    const delivered = [machine("x"), machine("b"), machine("a")]
    expect(recentlyPlayedAmong(delivered, ids("a", "gone", "b")).map((found): MachineId => found.id)).toEqual([...ids("a", "b")])
    expect(recentlyPlayedAmong(delivered, ids())).toEqual([])
    expect(recentlyPlayedAmong([...delivered, machine("y")], ids("a", "b", "x", "y")).map((found): MachineId => found.id)).toEqual([...ids("a", "b", "x")])
  })
})
