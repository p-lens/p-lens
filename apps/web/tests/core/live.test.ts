import { describe, expect, test } from "bun:test"

import type { Checkpoint } from "../../src/core/play-log/checkpoint"
import { afterMissedJackpot, checkpointsForReading, liveSummary, missingJackpots, readCounter } from "../../src/core/play-log/live"
import { performanceAcross } from "../../src/core/play-log/performance"

const SAT_DOWN: Checkpoint = { spins: 0, outlay: 0, counter: { spins: 120 } }

describe("reading the parlor's counter", () => {
  test("counts from the reading the play began with, not from zero", () => {
    expect(readCounter([SAT_DOWN], 370)).toEqual({ type: "continues", spins: 250 })
  })

  test("counts from the last jackpot once there has been one, where the counter starts over", () => {
    const log: Checkpoint[] = [SAT_DOWN, { spins: 290, counter: { spins: 410 }, event: { kind: "jackpot" } }]
    expect(readCounter(log, 50)).toEqual({ type: "continues", spins: 340 })
  })

  test("a reading below what the counter should show means a jackpot went unrecorded", () => {
    const log: Checkpoint[] = [SAT_DOWN, { spins: 250, outlay: 1000, counter: { spins: 370 } }]
    expect(readCounter(log, 30)).toEqual({ type: "counter-went-back", expectedAtLeast: 370 })
  })

  test("a missed jackpot is put where the log last knew of the play, marked approximate", () => {
    const log: Checkpoint[] = [SAT_DOWN, { spins: 250, outlay: 1000 }]
    expect(afterMissedJackpot(log, 30, { outlay: 2000, counter: { spins: 30 }, at: "2026-10-04T13:00:00.000Z" })).toEqual([
      { spins: 250, at: "2026-10-04T13:00:00.000Z", event: { kind: "jackpot", approximate: true } },
      { spins: 280, outlay: 2000, counter: { spins: 30 }, at: "2026-10-04T13:00:00.000Z" },
    ])
  })
})

describe("where a play stands", () => {
  const log: Checkpoint[] = [
    SAT_DOWN,
    { spins: 180, outlay: 1000, counter: { spins: 300 } },
    { spins: 290, counter: { spins: 410 }, event: { kind: "jackpot" } },
    { spins: 400, outlay: 2000, counter: { spins: 110, jackpots: 3 } },
  ]

  test("is read off the checkpoints alone", () => {
    expect(liveSummary(log)).toEqual({
      spins: 400,
      counterNow: 110,
      outlay: 2000,
      jackpots: 1,
      counterJackpots: 3,
      overall: { fromSpins: 0, toSpins: 400, spinPerformance: 200 },
      stretches: [
        { fromSpins: 0, toSpins: 180, spinPerformance: 180 },
        { fromSpins: 180, toSpins: 400, spinPerformance: 220 },
      ],
    })
  })

  test("says how many jackpots the counter has that the log does not", () => {
    expect(missingJackpots(liveSummary(log))).toBe(2)
    expect(missingJackpots(liveSummary([SAT_DOWN]))).toBe(0)
  })

  test("does not count the jackpots the counter already showed at the seat", () => {
    const seat = { spins: 0, outlay: 0, counter: { spins: 120, jackpots: 7 } }
    expect(missingJackpots(liveSummary([seat]))).toBe(0)
    expect(missingJackpots(liveSummary([seat, { spins: 200, counter: { spins: 320, jackpots: 9 } }]))).toBe(2)
  })

  test("spin performance can be read between any two points", () => {
    expect(performanceAcross(log[1] as Checkpoint, log[3] as Checkpoint)).toEqual({ fromSpins: 180, toSpins: 400, spinPerformance: 220 })
    expect(performanceAcross(log[1] as Checkpoint, log[2] as Checkpoint)).toBeUndefined()
  })
})

describe("adding a reading", () => {
  const at = "2026-10-04T13:00:00.000Z"
  const log: Checkpoint[] = [SAT_DOWN, { spins: 250, outlay: 1000, counter: { spins: 370 } }]

  test("is one checkpoint at the spins the counter comes to", () => {
    expect(checkpointsForReading(log, { counterSpins: 470, outlay: 2000, counterJackpots: undefined, at, jackpot: false }, false)).toEqual({
      ok: true,
      value: [{ spins: 350, outlay: 2000, at, counter: { spins: 470 } }],
    })
  })

  test("at a jackpot is marked as one", () => {
    expect(checkpointsForReading(log, { counterSpins: 400, outlay: undefined, counterJackpots: 1, at, jackpot: true }, false)).toEqual({
      ok: true,
      value: [{ spins: 280, at, counter: { spins: 400, jackpots: 1 }, event: { kind: "jackpot" } }],
    })
  })

  test("is refused when the counter went back, until the person says a jackpot was missed", () => {
    const input = { counterSpins: 30, outlay: undefined, counterJackpots: undefined, at, jackpot: false }
    expect(checkpointsForReading(log, input, false)).toEqual({ ok: false, error: { type: "counter-went-back", expectedAtLeast: 370 } })
    expect(checkpointsForReading(log, input, true)).toEqual({
      ok: true,
      value: [
        { spins: 250, at, event: { kind: "jackpot", approximate: true } },
        { spins: 280, at, counter: { spins: 30 } },
      ],
    })
  })

  test("is refused when it says less was spent than before", () => {
    expect(checkpointsForReading(log, { counterSpins: 470, outlay: 500, counterJackpots: undefined, at, jackpot: false }, false)).toEqual({
      ok: false,
      error: { type: "outlay-went-back", atLeast: 1000 },
    })
  })
})
