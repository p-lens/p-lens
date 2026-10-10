import { describe, expect, test } from "bun:test"

import { reliefDriveAhead, tableInitialSpins } from "../../../src/application/pachinko/hyena-hunt"
import type { Basis } from "../../../src/core/pachinko/formula"

describe("the rows of a 遊タイム狙い table", () => {
  test("run every 50 spins up to the 遊タイム itself", () => {
    expect(tableInitialSpins(200)).toEqual([0, 50, 100, 150, 200])
    expect(tableInitialSpins(120)).toEqual([0, 50, 100, 120])
  })

  test("run every 100 for a long count", () => {
    expect(tableInitialSpins(1500)).toHaveLength(16)
    expect(tableInitialSpins(1500).at(-1)).toBe(1500)
  })
})

describe("a counter against a 遊タイム", () => {
  const basis = (gauge: number | undefined) => ({ normalized: gauge === undefined ? {} : { reliefDrive: { gauge } } }) as unknown as Basis

  test("is so many spins short of it, to the count itself", () => {
    expect(reliefDriveAhead(basis(950), 700)).toEqual({ type: "ahead", spins: 250 })
    expect(reliefDriveAhead(basis(950), 950)).toEqual({ type: "ahead", spins: 0 })
  })

  test("past it finds it spent, and a machine with none has nothing to say", () => {
    expect(reliefDriveAhead(basis(950), 1150)).toEqual({ type: "spent" })
    expect(reliefDriveAhead(basis(undefined), 1150)).toBeUndefined()
  })
})
