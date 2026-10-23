import { describe, expect, test } from "bun:test"

import { borderMarkOf } from "../../../src/core/pachinko/border-standing"

const MEASURED = { spins: 300, minutes: 90 }

describe("where a play stands against its border", () => {
  test("is graded by what a spin is worth over an hour of 200 spins", () => {
    expect(borderMarkOf(25, MEASURED)).toEqual({ standing: "above", grade: "crowned" })
    expect(borderMarkOf(24.99, MEASURED)).toEqual({ standing: "above", grade: "shining" })
    expect(borderMarkOf(20, MEASURED)).toEqual({ standing: "above", grade: "shining" })
    expect(borderMarkOf(19.99, MEASURED)).toEqual({ standing: "above", grade: "outstanding" })
    expect(borderMarkOf(15, MEASURED)).toEqual({ standing: "above", grade: "outstanding" })
    expect(borderMarkOf(14.99, MEASURED)).toEqual({ standing: "above", grade: "excellent" })
    expect(borderMarkOf(10, MEASURED)).toEqual({ standing: "above", grade: "excellent" })
    expect(borderMarkOf(9.99, MEASURED)).toEqual({ standing: "above", grade: "strong" })
    expect(borderMarkOf(8.75, MEASURED)).toEqual({ standing: "above", grade: "strong" })
    expect(borderMarkOf(8.74, MEASURED)).toEqual({ standing: "above", grade: "professional" })
    expect(borderMarkOf(7.5, MEASURED)).toEqual({ standing: "above", grade: "professional" })
    expect(borderMarkOf(7.49, MEASURED)).toEqual({ standing: "above", grade: "modest" })
    expect(borderMarkOf(0.005, MEASURED)).toEqual({ standing: "above", grade: "modest" })
    expect(borderMarkOf(-1.5, MEASURED)).toEqual({ standing: "below", grade: "near" })
    expect(borderMarkOf(-1.51, MEASURED)).toEqual({ standing: "below", grade: "short" })
    expect(borderMarkOf(-5, MEASURED)).toEqual({ standing: "below", grade: "short" })
    expect(borderMarkOf(-5.01, MEASURED)).toEqual({ standing: "below", grade: "shorter" })
    expect(borderMarkOf(-10, MEASURED)).toEqual({ standing: "below", grade: "shorter" })
    expect(borderMarkOf(-10.01, MEASURED)).toEqual({ standing: "below", grade: "deep" })
    expect(borderMarkOf(-15, MEASURED)).toEqual({ standing: "below", grade: "deep" })
    expect(borderMarkOf(-15.01, MEASURED)).toEqual({ standing: "below", grade: "deepest" })
  })

  test("holds the gold star back until 300 spins have been measured over 90 minutes", () => {
    expect(borderMarkOf(30, { spins: 299, minutes: 120 })).toEqual({ standing: "above", grade: "excellent" })
    expect(borderMarkOf(30, { spins: 310, minutes: 3 })).toEqual({ standing: "above", grade: "excellent" })
    expect(borderMarkOf(30, { spins: 300, minutes: 89.9 })).toEqual({ standing: "above", grade: "excellent" })
    expect(borderMarkOf(30, { spins: 300, minutes: undefined })).toEqual({ standing: "above", grade: "excellent" })
    expect(borderMarkOf(30, { spins: 300, minutes: 90 })).toEqual({ standing: "above", grade: "crowned" })
    expect(borderMarkOf(20, { spins: 300, minutes: 89 })).toEqual({ standing: "above", grade: "excellent" })
    expect(borderMarkOf(15, { spins: 299, minutes: 90 })).toEqual({ standing: "above", grade: "excellent" })
    expect(borderMarkOf(10, { spins: 1, minutes: 0 })).toEqual({ standing: "above", grade: "excellent" })
    expect(borderMarkOf(-5, { spins: 1, minutes: 0 })).toEqual({ standing: "below", grade: "short" })
  })

  test("is level with the border where an hour comes to nothing to the yen", () => {
    expect(borderMarkOf(0, MEASURED)).toEqual({ standing: "level", grade: "near" })
    expect(borderMarkOf(0.002, MEASURED)).toEqual({ standing: "level", grade: "near" })
    expect(borderMarkOf(-0.002, MEASURED)).toEqual({ standing: "level", grade: "near" })
  })

  test("is nothing where what a spin is worth is not known", () => {
    expect(borderMarkOf(undefined, MEASURED)).toBeUndefined()
  })
})
