import { describe, expect, test } from "bun:test"

import { measuredSpinPerformance, consumptionOf } from "../../../src/core/pachinko/consumption"
import { countedPayoutsOf, payoutRatioOf } from "../../../src/core/pachinko/payout"
import { playTheoreticalValue } from "../../../src/core/pachinko/theoretical-value"
import type { Checkpoint } from "../../../src/core/play-log/checkpoint"
import type { PlayTerms } from "../../../src/core/parlor/terms"

const TERMS: PlayTerms = { rental: { yen: 1000, tokens: 250 }, exchange: { yen: 1000, tokens: 280 }, replay: { paidOut: 250, deducted: 250 } }

/** A 10-round bonus told to add 1,400 balls: 1,500 paid, 100 spent winning it. */
const BONUS = { name: "10R", payout: 1500, spent: 100 }

/** A play that counted the balls at a jackpot and again as its bonus ended, with so many in hand then, and played on. */
const countedAt = (afterBonus: number): readonly Checkpoint[] => [
  { spins: 0, outlay: 0, held: 0 },
  { spins: 180, outlay: 10000, held: 0, phase: "regular", event: { kind: "jackpot", bonus: BONUS } },
  { spins: 180, outlay: 10000, held: afterBonus },
  { spins: 380, outlay: 10000, held: afterBonus - 600 },
]

describe("a bonus counted as it ended", () => {
  test("is a jackpot counted as it came, followed at once by a line that only counted the balls again", () => {
    expect(countedPayoutsOf(countedAt(1500))).toEqual([{ line: 2, told: 1400, paid: 1500 }])
  })

  test("is none where the line after spun, bought, drifted or won, or the jackpot was not counted", () => {
    const [seat, jackpot, after, later] = countedAt(1500) as [Checkpoint, Checkpoint, Checkpoint, Checkpoint]
    expect(countedPayoutsOf([seat, jackpot, { ...after, spins: 185 }, later])).toEqual([])
    expect(countedPayoutsOf([seat, jackpot, { ...after, outlay: 11000 }, later])).toEqual([])
    expect(countedPayoutsOf([seat, jackpot, { ...after, support: 30 }, later])).toEqual([])
    expect(countedPayoutsOf([seat, jackpot, { ...after, event: { kind: "jackpot", bonus: BONUS } }, later])).toEqual([])
    const { held: _held, ...uncounted } = jackpot
    expect(countedPayoutsOf([seat, uncounted, after, later])).toEqual([])
  })

  test("leaves the spin performance as it would be had the bonus paid what it was told to, whatever it paid", () => {
    const told = measuredSpinPerformance(countedAt(1400), TERMS)
    expect(measuredSpinPerformance(countedAt(1500), TERMS)).toBeCloseTo(told ?? 0, 10)
    expect(measuredSpinPerformance(countedAt(1300), TERMS)).toBeCloseTo(told ?? 0, 10)
  })

  test("lowers the border by what an over-entry paid beyond what was told, and raises it by what a slack attacker lost", () => {
    const figures = { payoutPerRound: 140, roundChanceOneIn: 32 } as never
    const borderAt = (afterBonus: number): number => playTheoreticalValue(figures, TERMS, consumptionOf(countedAt(afterBonus), TERMS))?.border ?? 0
    expect(payoutRatioOf(countedAt(1540))).toBeCloseTo(1.1, 10)
    expect(borderAt(1540)).toBeCloseTo(borderAt(1400) / 1.1, 10)
    expect(borderAt(1260)).toBeGreaterThan(borderAt(1400))
  })
})
