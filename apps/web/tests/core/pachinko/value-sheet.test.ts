import { describe, expect, test } from "bun:test"

import { sheetBordersOf, sheetValueOf } from "../../../src/core/pachinko/theoretical-value"

/** A machine whose 等価 border is 18 spins for 250 balls: a spin wins 250 / 18 balls. */
const FIGURES = { roundChanceOneIn: 100, payoutPerRound: 25_000 / 18, totalChanceOneIn: undefined, spinsPerHour: undefined }

const EVEN = { rentedPerThousand: 250, exchangedPerHundred: 25, ownShare: 0 }

describe("sheetBordersOf", () => {
  test("at an even exchange every border is the formula's", () => {
    const borders = sheetBordersOf(FIGURES, EVEN)
    expect(borders.cash).toBeCloseTo(18, 9)
    expect(borders.mixed).toBeCloseTo(18, 9)
    expect(borders.own).toBeCloseTo(18, 9)
  })

  test("at 28 balls for ¥100 the cash border rises, the own balls' does not, and the mixed lies between by the share", () => {
    const borders = sheetBordersOf(FIGURES, { ...EVEN, exchangedPerHundred: 28, ownShare: 0.5 })
    expect(borders.cash).toBeCloseTo(20.16, 9)
    expect(borders.own).toBeCloseTo(18, 9)
    expect(borders.mixed).toBeCloseTo((20.16 + 18) / 2, 9)
  })
})

describe("sheetValueOf", () => {
  test("two spins above the border at an even exchange", () => {
    const value = sheetValueOf(FIGURES, EVEN, { spinPerformance: 20, regularSpins: 1000, spinsPerHour: 200 })
    expect(value.yenPerSpin).toBeCloseTo(1000 / 18 - 50, 9)
    expect(value.theoreticalValue).toBeCloseTo((1000 / 18 - 50) * 1000, 6)
    expect(value.ballsGained).toBeCloseTo((250 / 18 - 12.5) * 1000, 6)
    expect(value.yenPerHour).toBeCloseTo((1000 / 18 - 50) * 200, 6)
  })

  test("at each border a spin is worth nothing", () => {
    const corner = { ...EVEN, exchangedPerHundred: 28, ownShare: 0.3 }
    const borders = sheetBordersOf(FIGURES, corner)
    expect(sheetValueOf(FIGURES, corner, { spinPerformance: borders.mixed, regularSpins: 1, spinsPerHour: undefined }).yenPerSpin).toBeCloseTo(0, 9)
    expect(sheetValueOf(FIGURES, { ...corner, ownShare: 0 }, { spinPerformance: borders.cash, regularSpins: 1, spinsPerHour: undefined }).yenPerSpin).toBeCloseTo(0, 9)
    expect(sheetValueOf(FIGURES, { ...corner, ownShare: 1 }, { spinPerformance: borders.own, regularSpins: 1, spinsPerHour: undefined }).yenPerSpin).toBeCloseTo(0, 9)
  })

  test("no hour's worth where the spins an hour are not said", () => {
    expect(sheetValueOf(FIGURES, EVEN, { spinPerformance: 20, regularSpins: 1000, spinsPerHour: undefined }).yenPerHour).toBeUndefined()
  })
})
