import { describe, expect, test } from "bun:test"

import { consumptionOf, spinPerformanceOf } from "../../../src/core/pachinko/consumption"
import type { Figures } from "../../../src/core/pachinko/figures"
import { checkpointsForReading, type Reading } from "../../../src/core/pachinko/reading"
import { playTheoreticalValue } from "../../../src/core/pachinko/theoretical-value"
import type { Checkpoint } from "../../../src/core/play-log/checkpoint"

const TERMS = { rental: { yen: 1000, tokens: 250 }, exchange: { yen: 1000, tokens: 280 }, replay: { paidOut: 125, deducted: 133 } }

const SAT_DOWN: Checkpoint = { spins: 0, outlay: 0, counter: { spins: 0, jackpots: 0 } }

const TEN_ROUNDS = { name: "10R", payout: 1500, spent: 100 }

/** A formula of a machine whose 電サポ loses 5%: what its engine solved, the loss in its round already. */
const LOSING: Figures = { roundChanceOneIn: 12, payoutPerRound: 133, totalChanceOneIn: undefined, spinsPerHour: undefined }

const reading = (fields: Partial<Reading> & Pick<Reading, "counterSpins">): Reading => ({
  phase: "regular",
  rented: 0,
  replayed: 0,
  supported: 0,
  held: undefined,
  jackpot: { type: "none" },
  at: "2026-10-26T12:00:00.000Z",
  ...fields,
})

/** 400 regular spins on ¥20,000 to a jackpot, three more on the 電サポ, back to 200 regular spins, and the hand counted: the 電サポ's drift as said, if it was. */
const played = (held: number, drift: Partial<Reading>): readonly Checkpoint[] =>
  [
    reading({ counterSpins: 400, rented: 20_000, jackpot: { type: "bonus", bonus: TEN_ROUNDS } }),
    reading({ counterSpins: 10, phase: "special", jackpot: { type: "bonus", bonus: TEN_ROUNDS } }),
    reading({ counterSpins: 20, phase: "special", jackpot: { type: "bonus", bonus: TEN_ROUNDS } }),
    reading({ counterSpins: 30, phase: "special", jackpot: { type: "bonus", bonus: TEN_ROUNDS } }),
    reading({ counterSpins: 100, phase: "special", ...drift }),
    reading({ counterSpins: 200, held }),
  ].reduce<readonly Checkpoint[]>((log, each) => {
    const added = checkpointsForReading(log, each, false)
    return added.ok ? [...log, ...added.value] : log
  }, [SAT_DOWN])

const WON_ON_SUPPORT = 3 * 1400

const LOST = WON_ON_SUPPORT * 0.05

/** The hand as it would have been with nothing lost on the 電サポ. */
const WHOLE = 4 * 1400 + 5000 - 600 * 12.5

const worth = (log: readonly Checkpoint[], supportGain: number | undefined) => {
  const consumption = consumptionOf(log, TERMS, supportGain)
  const measured = consumption.measured
  return { spinPerformance: measured === undefined ? undefined : spinPerformanceOf(measured, TERMS), value: playTheoreticalValue(LOSING, TERMS, consumption) }
}

describe("the 電サポ's drift, on a machine whose formula says it loses 5%", () => {
  const unsaid = worth(played(WHOLE - LOST, {}), -500)
  const saidAsLooked = worth(played(WHOLE - LOST, { supported: -LOST, driftCounted: true }), -500)
  const saidNone = worth(played(WHOLE, { supported: 0, driftCounted: true }), -500)
  const nothingLost = worth(played(WHOLE, {}), undefined)

  test("never moves the spin performance: a hand counted after the 電サポ lost balls measures as one that lost none", () => {
    expect(unsaid.spinPerformance).toBeCloseTo(nothingLost.spinPerformance ?? 0, 9)
    expect(saidAsLooked.spinPerformance).toBeCloseTo(nothingLost.spinPerformance ?? 0, 9)
    expect(saidNone.spinPerformance).toBeCloseTo(nothingLost.spinPerformance ?? 0, 9)
  })

  test("left unsaid, or said as the formula looks for, comes to the formula's own border and theoretical value", () => {
    expect(saidAsLooked.value?.border).toBeCloseTo(unsaid.value?.border ?? 0, 9)
    expect(saidAsLooked.value?.yenPerSpin).toBeCloseTo(unsaid.value?.yenPerSpin ?? 0, 9)
    expect(saidAsLooked.value?.theoreticalValue).toBeCloseTo(unsaid.value?.theoreticalValue ?? 0, 6)
  })

  test("said to be none lowers the border and raises the theoretical value, as a 電サポ that lost nothing pays more", () => {
    expect(saidNone.value?.border ?? 0).toBeLessThan(unsaid.value?.border ?? 0)
    expect(saidNone.value?.yenPerSpin ?? 0).toBeGreaterThan(unsaid.value?.yenPerSpin ?? 0)
    expect(saidNone.value?.border).toBeCloseTo((unsaid.value?.border ?? 0) * ((4 * 1400 - LOST) / (4 * 1400)), 9)
  })

  test("is written down when said to be none, so that a play counted as losing nothing is told from one not counted", () => {
    expect(played(WHOLE, { supported: 0, driftCounted: true }).some((checkpoint) => checkpoint.support === 0)).toBe(true)
    expect(played(WHOLE, {}).some((checkpoint) => checkpoint.support !== undefined)).toBe(false)
  })
})
