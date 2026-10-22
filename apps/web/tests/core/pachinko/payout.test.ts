import { describe, expect, test } from "bun:test"

import { measuredSpinPerformance, consumptionOf } from "../../../src/core/pachinko/consumption"
import { countedPayoutsOf, gainOf, payoutRatioOf } from "../../../src/core/pachinko/payout"
import { heldAsToldOf } from "../../../src/core/pachinko/revision"
import { parsePlayLog, appendCheckpoint } from "../../../src/core/play-log/checkpoint"
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
    expect(countedPayoutsOf(countedAt(1500))).toEqual([{ line: 2, told: 1400, said: 1400, paid: 1500 }])
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

describe("a bonus said to have paid beyond its machine's", () => {
  /** A play that never counted at the bonus's end: the hand known before it, the bonus said to pay `over` more, and a count later on. */
  const saidAt = (over: number | undefined, later: number): readonly Checkpoint[] => [
    { spins: 0, outlay: 0, held: 0 },
    { spins: 180, outlay: 10000, held: 0, phase: "regular", event: { kind: "jackpot", bonus: over === undefined ? BONUS : { ...BONUS, over } } },
    { spins: 380, outlay: 10000, held: later },
  ]

  test("adds what was said to what the bonus brings to the hand", () => {
    expect(gainOf({ ...BONUS, over: 40 })).toBe(1440)
    expect(heldAsToldOf(saidAt(40, 900).slice(0, 2))).toBe(1440)
  })

  test("leaves the spin performance as it would be had the bonus paid what was said, and lowers the border by it", () => {
    expect(measuredSpinPerformance(saidAt(40, 880), TERMS)).toBeCloseTo(measuredSpinPerformance(saidAt(undefined, 840), TERMS) ?? 0, 10)
    expect(payoutRatioOf(saidAt(140, 900))).toBeCloseTo(1.1, 10)
    expect(payoutRatioOf(saidAt(undefined, 900))).toBeUndefined()
  })

  test("gives way to what a bonus counted as it ended paid", () => {
    const counted: readonly Checkpoint[] = [...countedAt(1540).slice(0, 1), { ...(countedAt(1540)[1] as Checkpoint), event: { kind: "jackpot", bonus: { ...BONUS, over: 400 } } }, ...countedAt(1540).slice(2)]
    expect(payoutRatioOf(counted)).toBeCloseTo(1.1, 10)
    expect(measuredSpinPerformance(counted, TERMS)).toBeCloseTo(measuredSpinPerformance(countedAt(1400), TERMS) ?? 0, 10)
  })

  test("lowers the border by the usual over-entry until a bonus says, then by what the bonuses said", () => {
    const figures = { payoutPerRound: 140, roundChanceOneIn: 32 } as never
    const before: readonly Checkpoint[] = [{ spins: 0, outlay: 0, held: 0 }, { spins: 100, outlay: 5000 }]
    const told = playTheoreticalValue(figures, TERMS, consumptionOf(before, TERMS))?.border ?? 0
    expect(playTheoreticalValue(figures, TERMS, consumptionOf(before, TERMS), 14)?.border).toBeCloseTo(told / 1.1, 10)
    expect(playTheoreticalValue(figures, TERMS, consumptionOf(saidAt(280, 900 + 280), TERMS), 14)?.border).toBeCloseTo((playTheoreticalValue(figures, TERMS, consumptionOf(saidAt(undefined, 900), TERMS))?.border ?? 0) / 1.2, 10)
  })

  test("is kept in the log as it was said, and a nought or a fraction is refused", () => {
    const line = appendCheckpoint("", { spins: 180, event: { kind: "jackpot", bonus: { ...BONUS, over: -30 } } })
    expect(parsePlayLog(line)).toEqual({ ok: true, value: [{ spins: 180, event: { kind: "jackpot", bonus: { ...BONUS, over: -30 } } }] })
    expect(parsePlayLog(line.replace("-30", "0")).ok).toBe(false)
    expect(parsePlayLog(line.replace("-30", "1.5")).ok).toBe(false)
  })
})
