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

/** A log with each reading added in turn, as the composer adds them. */
const logged = (readings: readonly Reading[]): readonly Checkpoint[] =>
  readings.reduce<readonly Checkpoint[]>((log, each) => {
    const added = checkpointsForReading(log, each, false)
    return added.ok ? [...log, ...added.value] : log
  }, [SAT_DOWN])

/** Three jackpots won on the 電サポ after the one won in regular games. */
const RUSH = [10, 20, 30].map((counterSpins) => reading({ counterSpins, phase: "special", jackpot: { type: "bonus", bonus: TEN_ROUNDS } }))

/**
 * Regular games at 20 a thousand all through: 400 spins to a jackpot, the
 * RUSH, the 電サポ ended at 100 spins, and 200 regular spins to a count, the counter running on from the 電サポ.
 * What the jackpot's line and the 電サポ's end said is as given.
 */
const played = (atJackpot: Partial<Reading>, atEnd: Partial<Reading>, held: number): readonly Checkpoint[] =>
  logged([
    reading({ counterSpins: 400, rented: 20_000, jackpot: { type: "bonus", bonus: TEN_ROUNDS }, ...atJackpot }),
    ...RUSH,
    reading({ counterSpins: 100, phase: "special", ...atEnd }),
    reading({ counterSpins: 300, held }),
  ])

const WON_ON_SUPPORT = 3 * 1400

const LOST = WON_ON_SUPPORT * 0.05

/** The hand counted as the jackpot came, before its bonus paid: ¥21,000 bought and 400 spins played at 20 a thousand. */
const COUNTED_AT_JACKPOT = { rented: 21_000, held: 250 }

/** The hand as the 電サポ ended, counted at the jackpot, with nothing lost on the 電サポ. */
const WHOLE = 250 + 4 * 1400

/** What 200 regular spins at 20 a thousand cost. */
const AFTER = 2500

const performanceOf = (log: readonly Checkpoint[], supportGain: number | undefined): number | undefined => {
  const measured = consumptionOf(log, TERMS, supportGain === undefined ? undefined : { supportGain }).measured
  return measured === undefined ? undefined : spinPerformanceOf(measured, TERMS)
}

const worth = (log: readonly Checkpoint[], supportGain: number | undefined) => {
  const consumption = consumptionOf(log, TERMS, supportGain === undefined ? undefined : { supportGain })
  const measured = consumption.measured
  return { spinPerformance: measured === undefined ? undefined : spinPerformanceOf(measured, TERMS), value: playTheoreticalValue(LOSING, TERMS, consumption) }
}

describe("the 電サポ's drift left unsaid, on a machine whose formula says it loses 5%", () => {
  const lost = played(COUNTED_AT_JACKPOT, { held: WHOLE - LOST }, WHOLE - LOST - AFTER)
  const none = played(COUNTED_AT_JACKPOT, { held: WHOLE }, WHOLE - AFTER)

  test("never moves the spin performance: the regular games either side of the RUSH are measured, and the RUSH is not", () => {
    expect(consumptionOf(lost, TERMS, { supportGain: -500 }).measured).toEqual({ spins: 600, balls: 7500, rentedBalls: 5250, replayedBalls: 0 })
    expect(consumptionOf(none, TERMS, { supportGain: -500 }).measured).toEqual({ spins: 600, balls: 7500, rentedBalls: 5250, replayedBalls: 0 })
    expect(performanceOf(lost, -500)).toBe(20)
    expect(performanceOf(none, -500)).toBe(20)
  })

  test("comes to the same spin performance whatever the formula's 電サポ中の出玉増減, or with no formula", () => {
    expect(performanceOf(none, 0)).toBe(performanceOf(none, -500) ?? 0)
    expect(performanceOf(none, undefined)).toBe(performanceOf(none, -500) ?? 0)
    expect(performanceOf(lost, 0)).toBe(performanceOf(lost, -500) ?? 0)
  })

  test("measures up to the last rental before the jackpot where the hand was not counted at it, and again from the 電サポ's end", () => {
    const rented = logged([
      reading({ counterSpins: 380, rented: 19_000 }),
      reading({ counterSpins: 400, rented: 1000, jackpot: { type: "bonus", bonus: TEN_ROUNDS } }),
      ...RUSH,
      reading({ counterSpins: 100, phase: "special", held: 4 * 1400 }),
      reading({ counterSpins: 300, held: 4 * 1400 - AFTER }),
    ])
    expect(consumptionOf(rented, TERMS, { supportGain: -500 }).measured).toEqual({ spins: 580, balls: 7250, rentedBalls: 4750, replayedBalls: 0 })
  })

  test("measures nothing across the RUSH where the hand is known on neither side of it but at the count after it", () => {
    expect(consumptionOf(played({}, {}, 2890), TERMS, { supportGain: -500 }).measured).toBeUndefined()
    expect(consumptionOf(played({}, { held: 4 * 1400 }, 4 * 1400 - AFTER), TERMS, { supportGain: -500 }).measured).toEqual({ spins: 200, balls: AFTER, rentedBalls: 0, replayedBalls: 0 })
  })
})

describe("the 電サポ's drift counted", () => {
  test("follows the hand across the RUSH, so the regular games are measured over it", () => {
    const counted = played({}, { supported: -LOST, driftCounted: true }, 5000 + WON_ON_SUPPORT + 1400 - LOST - 7500)
    expect(consumptionOf(counted, TERMS, { supportGain: -500 }).measured).toEqual({ spins: 600, balls: 7500, rentedBalls: 5000, replayedBalls: 0 })
    expect(performanceOf(counted, 0)).toBe(20)
  })

  test("is written down when said to be none, so that a play counted as losing nothing is told from one not counted", () => {
    expect(played({}, { supported: 0, driftCounted: true }, 0).some((checkpoint) => checkpoint.support === 0)).toBe(true)
    expect(played({}, {}, 0).some((checkpoint) => checkpoint.support !== undefined)).toBe(false)
  })
})

describe("the border and theoretical value of a play on a machine whose formula says its 電サポ loses 5%", () => {
  const unsaid = worth(played(COUNTED_AT_JACKPOT, { held: WHOLE - LOST }, WHOLE - LOST - AFTER), -500)
  const saidAsLooked = worth(played(COUNTED_AT_JACKPOT, { supported: -LOST, driftCounted: true, held: WHOLE - LOST }, WHOLE - LOST - AFTER), -500)
  const saidNone = worth(played(COUNTED_AT_JACKPOT, { supported: 0, driftCounted: true, held: WHOLE }, WHOLE - AFTER), -500)

  test("measure the same regular games whether the drift is said or not", () => {
    expect(unsaid.spinPerformance).toBe(20)
    expect(saidAsLooked.spinPerformance).toBe(20)
    expect(saidNone.spinPerformance).toBe(20)
  })

  test("left unsaid, or said as the formula looks for, come to the formula's own border and theoretical value", () => {
    expect(saidAsLooked.value?.border).toBeCloseTo(unsaid.value?.border ?? 0, 9)
    expect(saidAsLooked.value?.yenPerSpin).toBeCloseTo(unsaid.value?.yenPerSpin ?? 0, 9)
    expect(saidAsLooked.value?.theoreticalValue).toBeCloseTo(unsaid.value?.theoreticalValue ?? 0, 6)
  })

  test("said to be none, lower the border and raise the theoretical value, as a 電サポ that lost nothing pays more", () => {
    expect(saidNone.value?.border ?? 0).toBeLessThan(unsaid.value?.border ?? 0)
    expect(saidNone.value?.yenPerSpin ?? 0).toBeGreaterThan(unsaid.value?.yenPerSpin ?? 0)
    expect(saidNone.value?.border).toBeCloseTo((unsaid.value?.border ?? 0) * ((4 * 1400 - LOST) / (4 * 1400)), 9)
  })
})

describe("a CZ played at the heso after a bonus, written as a 時短", () => {
  const EIGHT_ROUNDS = { name: "8R", payout: 1200, spent: 80 }
  const FAIR: Figures = { roundChanceOneIn: 30, payoutPerRound: 140, totalChanceOneIn: undefined, spinsPerHour: undefined }
  /** At 20 a thousand all through: 400 regular spins to a bonus with the hand counted as it came, twenty spins of a CZ written as the person chose, 200 regular spins with ¥7,000 bought, and the hand counted. */
  const played = (cz: "special" | "regular", drift: Partial<Reading>): readonly Checkpoint[] =>
    logged([
      reading({ counterSpins: 400, rented: 21_000, held: 250, jackpot: { type: "bonus", bonus: EIGHT_ROUNDS } }),
      reading({ counterSpins: 20, phase: cz, ...drift }),
      reading({ counterSpins: 220, rented: 7000, held: 250 + 1120 + 1750 - 2750 }),
    ])
  const asTime = consumptionOf(played("special", {}), TERMS, { paidSpins: 20 })
  const asRegular = consumptionOf(played("regular", {}), TERMS, undefined)

  test("pays for twenty spins at the heso in the theoretical value", () => {
    const unpaid = consumptionOf(played("special", {}), TERMS, undefined)
    expect(asTime.hesoSpins).toBe(20)
    expect(unpaid.hesoSpins).toBe(0)
    expect(playTheoreticalValue(FAIR, TERMS, asTime)?.theoreticalValue).toBeCloseTo((playTheoreticalValue(FAIR, TERMS, unpaid)?.theoreticalValue ?? 0) * (620 / 600), 6)
  })

  test("never measures them, nor the regular games across the CZ, where the drift is not counted", () => {
    expect(asTime.measured).toEqual({ spins: 400, balls: 5000, rentedBalls: 5250, replayedBalls: 0 })
    expect(consumptionOf(played("special", {}), TERMS, undefined).measured).toEqual(asTime.measured)
    expect(asRegular.measured).toEqual({ spins: 620, balls: 7750, rentedBalls: 7000, replayedBalls: 0 })
  })

  test("keeps them out of the regular games the screen counts", () => {
    expect(asTime.regularSpins).toBe(600)
    expect(asRegular.regularSpins).toBe(620)
  })

  test("takes none where the person counted the 電サポ's drift, the CZ's balls being in it, and measures across it", () => {
    const counted = consumptionOf(played("special", { supported: -250, driftCounted: true }), TERMS, { paidSpins: 20 })
    expect(counted.hesoSpins).toBe(0)
    expect(counted.measured).toEqual({ spins: 600, balls: 7500, rentedBalls: 7000, replayedBalls: 0 })
  })
})
