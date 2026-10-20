import { describe, expect, test } from "bun:test"

import { borderMarkOf } from "../../../src/core/pachinko/border-standing"

describe("where a play stands against its border", () => {
  test("is graded by what a spin is worth over an hour of 200 spins", () => {
    expect(borderMarkOf(12.5)).toEqual({ standing: "above", grade: "outstanding" })
    expect(borderMarkOf(12.49)).toEqual({ standing: "above", grade: "excellent" })
    expect(borderMarkOf(10)).toEqual({ standing: "above", grade: "excellent" })
    expect(borderMarkOf(9.99)).toEqual({ standing: "above", grade: "strong" })
    expect(borderMarkOf(8.75)).toEqual({ standing: "above", grade: "strong" })
    expect(borderMarkOf(8.74)).toEqual({ standing: "above", grade: "professional" })
    expect(borderMarkOf(7.5)).toEqual({ standing: "above", grade: "professional" })
    expect(borderMarkOf(7.49)).toEqual({ standing: "above", grade: "modest" })
    expect(borderMarkOf(0.005)).toEqual({ standing: "above", grade: "modest" })
    expect(borderMarkOf(-1.5)).toEqual({ standing: "below", grade: "near" })
    expect(borderMarkOf(-1.51)).toEqual({ standing: "below", grade: "short" })
  })

  test("is level with the border where an hour comes to nothing to the yen", () => {
    expect(borderMarkOf(0)).toEqual({ standing: "level", grade: "near" })
    expect(borderMarkOf(0.002)).toEqual({ standing: "level", grade: "near" })
    expect(borderMarkOf(-0.002)).toEqual({ standing: "level", grade: "near" })
  })

  test("is nothing where what a spin is worth is not known", () => {
    expect(borderMarkOf(undefined)).toBeUndefined()
  })
})
