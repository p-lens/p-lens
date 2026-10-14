import { describe, expect, test } from "bun:test"

import { consumptionOf, heldAtFinishOf } from "../../../src/core/pachinko/consumption"
import { mergeableSpan, withReadingsMerged } from "../../../src/core/pachinko/merging"
import { checkpointsForReading, type Reading } from "../../../src/core/pachinko/reading"
import { takenOf } from "../../../src/core/pachinko/revision"
import type { Checkpoint, Phase } from "../../../src/core/play-log/checkpoint"
import { liveSummary } from "../../../src/core/play-log/live"

const TERMS = { rental: { yen: 1000, tokens: 250 }, exchange: { yen: 1000, tokens: 280 }, replay: { paidOut: 125, deducted: 133 } }

const SAT_DOWN: Checkpoint = { spins: 0, outlay: 0, counter: { spins: 120, total: 2400, jackpots: 9 } }

const TEN_ROUNDS = { name: "10R確変", payout: 1500, spent: 100 }

const reading = (fields: Partial<Reading> & Pick<Reading, "counterSpins">): Reading => ({
  phase: "regular",
  rented: 0,
  replayed: 0,
  supported: 0,
  held: undefined,
  jackpot: { type: "none" },
  at: "2026-10-12T12:00:00.000Z",
  ...fields,
})

/** A log with each reading added in turn, a jackpot nobody wrote down admitted where the counter went back. */
const played = (readings: readonly Reading[]): readonly Checkpoint[] =>
  readings.reduce<readonly Checkpoint[]>((log, each) => {
    const added = checkpointsForReading(log, each, false)
    const admitted = added.ok ? added : checkpointsForReading(log, each, true)
    return admitted.ok ? [...log, ...admitted.value] : log
  }, [SAT_DOWN])

const merged = (log: readonly Checkpoint[], from: number, to: number): readonly Checkpoint[] => ((made) => (made.ok ? made.value : []))(withReadingsMerged(log, { from, to }))

describe("a run of a pachinko play's readings made one", () => {
  const RENTED = played([
    reading({ counterSpins: 140, rented: 500 }),
    reading({ counterSpins: 158, rented: 500 }),
    reading({ counterSpins: 181, rented: 1000, replayed: 125 }),
    reading({ counterSpins: 200, rented: 500 }),
  ])

  test("is its last reading, with all that was rented and drawn over the run", () => {
    const log = merged(RENTED, 0, 2)
    expect(takenOf(log).map((each) => [each.reading.counterSpins, each.reading.rented, each.reading.replayed])).toEqual([[181, 2000, 125], [200, 500, 0]])
    expect(log.map((line) => [line.spins, line.outlay, line.replay])).toEqual([[0, 0, undefined], [61, 2000, 125], [80, 2500, 125]])
  })

  test("leaves the play's totals and what it is measured by as they were", () => {
    const log = merged(RENTED, 0, 3)
    expect(takenOf(log)).toHaveLength(1)
    expect(liveSummary(log).outlay).toBe(liveSummary(RENTED).outlay)
    expect(liveSummary(log).spins).toBe(liveSummary(RENTED).spins)
    expect(consumptionOf(log, TERMS)).toEqual(consumptionOf(RENTED, TERMS))
  })

  test("adds up what the 電サポ gained and lost, and keeps the balls in hand as the last counted them", () => {
    const log = played([
      reading({ counterSpins: 300, rented: 5000, jackpot: { type: "bonus", bonus: TEN_ROUNDS } }),
      reading({ counterSpins: 40, phase: "special", supported: -30 }),
      reading({ counterSpins: 90, phase: "special", supported: 12, held: 1380 }),
    ])
    expect(mergeableSpan(log, 2, 0)).toEqual({ from: 1, to: 2 })
    expect(takenOf(merged(log, 1, 2)).at(-1)?.reading).toMatchObject({ counterSpins: 90, phase: "special", supported: -18, held: 1380 })
  })

  test("stops at a jackpot, which may only be the run's last line, and at a change of the cabinet's state", () => {
    const log = played([
      reading({ counterSpins: 140, rented: 500 }),
      reading({ counterSpins: 160, rented: 500, jackpot: { type: "bonus", bonus: TEN_ROUNDS } }),
      reading({ counterSpins: 30, phase: "special" }),
      reading({ counterSpins: 60, phase: "special" }),
      reading({ counterSpins: 90, phase: "rapid" }),
    ])
    expect(mergeableSpan(log, 0, 4)).toEqual({ from: 0, to: 1 })
    expect(mergeableSpan(log, 4, 0)).toEqual({ from: 4, to: 4 })
    expect(mergeableSpan(log, 3, 0)).toEqual({ from: 2, to: 3 })
    expect(takenOf(merged(log, 0, 1)).at(0)?.reading.jackpot).toEqual({ type: "bonus", bonus: TEN_ROUNDS })
  })

  test("takes in no reading a jackpot nobody wrote down was admitted before, which would be lost with it", () => {
    const log = played([reading({ counterSpins: 300, rented: 3000 }), reading({ counterSpins: 30, rented: 500 }), reading({ counterSpins: 55, rented: 500 }), reading({ counterSpins: 80, rented: 500 })])
    expect(takenOf(log).map((each) => each.afterMissedJackpot)).toEqual([false, true, false, false])
    expect(mergeableSpan(log, 0, 3)).toEqual({ from: 0, to: 0 })
    expect(mergeableSpan(log, 1, 3)).toEqual({ from: 1, to: 1 })
    expect(mergeableSpan(log, 3, 0)).toEqual({ from: 2, to: 3 })
    expect(merged(log, 2, 3).map((line) => [line.spins, line.event?.kind])).toEqual([[0, undefined], [180, undefined], [180, "jackpot"], [210, undefined], [260, undefined]])
  })

  test("ends on a reading that knows the hand where any before it did, so that no count is lost and no ball taken as played early", () => {
    const log = played([reading({ counterSpins: 140, rented: 500 }), reading({ counterSpins: 150 }), reading({ counterSpins: 165, rented: 500 }), reading({ counterSpins: 170 }), reading({ counterSpins: 180 })])
    expect(mergeableSpan(log, 0, 1)).toEqual({ from: 0, to: 0 })
    expect(mergeableSpan(log, 0, 3)).toEqual({ from: 0, to: 2 })
    expect(mergeableSpan(log, 4, 0)).toEqual({ from: 3, to: 4 })
    expect(mergeableSpan(log, 2, 0)).toEqual({ from: 0, to: 2 })
    const counted = played([reading({ counterSpins: 140, held: 300 }), reading({ counterSpins: 160 })])
    expect(mergeableSpan(counted, 0, 1)).toEqual({ from: 0, to: 0 })
  })

  test("does not fold the reading the measuring starts from, taken before any regular game, into one after them", () => {
    const log = played([reading({ counterSpins: 120, rented: 500 }), reading({ counterSpins: 140, rented: 500 }), reading({ counterSpins: 160, rented: 500 })])
    expect(mergeableSpan(log, 0, 2)).toEqual({ from: 0, to: 0 })
    expect(mergeableSpan(log, 1, 2)).toEqual({ from: 1, to: 2 })
  })

  test("is the log as it was where the span is one reading, or none of the play's", () => {
    expect(merged(RENTED, 1, 1)).toEqual(RENTED)
    expect(mergeableSpan(RENTED, 3, 9)).toEqual({ from: 3, to: 3 })
  })
})

/** Numbers that look thrown but are the same each run. */
const thrown = (seed: number): (() => number) => {
  const held: { state: number } = { state: seed }
  return () => {
    held.state = (held.state * 1103515245 + 12345) % 2147483648
    return held.state / 2147483648
  }
}

const PHASES: readonly Phase[] = ["regular", "regular", "regular", "special", "rapid"]

/** A play of so many readings, of every kind a play has: rented, drawn, counted, drifted, jackpots told and untold, the counter gone back. */
const anyPlay = (seed: number, length: number): readonly Checkpoint[] => {
  const next = thrown(seed)
  const pick = <T>(among: readonly T[]): T => among[Math.floor(next() * among.length)] as T
  const walked = Array.from({ length }).reduce<{ readonly readings: readonly Reading[]; readonly counter: number }>(
    (sofar) => {
      const counterSpins = next() < 0.08 ? Math.floor(next() * 20) : sofar.counter + Math.floor(next() * 40)
      const jackpot: Reading["jackpot"] = next() < 0.12 ? (next() < 0.8 ? { type: "bonus", bonus: TEN_ROUNDS } : { type: "untold" }) : { type: "none" }
      const each = reading({
        counterSpins,
        phase: pick(PHASES),
        rented: next() < 0.45 ? pick([500, 1000]) : 0,
        replayed: next() < 0.1 ? 125 : 0,
        supported: next() < 0.15 ? Math.floor(next() * 60) - 30 : 0,
        held: next() < 0.15 ? Math.floor(next() * 2000) : undefined,
        jackpot,
      })
      return { readings: [...sofar.readings, each], counter: jackpot.type === "none" ? counterSpins : 0 }
    },
    { readings: [], counter: 120 },
  )
  return played(walked.readings)
}

describe("any run that may be made one", () => {
  test("leaves every figure a play comes to as it was, whichever way it was dragged", () => {
    const plays = Array.from({ length: 60 }, (_, seed) => anyPlay(seed + 1, 14))
    const made = plays.flatMap((log) => {
      const count = takenOf(log).length
      return Array.from({ length: count }).flatMap((_, anchor) =>
        Array.from({ length: count }).flatMap((_, reached) => {
          const span = mergeableSpan(log, anchor, reached)
          return span.to > span.from ? [{ log, after: merged(log, span.from, span.to), span }] : []
        }),
      )
    })
    expect(made.length).toBeGreaterThan(500)
    made.forEach(({ log, after, span }) => {
      expect(takenOf(after)).toHaveLength(takenOf(log).length - (span.to - span.from))
      expect(consumptionOf(after, TERMS)).toEqual(consumptionOf(log, TERMS))
      expect(heldAtFinishOf(after, TERMS)).toEqual(heldAtFinishOf(log, TERMS))
      expect(after.at(-1)).toEqual(log.at(-1) as Checkpoint)
      expect([liveSummary(after).spins, liveSummary(after).outlay, liveSummary(after).jackpots, liveSummary(after).counterNow]).toEqual([liveSummary(log).spins, liveSummary(log).outlay, liveSummary(log).jackpots, liveSummary(log).counterNow])
    })
  })
})
