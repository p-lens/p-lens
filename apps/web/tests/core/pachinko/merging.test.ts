import { describe, expect, test } from "bun:test"

import { consumptionOf, stretchPerformancesOf } from "../../../src/core/pachinko/consumption"
import { mergeableSpan, withReadingsMerged } from "../../../src/core/pachinko/merging"
import { checkpointsForReading, type Reading } from "../../../src/core/pachinko/reading"
import { heldAsToldOf, standingBefore, takenOf, withReadingInserted, withReadingRemoved } from "../../../src/core/pachinko/revision"
import type { Checkpoint, Phase } from "../../../src/core/play-log/checkpoint"
import { liveSummary } from "../../../src/core/play-log/live"
import { appendCheckpoint, parsePlayLog } from "../../../src/core/play-log/checkpoint"

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
    expect(consumptionOf(log, TERMS, undefined)).toEqual(consumptionOf(RENTED, TERMS, undefined))
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

  test("folds a reading that bought balls into one that knows nothing of the hand, the hand known there kept in it", () => {
    const log = played([reading({ counterSpins: 320, rented: 10000, replayed: 3000 }), reading({ counterSpins: 400 })])
    expect(mergeableSpan(log, 0, 1)).toEqual({ from: 0, to: 1 })
    const made = merged(log, 0, 1)
    expect(takenOf(made).map((each) => each.reading)).toMatchObject([{ counterSpins: 400, rented: 10000, replayed: 3000, held: undefined, handsBefore: [{ counterSpins: 320, rented: 10000, replayed: 3000, supported: 0, held: 0 }] }])
    expect(made.at(-1)?.handsBefore).toEqual([{ spins: 200, outlay: 10000, replay: 3000, support: 0, held: 0 }])
    expect(consumptionOf(made, TERMS, undefined)).toEqual(consumptionOf(log, TERMS, undefined))
    expect(consumptionOf(made, TERMS, undefined).measured).toEqual({ spins: 200, balls: 5500, rentedBalls: 2500, replayedBalls: 3000 })
    expect(heldAsToldOf(made)).toBe(heldAsToldOf(log))
  })

  test("folds the first balls bought, before any regular game, the measuring still starting from them", () => {
    const log = played([reading({ counterSpins: 120, rented: 500 }), reading({ counterSpins: 140, rented: 500 }), reading({ counterSpins: 160, replayed: 125 }), reading({ counterSpins: 175 })])
    expect(mergeableSpan(log, 0, 3)).toEqual({ from: 0, to: 3 })
    const made = merged(log, 0, 3)
    expect(takenOf(made)).toHaveLength(1)
    expect(consumptionOf(made, TERMS, undefined)).toEqual(consumptionOf(log, TERMS, undefined))
    expect(heldAsToldOf(made)).toBe(heldAsToldOf(log))
  })

  test("keeps a count folded in as the last count, for the next reading to carry", () => {
    const log = played([reading({ counterSpins: 140, rented: 500 }), reading({ counterSpins: 150, held: 80 }), reading({ counterSpins: 160 })])
    const made = merged(log, 1, 2)
    expect(standingBefore(made, 2).held).toBe(80)
    expect(made.at(-1)?.handsBefore).toEqual([{ spins: 30, outlay: 500, replay: 0, support: 0, held: 80, counted: true }])
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
      expect(consumptionOf(after, TERMS, undefined)).toEqual(consumptionOf(log, TERMS, undefined))
      expect(heldAsToldOf(after)).toEqual(heldAsToldOf(log))
      const lines = log.flatMap((line, at) => (at > 0 && !(line.event?.kind === "jackpot" && line.event.approximate === true) ? [at] : []))
      const [first, last] = [lines[span.from] ?? 0, lines[span.to] ?? 0]
      expect(stretchPerformancesOf(after, TERMS).slice(0, first)).toEqual(stretchPerformancesOf(log, TERMS).slice(0, first))
      expect(stretchPerformancesOf(after, TERMS).slice(first + 1)).toEqual(stretchPerformancesOf(log, TERMS).slice(last + 1))
      expect(((line) => (line === undefined ? undefined : { ...line, handsBefore: undefined, support: undefined }))(after.at(-1))).toEqual({ ...(log.at(-1) as Checkpoint), handsBefore: undefined, support: undefined })
      expect(after.findLast((line) => line.support !== undefined)?.support).toEqual(log.findLast((line) => line.support !== undefined)?.support)
      expect([liveSummary(after).spins, liveSummary(after).outlay, liveSummary(after).jackpots, liveSummary(after).counterNow]).toEqual([liveSummary(log).spins, liveSummary(log).outlay, liveSummary(log).jackpots, liveSummary(log).counterNow])
    })
  })

  test("leaves every figure as it was however often it is folded again, written down and read back, or set right elsewhere", () => {
    const figures = (log: readonly Checkpoint[]) => [consumptionOf(log, TERMS, undefined), heldAsToldOf(log), liveSummary(log).spins, liveSummary(log).outlay, liveSummary(log).jackpots, liveSummary(log).counterNow]
    const written = (log: readonly Checkpoint[]): readonly Checkpoint[] => ((read) => (read.ok ? read.value : []))(parsePlayLog(log.reduce((text, line) => appendCheckpoint(text, line), "")))
    const plays = Array.from({ length: 40 }, (_, seed) => anyPlay(seed + 101, 16))
    const checked = plays.map((log, seed) => {
      const next = thrown(seed + 7)
      const fold = (now: readonly Checkpoint[]): readonly Checkpoint[] => {
        const count = takenOf(now).length
        const span = mergeableSpan(now, Math.floor(next() * count), Math.floor(next() * count))
        return merged(now, span.from, span.to)
      }
      const folded = [fold, fold, written, fold, written, fold].reduce<readonly Checkpoint[]>((now, step) => {
        const after = step(now)
        expect(figures(after)).toEqual(figures(now))
        return after
      }, log)
      expect(merged(folded, 0, 0)).toEqual(folded)
      return takenOf(folded).length < takenOf(log).length
    })
    expect(checked.filter(Boolean).length).toBeGreaterThan(15)
  })

  test("keeps where a jackpot's stretch before the run closes, and a folded reading's purchases where they were, however often it is folded", () => {
    const log = played([
      reading({ counterSpins: 140, rented: 500 }),
      reading({ counterSpins: 160, jackpot: { type: "bonus", bonus: TEN_ROUNDS } }),
      reading({ counterSpins: 30, held: 1300 }),
      reading({ counterSpins: 60, rented: 500 }),
      reading({ counterSpins: 90 }),
      reading({ counterSpins: 120 }),
    ])
    const once = merged(log, 2, 4)
    expect(stretchPerformancesOf(once, TERMS)[2]).toEqual(stretchPerformancesOf(log, TERMS)[2])
    const twice = merged(once, 2, 3)
    expect(consumptionOf(twice, TERMS, undefined)).toEqual(consumptionOf(log, TERMS, undefined))
    expect(stretchPerformancesOf(twice, TERMS)[2]).toEqual(stretchPerformancesOf(log, TERMS)[2])
  })

  test("keeps a 電サポ total that came back to none, so folding reads it as it was", () => {
    const log = played([reading({ counterSpins: 140, rented: 500, jackpot: { type: "bonus", bonus: TEN_ROUNDS } }), reading({ counterSpins: 20, phase: "rapid", supported: 30 }), reading({ counterSpins: 40, phase: "rapid", supported: -30 }), reading({ counterSpins: 60, held: 900 })])
    expect(log.at(3)?.support).toBe(0)
    expect(takenOf(log).map((taken) => taken.reading.supported)).toEqual([0, 30, -30, 0])
    expect(consumptionOf(merged(log, 0, 0), TERMS, undefined)).toEqual(consumptionOf(log, TERMS, undefined))
  })

  test("keeps the hands of a folded reading through a reading put in or taken out before it", () => {
    const log = played([reading({ counterSpins: 140, rented: 500 }), reading({ counterSpins: 320, rented: 10000, replayed: 3000 }), reading({ counterSpins: 400 })])
    const made = merged(log, 1, 2)
    const without = withReadingRemoved(made, 0)
    expect(without.ok && without.value.at(-1)?.handsBefore).toEqual([{ spins: 200, outlay: 10000, replay: 3000, support: 0, held: 0 }])
    const withMore = withReadingInserted(made, 0, reading({ counterSpins: 130, rented: 500 }))
    expect(withMore.ok && withMore.value.at(-1)?.handsBefore).toEqual([{ spins: 200, outlay: 11000, replay: 3000, support: 0, held: 0 }])
  })
})
