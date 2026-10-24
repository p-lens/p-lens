import { describe, expect, test } from "bun:test"

import { seatsAt } from "../../src/sample-book/core/pachinko"
import { PACHINKO_SEAT } from "./fixtures"

const figuresAt = (roundChanceOneIn: number, payoutPerRound: number) => ({ ...PACHINKO_SEAT.figures, roundChanceOneIn, payoutPerRound })

describe("the pachinko machines a sample book sits at", () => {
  test("are those of a border of 16 or more at the even exchange", () => {
    expect(seatsAt(PACHINKO_SEAT.figures)).toBe(true)
    expect(seatsAt(figuresAt(16, 250))).toBe(true)
    expect(seatsAt(figuresAt(15.99, 250))).toBe(false)
  })

  test("leave out a machine of a far lower border, which no sitting's spins could be drawn over", () => {
    expect(seatsAt(figuresAt(1, 180))).toBe(false)
  })
})
