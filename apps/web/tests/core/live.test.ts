import { describe, expect, test } from "bun:test"

import { parsePlayLog, type Checkpoint } from "../../src/core/play-log/checkpoint"
import { afterMissedJackpot, checkpointsForReading, liveSummary, minutesPlayedOf, missingJackpots, readCounter } from "../../src/core/play-log/live"
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
    expect(checkpointsForReading(log, { counterSpins: 470, outlay: 2000, replay: undefined, counterJackpots: undefined, at, jackpot: false }, false)).toEqual({
      ok: true,
      value: [{ spins: 350, outlay: 2000, at, counter: { spins: 470 } }],
    })
  })

  test("at a jackpot is marked as one", () => {
    expect(checkpointsForReading(log, { counterSpins: 400, outlay: undefined, replay: undefined, counterJackpots: 1, at, jackpot: true }, false)).toEqual({
      ok: true,
      value: [{ spins: 280, at, counter: { spins: 400, jackpots: 1 }, event: { kind: "jackpot" } }],
    })
  })

  test("is refused when the counter went back, until the person says a jackpot was missed", () => {
    const input = { counterSpins: 30, outlay: undefined, replay: undefined, counterJackpots: undefined, at, jackpot: false }
    expect(checkpointsForReading(log, input, false)).toEqual({ ok: false, error: { type: "counter-went-back", expectedAtLeast: 370 } })
    expect(checkpointsForReading(log, input, true)).toEqual({
      ok: true,
      value: [
        { spins: 250, at, event: { kind: "jackpot", approximate: true } },
        { spins: 280, at, counter: { spins: 30 } },
      ],
    })
  })

  test("keeps the tokens drawn from savings so far, and is refused where fewer are said than before", () => {
    const drawn = checkpointsForReading(log, { counterSpins: 470, outlay: undefined, replay: 250, counterJackpots: undefined, at, jackpot: false }, false)
    expect(drawn.ok && drawn.value.at(-1)?.replay).toBe(250)
    const after = drawn.ok ? [...log, ...drawn.value] : log
    expect(checkpointsForReading(after, { counterSpins: 480, outlay: undefined, replay: 100, counterJackpots: undefined, at, jackpot: false }, false)).toEqual({ ok: false, error: { type: "replay-went-back", atLeast: 250 } })
  })

  test("is refused when it says less was spent than before", () => {
    expect(checkpointsForReading(log, { counterSpins: 470, outlay: 500, replay: undefined, counterJackpots: undefined, at, jackpot: false }, false)).toEqual({
      ok: false,
      error: { type: "outlay-went-back", atLeast: 1000 },
    })
  })
})

describe("the jackpots a log records", () => {
  const TWICE = { name: "20R", payout: 3000, spent: 200, jackpots: 2 }

  test("are as many as each bonus was won over, so a run a machine gives as one win is counted as the parlor's counter counts it", () => {
    const log: readonly Checkpoint[] = [
      { spins: 0, counter: { spins: 120, jackpots: 9 } },
      { spins: 80, counter: { spins: 200 }, event: { kind: "jackpot", bonus: { name: "10R", payout: 1500, spent: 100 } } },
      { spins: 110, counter: { spins: 30 }, event: { kind: "jackpot", bonus: TWICE } },
      { spins: 150, counter: { spins: 40, jackpots: 12 }, event: { kind: "jackpot" } },
    ]
    const summary = liveSummary(log)
    expect(summary.jackpots).toBe(4)
    expect(summary.counterJackpots).toBe(3)
    expect(missingJackpots(liveSummary(log.slice(0, 3).concat({ spins: 150, counter: { spins: 40, jackpots: 12 } })))).toBe(0)
    expect(missingJackpots(liveSummary([log[0] as Checkpoint, { spins: 110, counter: { spins: 30, jackpots: 12 }, event: { kind: "jackpot", bonus: { ...TWICE, jackpots: 1 } } }]))).toBe(2)
  })

  test("are read back from a line as it was written, and a line that says none of a bonus is refused", () => {
    const line = '{"spins":110,"event":{"kind":"jackpot","bonus":{"name":"20R","payout":3000,"spent":200,"jackpots":2}}}'
    expect(parsePlayLog(line)).toEqual({ ok: true, value: [{ spins: 110, event: { kind: "jackpot", bonus: TWICE } }] })
    expect(parsePlayLog(line.replace('"jackpots":2', '"jackpots":0')).ok).toBe(false)
  })
})

describe("how long a play has gone on", () => {
  const started = "2026-10-20T10:00:00+09:00"

  test("runs from its start to the latest line written with a time", () => {
    const log: readonly Checkpoint[] = [
      { spins: 0, at: "2026-10-20T10:00:00+09:00" },
      { spins: 120, at: "2026-10-20T11:40:00+09:00" },
      { spins: 90, at: "2026-10-20T11:00:00+09:00" },
      { spins: 150 },
    ]
    expect(minutesPlayedOf(started, log)).toBe(100)
  })

  test("is nothing where no line has a time", () => {
    expect(minutesPlayedOf(started, [{ spins: 0 }, { spins: 310 }])).toBeUndefined()
  })
})
