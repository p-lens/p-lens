import { describe, expect, test } from "bun:test"

import { consumptionOf, handDriftOf, spinPerformanceOf, stretchPerformancesOf } from "../../../src/core/pachinko/consumption"
import { withReadingsMerged } from "../../../src/core/pachinko/merging"
import { checkpointsForReading, type Reading } from "../../../src/core/pachinko/reading"
import { rentalPressOf } from "../../../src/core/pachinko/rental-press"
import { heldAsToldOf, seatOf, takenOf, withReadingInserted, withReadingRemoved, withReadingRevised, withSeatRevised } from "../../../src/core/pachinko/revision"
import type { Checkpoint } from "../../../src/core/play-log/checkpoint"
import { EVERY_JACKPOT } from "../../../src/core/play-log/live"

const TERMS = { rental: { yen: 1000, tokens: 250 }, exchange: { yen: 1000, tokens: 280 }, replay: { paidOut: 125, deducted: 133 } }

/** A log begun with balls in hand, each reading added in turn. */
const playedWith = (held: number, readings: readonly Reading[]): readonly Checkpoint[] =>
  readings.reduce<readonly Checkpoint[]>((log, each) => {
    const added = checkpointsForReading(log, each, false, EVERY_JACKPOT)
    return added.ok ? [...log, ...added.value] : log
  }, [{ ...SAT_DOWN, held }])

const SAT_DOWN: Checkpoint = { spins: 0, outlay: 0, counter: { spins: 120, jackpots: 9 } }

const reading = (fields: Partial<Reading> & Pick<Reading, "counterSpins">): Reading => ({
  phase: "regular",
  rented: 0,
  replayed: 0,
  supported: 0,
  held: undefined,
  jackpot: { type: "none" },
  at: "2026-10-08T12:00:00.000Z",
  ...fields,
})

/** A log with each reading added in turn, as the composer adds them. */
const played = (readings: readonly Reading[]): readonly Checkpoint[] =>
  readings.reduce<readonly Checkpoint[]>((log, each) => {
    const added = checkpointsForReading(log, each, false, EVERY_JACKPOT)
    return added.ok ? [...log, ...added.value] : log
  }, [SAT_DOWN])

const TEN_ROUNDS = { name: "10R確変", payout: 1500, spent: 100 }

describe("a pachinko reading", () => {
  test("adds what was rented, drawn and drifted to the running totals, and counts on from the seat's counter", () => {
    const log = played([reading({ counterSpins: 140, rented: 500 }), reading({ counterSpins: 165, rented: 500, replayed: 125 })])
    expect(log.slice(1)).toMatchObject([
      { spins: 20, outlay: 500, counter: { spins: 140 }, phase: "regular" },
      { spins: 45, outlay: 1000, replay: 125, counter: { spins: 165 }, phase: "regular" },
    ])
    expect(log[1]).not.toHaveProperty("replay")
    expect(log[1]).not.toHaveProperty("event")
  })

  test("that names a bonus is a jackpot, and the counter starts over from it", () => {
    const log = played([
      reading({ counterSpins: 328, rented: 5000, jackpot: { type: "bonus", bonus: TEN_ROUNDS } }),
      reading({ counterSpins: 45, phase: "special", supported: -30, jackpot: { type: "bonus", bonus: TEN_ROUNDS } }),
      reading({ counterSpins: 163, phase: "special", supported: -80 }),
      reading({ counterSpins: 200 }),
    ])
    expect(log.map((line) => line.spins)).toEqual([0, 208, 253, 416, 453])
    expect(log[1]?.event).toEqual({ kind: "jackpot", bonus: TEN_ROUNDS })
    expect(log[3]?.support).toBe(-110)
  })

  test("is refused where the counter shows less than it must, until a jackpot nobody wrote down is admitted", () => {
    const log = played([reading({ counterSpins: 300, rented: 3000 })])
    expect(checkpointsForReading(log, reading({ counterSpins: 30 }), false, EVERY_JACKPOT)).toEqual({ ok: false, error: { type: "counter-went-back", expectedAtLeast: 300 } })
    const admitted = checkpointsForReading(log, reading({ counterSpins: 30 }), true, EVERY_JACKPOT)
    expect(admitted.ok && admitted.value.map((line) => [line.spins, line.event?.kind])).toEqual([
      [180, "jackpot"],
      [210, undefined],
    ])
  })
})

describe("what a play's regular games cost", () => {
  test("is measured from the seat to the last time more was bought: 60 spins for 750 balls is 20 a thousand", () => {
    const found = consumptionOf(played([reading({ counterSpins: 140, rented: 1000 }), reading({ counterSpins: 160, rented: 1000 }), reading({ counterSpins: 180, rented: 1000 }), reading({ counterSpins: 190 })]), TERMS, undefined)
    expect(found).toEqual({ regularSpins: 70, hesoSpins: 0, measured: { spins: 60, balls: 750, rentedBalls: 750, replayedBalls: 0 }, payoutRatio: undefined, supportRatio: undefined })
    expect(found.measured && spinPerformanceOf(found.measured, TERMS)).toBe(20)
  })

  test("starts from the first balls bought where they were written down before any spin", () => {
    const found = consumptionOf(played([reading({ counterSpins: 120, rented: 1000 }), reading({ counterSpins: 140, rented: 1000 })]), TERMS, undefined)
    expect(found.measured).toEqual({ spins: 20, balls: 250, rentedBalls: 250, replayedBalls: 0 })
  })

  test("counts balls drawn from savings with the rented", () => {
    const found = consumptionOf(played([reading({ counterSpins: 130, replayed: 125 }), reading({ counterSpins: 140, replayed: 125 })]), TERMS, undefined)
    expect(found.measured).toEqual({ spins: 20, balls: 250, rentedBalls: 0, replayedBalls: 250 })
  })

  test("is nothing yet while nothing says what was played", () => {
    expect(consumptionOf([SAT_DOWN], TERMS, undefined)).toEqual({ regularSpins: 0, hesoSpins: 0, measured: undefined, payoutRatio: undefined, supportRatio: undefined })
    expect(consumptionOf(played([reading({ counterSpins: 150 })]), TERMS, undefined)).toEqual({ regularSpins: 30, hesoSpins: 0, measured: undefined, payoutRatio: undefined, supportRatio: undefined })
  })

  test("leaves out 確変 and 時短, and counts what a bonus won less what the 電サポ lost as balls played once they are gone", () => {
    const log = played([
      reading({ counterSpins: 320, rented: 10000, jackpot: { type: "bonus", bonus: TEN_ROUNDS } }),
      reading({ counterSpins: 100, phase: "special", supported: -100 }),
      reading({ counterSpins: 200, rented: 1000 }),
    ])
    const found = consumptionOf(log, TERMS, undefined)
    expect(found.regularSpins).toBe(300)
    expect(found.measured).toEqual({ spins: 300, balls: 2750 + 1400 - 100, rentedBalls: 2750, replayedBalls: 0 })
  })

  test("knows no hand at a jackpot where balls were bought, the jackpot having come before they were all played, until it is counted", () => {
    const log = played([reading({ counterSpins: 140, rented: 1000 }), reading({ counterSpins: 160, rented: 1000, jackpot: { type: "bonus", bonus: TEN_ROUNDS } })])
    expect(consumptionOf(log, TERMS, undefined).measured).toEqual({ spins: 20, balls: 250, rentedBalls: 250, replayedBalls: 0 })
    const counted = played([reading({ counterSpins: 140, rented: 1000 }), reading({ counterSpins: 160, rented: 1000, jackpot: { type: "bonus", bonus: TEN_ROUNDS } }), reading({ counterSpins: 0, phase: "rapid", held: 1500 })])
    expect(consumptionOf(counted, TERMS, undefined).measured).toEqual({ spins: 40, balls: 500 + 1400 - 1500, rentedBalls: 500, replayedBalls: 0 })
  })

  test("takes the balls in hand where they were counted, so a play on its own balls is measured before they run out", () => {
    const log = played([reading({ counterSpins: 320, rented: 10000, jackpot: { type: "bonus", bonus: TEN_ROUNDS } }), reading({ counterSpins: 100, held: 900 })])
    expect(consumptionOf(log, TERMS, undefined).measured).toEqual({ spins: 300, balls: 2500 + 1400 - 900, rentedBalls: 2500, replayedBalls: 0 })
  })

  test("measures nothing past a jackpot whose bonus is not told: what it paid is not known", () => {
    const log = played([reading({ counterSpins: 140, rented: 1000 }), reading({ counterSpins: 160, rented: 1000, jackpot: { type: "untold" } }), reading({ counterSpins: 50, rented: 1000 })])
    const found = consumptionOf(log, TERMS, undefined)
    expect(found.regularSpins).toBe(90)
    expect(found.measured).toEqual({ spins: 20, balls: 250, rentedBalls: 250, replayedBalls: 0 })
  })

  test("is never inflated by a long RUSH that lost less than its formula says, its drift not counted: the regular games either side of it are measured at what they cost", () => {
    const rush = Array.from({ length: 10 }, (_, won) => reading({ counterSpins: 10 * (won + 1), phase: "special", jackpot: { type: "bonus", bonus: TEN_ROUNDS } }))
    const log = played([
      reading({ counterSpins: 400, rented: 14_000 }),
      reading({ counterSpins: 420, rented: 1000, jackpot: { type: "bonus", bonus: TEN_ROUNDS } }),
      ...rush,
      reading({ counterSpins: 150, phase: "special", held: 11 * 1400 }),
      reading({ counterSpins: 400, held: 11 * 1400 - 3125 }),
    ])
    const found = consumptionOf(log, TERMS, { supportGain: -500 })
    expect(found.measured).toEqual({ spins: 530, balls: 6625, rentedBalls: 3500, replayedBalls: 0 })
    expect(found.measured && spinPerformanceOf(found.measured, TERMS)).toBe(20)
  })

  test("is measured across a jackpot with no RUSH after it, its 電サポ ended at nought spins with the hand counted", () => {
    const log = played([
      reading({ counterSpins: 400, rented: 14_000 }),
      reading({ counterSpins: 420, rented: 1000, jackpot: { type: "bonus", bonus: TEN_ROUNDS } }),
      reading({ counterSpins: 0, phase: "special", held: 1400 }),
      reading({ counterSpins: 200, rented: 4400 }),
    ])
    const found = consumptionOf(log, TERMS, { supportGain: -500 })
    expect(found.measured).toEqual({ spins: 500, balls: 6250, rentedBalls: 4850, replayedBalls: 0 })
    expect(found.measured && spinPerformanceOf(found.measured, TERMS)).toBe(20)
  })
})

describe("setting a play's readings right", () => {
  const READINGS = [
    reading({ counterSpins: 140, rented: 1000 }),
    reading({ counterSpins: 328, rented: 5000, replayed: 125, jackpot: { type: "bonus", bonus: TEN_ROUNDS } }),
    reading({ counterSpins: 45, phase: "special", supported: -30, driftCounted: true, held: 1200 }),
    reading({ counterSpins: 90 }),
  ]

  test("reads back out of a log the readings it was made of", () => {
    expect(takenOf(played(READINGS))).toEqual(READINGS.map((each) => ({ reading: each, afterMissedJackpot: false })))
  })

  test("keeps a jackpot found missing with the reading it was admitted with", () => {
    const log = played([reading({ counterSpins: 300, rented: 3000 })])
    const admitted = checkpointsForReading(log, reading({ counterSpins: 30, rented: 500 }), true, EVERY_JACKPOT)
    const taken = takenOf([...log, ...(admitted.ok ? admitted.value : [])])
    expect(taken.map((each) => [each.reading.counterSpins, each.reading.rented, each.afterMissedJackpot])).toEqual([
      [300, 3000, false],
      [30, 500, true],
    ])
  })

  test("makes every line after a reading set right again: a bonus told at last, a count mistyped", () => {
    const log = played([reading({ counterSpins: 140, rented: 1000 }), reading({ counterSpins: 328, rented: 5000, jackpot: { type: "untold" } }), reading({ counterSpins: 60, rented: 1000 })])
    const told = withReadingRevised(log, 1, reading({ counterSpins: 328, rented: 5000, jackpot: { type: "bonus", bonus: TEN_ROUNDS } }), EVERY_JACKPOT)
    expect(told.ok && told.value[2]?.event).toEqual({ kind: "jackpot", bonus: TEN_ROUNDS })
    expect(told.ok && told.value.map((line) => line.spins)).toEqual(log.map((line) => line.spins))
    const recounted = withReadingRevised(log, 0, reading({ counterSpins: 150, rented: 2000 }), EVERY_JACKPOT)
    expect(recounted.ok && recounted.value.map((line) => [line.spins, line.outlay])).toEqual([
      [0, 0],
      [30, 2000],
      [208, 7000],
      [268, 8000],
    ])
  })

  test("takes a reading away, and the lines after it follow", () => {
    const removed = withReadingRemoved(played(READINGS), 2, EVERY_JACKPOT)
    expect(removed.ok && removed.value.map((line) => [line.spins, line.support])).toEqual([
      [0, undefined],
      [20, undefined],
      [208, undefined],
      [298, undefined],
    ])
  })

  test("refuses a change that leaves a counter going back, and says where", () => {
    expect(withReadingRemoved(played(READINGS), 1, EVERY_JACKPOT)).toEqual({ ok: false, error: { type: "counter-went-back", index: 1, expectedAtLeast: 140 } })
    expect(withReadingRevised(played(READINGS), 3, reading({ counterSpins: 10 }), EVERY_JACKPOT)).toEqual({ ok: false, error: { type: "counter-went-back", index: 3, expectedAtLeast: 45 } })
  })

  test("puts in a reading that was never written down, before another or after them all", () => {
    const log = played([reading({ counterSpins: 140, rented: 1000 }), reading({ counterSpins: 200, rented: 1000 })])
    const between = withReadingInserted(log, 1, reading({ counterSpins: 170, rented: 500 }), EVERY_JACKPOT)
    expect(between.ok && between.value.map((line) => [line.spins, line.outlay])).toEqual([
      [0, 0],
      [20, 1000],
      [50, 1500],
      [80, 2500],
    ])
    const last = withReadingInserted(log, 2, reading({ counterSpins: 230 }), EVERY_JACKPOT)
    expect(last.ok && last.value.at(-1)?.spins).toBe(110)
    expect(withReadingInserted(log, 1, reading({ counterSpins: 250 }), EVERY_JACKPOT)).toEqual({ ok: false, error: { type: "counter-went-back", index: 2, expectedAtLeast: 250 } })
  })

  test("sets the seat's counter right, and every reading before the first jackpot counts on from it again", () => {
    const log = played([reading({ counterSpins: 140, rented: 1000 }), reading({ counterSpins: 328, jackpot: { type: "bonus", bonus: TEN_ROUNDS } }), reading({ counterSpins: 50, phase: "special" })])
    expect(seatOf(log)).toEqual({ spins: 120, jackpots: 9 })
    const set = withSeatRevised(log, { spins: 100, jackpots: 9 }, EVERY_JACKPOT)
    expect(set.ok && set.value.map((line) => line.spins)).toEqual([0, 40, 228, 278])
    expect(set.ok && set.value[0]?.counter).toEqual({ spins: 100, jackpots: 9 })
    expect(withSeatRevised(log, { spins: 150, jackpots: 9 }, EVERY_JACKPOT)).toEqual({ ok: false, error: { type: "counter-went-back", index: 0, expectedAtLeast: 150 } })
  })
})

describe("the balls in hand at a play's end", () => {
  const won = reading({ counterSpins: 320, rented: 10_000, jackpot: { type: "bonus", bonus: TEN_ROUNDS } })
  const rush = reading({ counterSpins: 45, phase: "special", supported: -30, jackpot: { type: "bonus", bonus: TEN_ROUNDS } })

  test("are what the last count said", () => {
    expect(heldAsToldOf(played([won, rush, reading({ counterSpins: 100, held: 900 })]))).toBe(900)
  })

  test("are the last count with what each bonus since paid, never less what the regular games since are estimated to have cost", () => {
    expect(heldAsToldOf(played([won, rush, reading({ counterSpins: 100 })]))).toBe(1400 + 1400)
    expect(heldAsToldOf(played([reading({ counterSpins: 300, held: 500 }), reading({ counterSpins: 400 })]))).toBe(500)
  })

  test("are none where nothing was ever said of the hand and nothing was won", () => {
    expect(heldAsToldOf(played([reading({ counterSpins: 320, rented: 10_000 })]))).toBeUndefined()
    expect(heldAsToldOf([])).toBeUndefined()
  })
})

describe("how far the hand has been played since it was counted", () => {
  const rateOf = (log: readonly Checkpoint[]): number => ((measured) => (measured === undefined ? Number.NaN : measured.balls / measured.spins))(consumptionOf(log, TERMS, undefined).measured)

  test("is the regular games since the last count, and the hand likely now at the cost measured", () => {
    const log = played([reading({ counterSpins: 160, rented: 2000 }), reading({ counterSpins: 170, held: 120 }), reading({ counterSpins: 190 })])
    expect(handDriftOf(log, TERMS, heldAsToldOf(log))).toEqual({ spins: 20, estimate: Math.max(0, Math.round(120 - 20 * rateOf(log))) })
  })

  test("takes what was bought since in, and is none where the hand was never counted", () => {
    const log = played([reading({ counterSpins: 160, rented: 2000 }), reading({ counterSpins: 170, held: 120 }), reading({ counterSpins: 200, rented: 1000 }), reading({ counterSpins: 210 })])
    expect(handDriftOf(log, TERMS, heldAsToldOf(log))).toEqual({ spins: 40, estimate: Math.max(0, Math.round(120 + 250 - 40 * rateOf(log))) })
    expect(handDriftOf(played([reading({ counterSpins: 140, rented: 1000 })]), TERMS, undefined)).toBeUndefined()
  })

  test("is none where the hand was counted down to nothing and nothing was won since, however long it is played on", () => {
    const log = played([reading({ counterSpins: 160, rented: 2000, jackpot: { type: "bonus", bonus: TEN_ROUNDS } }), reading({ counterSpins: 40, held: 348 }), reading({ counterSpins: 100, held: 0 }), reading({ counterSpins: 151, rented: 1000 })])
    expect(heldAsToldOf(log)).toBe(0)
    expect(handDriftOf(log, TERMS, heldAsToldOf(log))).toBeUndefined()
  })
})

describe("a press of the rental button", () => {
  const at = (yen: number, tokens: number) => rentalPressOf({ ...TERMS, rental: { yen, tokens } })

  test("takes ¥500 where balls are dear and ¥200 at ¥1 a ball or less, tax on the ball or not", () => {
    expect([at(1000, 250), at(1000, 228), at(1000, 500)]).toEqual([500, 500, 500])
    expect([at(1000, 1000), at(1000, 910), at(1000, 2000)]).toEqual([200, 200, 200])
    expect(rentalPressOf(undefined)).toBe(500)
  })
})

describe("a play begun with balls in hand", () => {
  test("is measured from them as the player's own, neither rented nor drawn", () => {
    const log = playedWith(1500, [reading({ counterSpins: 220, held: 250 })])
    expect(consumptionOf(log, TERMS, undefined)).toEqual({ regularSpins: 100, hesoSpins: 0, measured: { spins: 100, balls: 1250, rentedBalls: 0, replayedBalls: 0 }, payoutRatio: undefined, supportRatio: undefined })
    expect(heldAsToldOf(log)).toBe(250)
  })
})

describe("each line's own stretch of a pachinko play", () => {
  /** The rates as figures, an awaited one as such. */
  const shown = (log: readonly Checkpoint[], terms: typeof TERMS): readonly (number | "awaited" | undefined)[] =>
    stretchPerformancesOf(log, terms).map((rate) => (rate === undefined ? undefined : rate.type === "measured" ? rate.rate : rate.type))

  test("is the spin performance from the last point the hand was known at to the line, where the line knows it", () => {
    const log = played([reading({ counterSpins: 230, rented: 5000 }), reading({ counterSpins: 270 }), reading({ counterSpins: 335, rented: 5000 })])
    expect(shown(log, TERMS)).toEqual([undefined, 22, undefined, 21])
  })

  test("is a jackpot's line's from before it to the count after its bonus, what was bought at it not all played, and none until then", () => {
    const before = played([reading({ counterSpins: 220, rented: 5000 }), reading({ counterSpins: 257, rented: 1000, jackpot: { type: "bonus", bonus: TEN_ROUNDS } })])
    expect(shown(before, TERMS)).toEqual([undefined, 20, "awaited"])
    const counted = played([reading({ counterSpins: 220, rented: 5000 }), reading({ counterSpins: 257, rented: 1000, jackpot: { type: "bonus", bonus: TEN_ROUNDS } }), reading({ counterSpins: 0, phase: "rapid", held: 1300 })])
    const rates = shown(counted, TERMS)
    expect([rates[0], rates[1], rates[3]]).toEqual([undefined, 20, undefined])
    expect(rates[2]).toBeCloseTo((37 / (250 + 1400 - 1300)) * 250)
  })

  test("is a folded line's whole run, as if its readings had been read as one, a jackpot's line's too", () => {
    const merged = (log: readonly Checkpoint[], from: number, to: number): readonly Checkpoint[] => ((made) => (made.ok ? made.value : []))(withReadingsMerged(log, { from, to }, EVERY_JACKPOT))
    const log = played([reading({ counterSpins: 220, rented: 5000 }), reading({ counterSpins: 280, rented: 2500 })])
    expect(shown(log, TERMS)).toEqual([undefined, 20, 24])
    expect(shown(merged(log, 0, 1), TERMS)[1]).toBeCloseTo((160 / 1875) * 250)
    const won = played([reading({ counterSpins: 220, rented: 5000 }), reading({ counterSpins: 250, rented: 500 }), reading({ counterSpins: 257, rented: 500, jackpot: { type: "bonus", bonus: TEN_ROUNDS } }), reading({ counterSpins: 0, phase: "rapid", held: 1300 })])
    const unmerged = shown(won, TERMS)
    expect(shown(merged(won, 1, 2), TERMS)[2]).toBeCloseTo((37 / (250 + 1400 - 1300)) * 250)
    expect(unmerged[3]).toBeCloseTo((7 / (125 + 1400 - 1300)) * 250)
  })

  test("is shown on a line played in regular games alone, never on a 時短 line that counted the hand after them", () => {
    const log = played([reading({ counterSpins: 220, rented: 5000 }), reading({ counterSpins: 260 }), reading({ counterSpins: 300, phase: "rapid", held: 200 })])
    expect(shown(log, TERMS)).toEqual([undefined, 20, undefined, undefined])
  })

  test("is none across a jackpot whose bonus the log does not say, a count at it being before what it paid, and runs again between hands known after it", () => {
    const log = played([reading({ counterSpins: 220, rented: 5000 }), reading({ counterSpins: 260, jackpot: { type: "untold" }, held: 1000 }), reading({ counterSpins: 50, rented: 1000, held: 0 }), reading({ counterSpins: 100, rented: 1000 })])
    expect(shown(log, TERMS)).toEqual([undefined, 20, undefined, undefined, 50])
  })

  test("takes a count at a jackpot as the hand when it came, before its bonus paid, so a chain counted along the way is measured", () => {
    const first = { name: "A", payout: 300, spent: 20 }
    const second = { name: "B", payout: 500, spent: 20 }
    const chain = [reading({ counterSpins: 220, rented: 5000 }), reading({ counterSpins: 225, rented: 500, jackpot: { type: "bonus", bonus: first } }), reading({ counterSpins: 0, phase: "special", held: 379, jackpot: { type: "bonus", bonus: second } })]
    expect(shown(played([...chain, reading({ counterSpins: 0, held: 859 })]), TERMS)).toEqual([undefined, 20, (5 / (125 - 99)) * 250, undefined, undefined])
    const on = shown(played([...chain, reading({ counterSpins: 16, held: 744 })]), TERMS)
    expect(on[4]).toBeCloseTo((16 / 115) * 250)
    expect(heldAsToldOf(played([...chain, reading({ counterSpins: 16 })]))).toBe(859)
  })
})

describe("a 電サポ whose drift was not counted", () => {
  const measuredOf = (log: readonly Checkpoint[]) => consumptionOf(log, TERMS, { supportGain: -500 }).measured
  const shown = (log: readonly Checkpoint[]): readonly (number | "awaited" | undefined)[] =>
    stretchPerformancesOf(log, TERMS).map((rate) => (rate === undefined ? undefined : rate.type === "measured" ? rate.rate : rate.type))

  test("is kept out of the spin performance when its readings are folded into one line, as when they are not", () => {
    const log = played([
      reading({ counterSpins: 520, rented: 20_000, held: 0, jackpot: { type: "bonus", bonus: TEN_ROUNDS } }),
      reading({ counterSpins: 10, phase: "special", jackpot: { type: "bonus", bonus: TEN_ROUNDS } }),
      reading({ counterSpins: 50, phase: "special", held: 2000 }),
      reading({ counterSpins: 100, phase: "special", held: 2500 }),
      reading({ counterSpins: 180, held: 1500 }),
    ])
    const folded = ((made) => (made.ok ? made.value : []))(withReadingsMerged(log, { from: 2, to: 3 }, EVERY_JACKPOT))
    expect(measuredOf(log)).toEqual({ spins: 480, balls: 6000, rentedBalls: 5000, replayedBalls: 0 })
    expect(measuredOf(folded)).toEqual(measuredOf(log))
  })

  test("is its own run's: one counted says nothing of another left empty, whatever total was carried past it", () => {
    const log = played([
      reading({ counterSpins: 520, rented: 20_000, held: 0, jackpot: { type: "bonus", bonus: TEN_ROUNDS } }),
      reading({ counterSpins: 100, phase: "special", supported: -100, driftCounted: true, held: 1300 }),
      reading({ counterSpins: 300, rented: 4800, held: 0, jackpot: { type: "bonus", bonus: TEN_ROUNDS } }),
      reading({ counterSpins: 20, phase: "special", jackpot: { type: "bonus", bonus: TEN_ROUNDS } }),
      reading({ counterSpins: 100, phase: "special", held: 2200 }),
      reading({ counterSpins: 180, held: 1200 }),
    ])
    expect(measuredOf(log)).toEqual({ spins: 680, balls: 8500, rentedBalls: 6200, replayedBalls: 0 })
  })

  test("is told from one counted as none by the line's mark, though the total carried past an earlier run stays where it was", () => {
    const log = played([
      reading({ counterSpins: 520, rented: 20_000, held: 0, jackpot: { type: "bonus", bonus: TEN_ROUNDS } }),
      reading({ counterSpins: 100, phase: "special", supported: -100, driftCounted: true, held: 1300 }),
      reading({ counterSpins: 300, rented: 4800, jackpot: { type: "bonus", bonus: TEN_ROUNDS } }),
      reading({ counterSpins: 20, phase: "special", jackpot: { type: "bonus", bonus: TEN_ROUNDS } }),
      reading({ counterSpins: 100, phase: "special", supported: 0, driftCounted: true, held: 2800 }),
      reading({ counterSpins: 180, held: 1800 }),
    ])
    expect(log.at(-2)?.support).toBe(-100)
    expect(measuredOf(log)).toEqual({ spins: 680, balls: 8500, rentedBalls: 6200, replayedBalls: 0 })
  })

  test("stays counted when readings whose drift nets to none are folded into one line", () => {
    const log = played([
      reading({ counterSpins: 520, rented: 20_000, jackpot: { type: "bonus", bonus: TEN_ROUNDS } }),
      reading({ counterSpins: 10, phase: "special", jackpot: { type: "bonus", bonus: TEN_ROUNDS } }),
      reading({ counterSpins: 50, phase: "special", supported: 30, driftCounted: true }),
      reading({ counterSpins: 100, phase: "special", supported: -30, driftCounted: true, held: 2800 }),
      reading({ counterSpins: 180, held: 1800 }),
    ])
    const folded = ((made) => (made.ok ? made.value : []))(withReadingsMerged(log, { from: 2, to: 3 }, EVERY_JACKPOT))
    expect(measuredOf(log)).toEqual({ spins: 480, balls: 6000, rentedBalls: 5000, replayedBalls: 0 })
    expect(measuredOf(folded)).toEqual(measuredOf(log))
  })

  test("lets a hand counted straight after the bonus close the jackpot's stretch, folded into the 確変 line or not", () => {
    const log = played([
      reading({ counterSpins: 520, rented: 20_000, jackpot: { type: "bonus", bonus: TEN_ROUNDS } }),
      reading({ counterSpins: 0, phase: "special", held: 1500 }),
      reading({ counterSpins: 100, phase: "special" }),
      reading({ counterSpins: 300, held: 1000 }),
    ])
    const folded = ((made) => (made.ok ? made.value : []))(withReadingsMerged(log, { from: 1, to: 2 }, EVERY_JACKPOT))
    expect(shown(log)[1]).toBeCloseTo((400 / (5000 + 1400 - 1500)) * 250)
    expect(shown(folded)[1]).toEqual(shown(log)[1])
  })

  test("takes heso spins after a jackpot whose 電サポ was left uncounted, whatever another run said", () => {
    const EIGHT_ROUNDS = { name: "8R", payout: 1200, spent: 80 }
    const log = played([
      reading({ counterSpins: 520, rented: 20_000, jackpot: { type: "bonus", bonus: EIGHT_ROUNDS } }),
      reading({ counterSpins: 20, phase: "rapid", supported: -250, driftCounted: true }),
      reading({ counterSpins: 220, rented: 10_000, jackpot: { type: "bonus", bonus: EIGHT_ROUNDS } }),
      reading({ counterSpins: 20, phase: "rapid" }),
    ])
    expect(consumptionOf(log, TERMS, { paidSpins: 20 }).hesoSpins).toBe(20)
  })

  test("settles a jackpot's awaited stretch to none as it begins, and one counted closes it after the bonus", () => {
    const before = [reading({ counterSpins: 220, rented: 5000 }), reading({ counterSpins: 257, rented: 1000, jackpot: { type: "bonus", bonus: TEN_ROUNDS } })]
    expect(shown(played([...before, reading({ counterSpins: 30, phase: "rapid" })]))).toEqual([undefined, 20, undefined, undefined])
    const counted = shown(played([...before, reading({ counterSpins: 30, phase: "rapid", supported: 0, driftCounted: true, held: 1300 })]))
    expect(counted[2]).toBeCloseTo((37 / (250 + 1400 - 1300)) * 250)
  })
})
