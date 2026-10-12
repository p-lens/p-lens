import { describe, expect, test } from "bun:test"

import { consumptionOf, heldAtEndOf, spinPerformanceOf } from "../../../src/core/pachinko/consumption"
import { checkpointsForReading, type Reading } from "../../../src/core/pachinko/reading"
import { rentalPressOf } from "../../../src/core/pachinko/rental-press"
import { seatOf, takenOf, withReadingInserted, withReadingRemoved, withReadingRevised, withSeatRevised } from "../../../src/core/pachinko/revision"
import type { Checkpoint } from "../../../src/core/play-log/checkpoint"

const TERMS = { rental: { yen: 1000, tokens: 250 }, exchange: { yen: 1000, tokens: 280 }, replay: { paidOut: 125, deducted: 133 } }

/** A log begun with balls in hand, each reading added in turn. */
const playedWith = (held: number, readings: readonly Reading[]): readonly Checkpoint[] =>
  readings.reduce<readonly Checkpoint[]>((log, each) => {
    const added = checkpointsForReading(log, each, false)
    return added.ok ? [...log, ...added.value] : log
  }, [{ ...SAT_DOWN, held }])

const SAT_DOWN: Checkpoint = { spins: 0, outlay: 0, counter: { spins: 120, total: 2400, jackpots: 9 } }

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
    const added = checkpointsForReading(log, each, false)
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
    expect(checkpointsForReading(log, reading({ counterSpins: 30 }), false)).toEqual({ ok: false, error: { type: "counter-went-back", expectedAtLeast: 300 } })
    const admitted = checkpointsForReading(log, reading({ counterSpins: 30 }), true)
    expect(admitted.ok && admitted.value.map((line) => [line.spins, line.event?.kind])).toEqual([
      [180, "jackpot"],
      [210, undefined],
    ])
  })
})

describe("what a play's regular games cost", () => {
  test("is measured from the seat to the last time more was bought: 60 spins for 750 balls is 20 a thousand", () => {
    const found = consumptionOf(played([reading({ counterSpins: 140, rented: 1000 }), reading({ counterSpins: 160, rented: 1000 }), reading({ counterSpins: 180, rented: 1000 }), reading({ counterSpins: 190 })]), TERMS)
    expect(found).toEqual({ regularSpins: 70, measured: { spins: 60, balls: 750, rentedBalls: 750, replayedBalls: 0 } })
    expect(found.measured && spinPerformanceOf(found.measured, TERMS)).toBe(20)
  })

  test("starts from the first balls bought where they were written down before any spin", () => {
    const found = consumptionOf(played([reading({ counterSpins: 120, rented: 1000 }), reading({ counterSpins: 140, rented: 1000 })]), TERMS)
    expect(found.measured).toEqual({ spins: 20, balls: 250, rentedBalls: 250, replayedBalls: 0 })
  })

  test("counts balls drawn from savings with the rented", () => {
    const found = consumptionOf(played([reading({ counterSpins: 130, replayed: 125 }), reading({ counterSpins: 140, replayed: 125 })]), TERMS)
    expect(found.measured).toEqual({ spins: 20, balls: 250, rentedBalls: 0, replayedBalls: 250 })
  })

  test("is nothing yet while nothing says what was played", () => {
    expect(consumptionOf([SAT_DOWN], TERMS)).toEqual({ regularSpins: 0, measured: undefined })
    expect(consumptionOf(played([reading({ counterSpins: 150 })]), TERMS)).toEqual({ regularSpins: 30, measured: undefined })
  })

  test("leaves out 確変 and 時短, and counts what a bonus won less what the 電サポ lost as balls played once they are gone", () => {
    const log = played([
      reading({ counterSpins: 320, rented: 10000, jackpot: { type: "bonus", bonus: TEN_ROUNDS } }),
      reading({ counterSpins: 100, phase: "special", supported: -100 }),
      reading({ counterSpins: 200, rented: 1000 }),
    ])
    const found = consumptionOf(log, TERMS)
    expect(found.regularSpins).toBe(300)
    expect(found.measured).toEqual({ spins: 300, balls: 2750 + 1400 - 100, rentedBalls: 2750, replayedBalls: 0 })
  })

  test("keeps what a bonus won in hand where the last balls bought brought it", () => {
    const log = played([reading({ counterSpins: 140, rented: 1000 }), reading({ counterSpins: 160, rented: 1000, jackpot: { type: "bonus", bonus: TEN_ROUNDS } })])
    expect(consumptionOf(log, TERMS).measured).toEqual({ spins: 40, balls: 500, rentedBalls: 500, replayedBalls: 0 })
  })

  test("takes the balls in hand where they were counted, so a play on its own balls is measured before they run out", () => {
    const log = played([reading({ counterSpins: 320, rented: 10000, jackpot: { type: "bonus", bonus: TEN_ROUNDS } }), reading({ counterSpins: 100, held: 900 })])
    expect(consumptionOf(log, TERMS).measured).toEqual({ spins: 300, balls: 2500 + 1400 - 900, rentedBalls: 2500, replayedBalls: 0 })
  })

  test("measures nothing past a jackpot whose bonus is not told: what it paid is not known", () => {
    const log = played([reading({ counterSpins: 140, rented: 1000 }), reading({ counterSpins: 160, rented: 1000, jackpot: { type: "untold" } }), reading({ counterSpins: 50, rented: 1000 })])
    const found = consumptionOf(log, TERMS)
    expect(found.regularSpins).toBe(90)
    expect(found.measured).toEqual({ spins: 20, balls: 250, rentedBalls: 250, replayedBalls: 0 })
  })
})

describe("setting a play's readings right", () => {
  const READINGS = [
    reading({ counterSpins: 140, rented: 1000 }),
    reading({ counterSpins: 328, rented: 5000, replayed: 125, jackpot: { type: "bonus", bonus: TEN_ROUNDS } }),
    reading({ counterSpins: 45, phase: "special", supported: -30, held: 1200 }),
    reading({ counterSpins: 90 }),
  ]

  test("reads back out of a log the readings it was made of", () => {
    expect(takenOf(played(READINGS))).toEqual(READINGS.map((each) => ({ reading: each, afterMissedJackpot: false })))
  })

  test("keeps a jackpot found missing with the reading it was admitted with", () => {
    const log = played([reading({ counterSpins: 300, rented: 3000 })])
    const admitted = checkpointsForReading(log, reading({ counterSpins: 30, rented: 500 }), true)
    const taken = takenOf([...log, ...(admitted.ok ? admitted.value : [])])
    expect(taken.map((each) => [each.reading.counterSpins, each.reading.rented, each.afterMissedJackpot])).toEqual([
      [300, 3000, false],
      [30, 500, true],
    ])
  })

  test("makes every line after a reading set right again: a bonus told at last, a count mistyped", () => {
    const log = played([reading({ counterSpins: 140, rented: 1000 }), reading({ counterSpins: 328, rented: 5000, jackpot: { type: "untold" } }), reading({ counterSpins: 60, rented: 1000 })])
    const told = withReadingRevised(log, 1, reading({ counterSpins: 328, rented: 5000, jackpot: { type: "bonus", bonus: TEN_ROUNDS } }))
    expect(told.ok && told.value[2]?.event).toEqual({ kind: "jackpot", bonus: TEN_ROUNDS })
    expect(told.ok && told.value.map((line) => line.spins)).toEqual(log.map((line) => line.spins))
    const recounted = withReadingRevised(log, 0, reading({ counterSpins: 150, rented: 2000 }))
    expect(recounted.ok && recounted.value.map((line) => [line.spins, line.outlay])).toEqual([
      [0, 0],
      [30, 2000],
      [208, 7000],
      [268, 8000],
    ])
  })

  test("takes a reading away, and the lines after it follow", () => {
    const removed = withReadingRemoved(played(READINGS), 2)
    expect(removed.ok && removed.value.map((line) => [line.spins, line.support])).toEqual([
      [0, undefined],
      [20, undefined],
      [208, undefined],
      [298, undefined],
    ])
  })

  test("refuses a change that leaves a counter going back, and says where", () => {
    expect(withReadingRemoved(played(READINGS), 1)).toEqual({ ok: false, error: { type: "counter-went-back", index: 1, expectedAtLeast: 140 } })
    expect(withReadingRevised(played(READINGS), 3, reading({ counterSpins: 10 }))).toEqual({ ok: false, error: { type: "counter-went-back", index: 3, expectedAtLeast: 45 } })
  })

  test("puts in a reading that was never written down, before another or after them all", () => {
    const log = played([reading({ counterSpins: 140, rented: 1000 }), reading({ counterSpins: 200, rented: 1000 })])
    const between = withReadingInserted(log, 1, reading({ counterSpins: 170, rented: 500 }))
    expect(between.ok && between.value.map((line) => [line.spins, line.outlay])).toEqual([
      [0, 0],
      [20, 1000],
      [50, 1500],
      [80, 2500],
    ])
    const last = withReadingInserted(log, 2, reading({ counterSpins: 230 }))
    expect(last.ok && last.value.at(-1)?.spins).toBe(110)
    expect(withReadingInserted(log, 1, reading({ counterSpins: 250 }))).toEqual({ ok: false, error: { type: "counter-went-back", index: 2, expectedAtLeast: 250 } })
  })

  test("sets the seat's counter right, and every reading before the first jackpot counts on from it again", () => {
    const log = played([reading({ counterSpins: 140, rented: 1000 }), reading({ counterSpins: 328, jackpot: { type: "bonus", bonus: TEN_ROUNDS } }), reading({ counterSpins: 50, phase: "special" })])
    expect(seatOf(log)).toEqual({ spins: 120, total: 2400, jackpots: 9 })
    const set = withSeatRevised(log, { spins: 100, total: 2380, jackpots: 9 })
    expect(set.ok && set.value.map((line) => line.spins)).toEqual([0, 40, 228, 278])
    expect(set.ok && set.value[0]?.counter).toEqual({ spins: 100, total: 2380, jackpots: 9 })
    expect(withSeatRevised(log, { spins: 150, total: 2400, jackpots: 9 })).toEqual({ ok: false, error: { type: "counter-went-back", index: 0, expectedAtLeast: 150 } })
  })
})

describe("the balls in hand at a play's last line", () => {
  const won = reading({ counterSpins: 320, rented: 10_000, jackpot: { type: "bonus", bonus: TEN_ROUNDS } })
  const rush = reading({ counterSpins: 45, phase: "special", supported: -30, jackpot: { type: "bonus", bonus: TEN_ROUNDS } })

  test("are what that line counted", () => {
    expect(heldAtEndOf(played([won, rush, reading({ counterSpins: 100, held: 900 })]), TERMS)).toBe(900)
  })

  test("are followed on from the last line that knew: what the bonuses and the 電サポ brought since, less the regular games at their measured cost", () => {
    expect(heldAtEndOf(played([won, rush, reading({ counterSpins: 100 })]), TERMS)).toBe(1400 + 1400 - 30 - 100 * 12.5)
  })

  test("are none where more had to be bought at the end, and never below none", () => {
    expect(heldAtEndOf(played([reading({ counterSpins: 320, rented: 10_000 })]), TERMS)).toBe(0)
    expect(heldAtEndOf(played([won, reading({ counterSpins: 400 })]), TERMS)).toBe(0)
  })

  test("are not told past a jackpot whose bonus the log does not say, or before anything was measured", () => {
    expect(heldAtEndOf(played([won, reading({ counterSpins: 45, phase: "special", jackpot: { type: "untold" } }), reading({ counterSpins: 100 })]), TERMS)).toBeUndefined()
    expect(heldAtEndOf(played([reading({ counterSpins: 200 })]), TERMS)).toBeUndefined()
    expect(heldAtEndOf([], TERMS)).toBeUndefined()
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
    expect(consumptionOf(log, TERMS)).toEqual({ regularSpins: 100, measured: { spins: 100, balls: 1250, rentedBalls: 0, replayedBalls: 0 } })
    expect(heldAtEndOf(log, TERMS)).toBe(250)
  })
})
