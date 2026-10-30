import { describe, expect, test } from "bun:test"

import { withReadingsMerged } from "../../../src/core/pachinko/merging"
import { checkpointsForReading, type Reading } from "../../../src/core/pachinko/reading"
import { gaugeNowOf, gaugeSaid, seatOf, standingBefore, takenOf, withReadingRevised, withSeatRevised } from "../../../src/core/pachinko/revision"
import { appendCheckpoint, parsePlayLog, type Checkpoint } from "../../../src/core/play-log/checkpoint"
import { EVERY_JACKPOT, liveSummary } from "../../../src/core/play-log/live"

const TEN_ROUNDS = { name: "10R確変", payout: 1500, spent: 100 }

const seat = (gauge?: number): Checkpoint => ({ spins: 0, outlay: 0, counter: { spins: 55, jackpots: 9, ...(gauge === undefined ? {} : { gauge }) } })

const reading = (fields: Partial<Reading> & Pick<Reading, "counterSpins">): Reading => ({
  phase: "regular",
  rented: 0,
  replayed: 0,
  supported: 0,
  held: undefined,
  jackpot: { type: "none" },
  at: "2026-10-17T12:00:00.000Z",
  ...fields,
})

const played = (first: Checkpoint, readings: readonly Reading[]): readonly Checkpoint[] =>
  readings.reduce<readonly Checkpoint[]>((log, each) => {
    const added = checkpointsForReading(log, each, false, EVERY_JACKPOT)
    const admitted = added.ok ? added : checkpointsForReading(log, each, true, EVERY_JACKPOT)
    return admitted.ok ? [...log, ...admitted.value] : log
  }, [first])

const made = (result: { readonly ok: true; readonly value: readonly Checkpoint[] } | { readonly ok: false }): readonly Checkpoint[] => (result.ok ? result.value : [])

describe("the spins a pachinko cabinet stands at toward its 遊タイム", () => {
  test("are the data counter's where no 遊 counter was said, as before", () => {
    const log = played(seat(), [reading({ counterSpins: 120 }), reading({ counterSpins: 180 })])
    expect(gaugeNowOf(log, EVERY_JACKPOT)).toBe(liveSummary(log).counterNow)
    expect(gaugeNowOf(log, EVERY_JACKPOT)).toBe(180)
    expect(standingBefore(log, 2, EVERY_JACKPOT).gaugeOffset).toBeUndefined()
  })

  test("follow the 遊 counter said at the seat, the data counter's lead kept as it counts on", () => {
    const log = played(seat(5), [reading({ counterSpins: 120 }), reading({ counterSpins: 180 })])
    expect(gaugeNowOf([seat(5)], EVERY_JACKPOT)).toBe(5)
    expect(standingBefore(log, 1, EVERY_JACKPOT).gaugeOffset).toBe(50)
    expect(gaugeNowOf(log, EVERY_JACKPOT)).toBe(130)
  })

  test("drop the lead at the next jackpot, both counters starting over", () => {
    const log = played(seat(5), [reading({ counterSpins: 120, jackpot: { type: "bonus", bonus: TEN_ROUNDS } }), reading({ counterSpins: 40 })])
    expect(standingBefore(log, 1, EVERY_JACKPOT).gaugeOffset).toBeUndefined()
    expect(gaugeNowOf(log, EVERY_JACKPOT)).toBe(40)
  })

  test("drop the lead at a jackpot found missing, as at one written down", () => {
    const log = played(seat(5), [reading({ counterSpins: 120 }), reading({ counterSpins: 30 })])
    expect(log.some((line) => line.event?.kind === "jackpot" && line.event.approximate === true)).toBe(true)
    expect(gaugeNowOf(log, EVERY_JACKPOT)).toBe(30)
  })

  test("take a 遊 counter said at a reading from there on, even one said after a jackpot", () => {
    const log = played(seat(), [reading({ counterSpins: 300, jackpot: { type: "untold" } }), reading({ counterSpins: 160, gauge: 10 }), reading({ counterSpins: 200 })])
    expect(gaugeNowOf(log, EVERY_JACKPOT)).toBe(50)
    expect(takenOf(log).map((taken) => taken.reading.gauge)).toEqual([undefined, 10, undefined])
  })

  test("are the 遊 counter said last where it is said again", () => {
    const log = played(seat(5), [reading({ counterSpins: 120, gauge: 100 }), reading({ counterSpins: 150 })])
    expect(gaugeNowOf(log, EVERY_JACKPOT)).toBe(130)
  })
})

describe("a 遊 counter in a pachinko play's log", () => {
  test("is written in the reading's counter and read back as it was", () => {
    const log = played(seat(5), [reading({ counterSpins: 120, gauge: 70 })])
    expect(log.at(-1)?.counter).toEqual({ spins: 120, gauge: 70 })
    const text = log.reduce(appendCheckpoint, "")
    expect(parsePlayLog(text)).toEqual({ ok: true, value: log })
  })

  test("is refused where it is no count, and a log without one reads as it did", () => {
    expect(parsePlayLog('{"spins":0,"counter":{"spins":55,"gauge":-1}}\n')).toEqual({ ok: false, error: { type: "invalid-field", line: 1, field: "counter" } })
    expect(parsePlayLog('{"spins":0,"counter":{"spins":55}}\n')).toEqual({ ok: true, value: [{ spins: 0, counter: { spins: 55 } }] })
  })

  test("stays with its reading as another is set right, and makes the lead follow it", () => {
    const log = played(seat(), [reading({ counterSpins: 120, gauge: 70 }), reading({ counterSpins: 150 })])
    const revised = made(withReadingRevised(log, 1, reading({ counterSpins: 160 }), EVERY_JACKPOT))
    expect(revised.at(1)?.counter).toEqual({ spins: 120, gauge: 70 })
    expect(gaugeNowOf(revised, EVERY_JACKPOT)).toBe(110)
  })

  test("is carried into readings made one, at the last one's counter", () => {
    const log = played(seat(), [reading({ counterSpins: 120, gauge: 70, rented: 1000 }), reading({ counterSpins: 150, rented: 1000 })])
    const merged = made(withReadingsMerged(log, { from: 0, to: 1 }, EVERY_JACKPOT))
    expect(merged.at(-1)?.counter).toEqual({ spins: 150, gauge: 100 })
    expect(gaugeNowOf(merged, EVERY_JACKPOT)).toBe(gaugeNowOf(log, EVERY_JACKPOT))
  })

  test("at the seat is set right with the seat, and let go of where the seat says none", () => {
    const log = played(seat(5), [reading({ counterSpins: 120 })])
    expect(seatOf(log)).toEqual({ spins: 55, jackpots: 9, gauge: 5 })
    const changed = made(withSeatRevised(log, { spins: 55, jackpots: 9, gauge: 15 }, EVERY_JACKPOT))
    expect(gaugeNowOf(changed, EVERY_JACKPOT)).toBe(80)
    const cleared = made(withSeatRevised(log, { spins: 55, jackpots: 9 }, EVERY_JACKPOT))
    expect(cleared.at(0)?.counter).toEqual({ spins: 55, jackpots: 9 })
    expect(gaugeNowOf(cleared, EVERY_JACKPOT)).toBe(120)
  })
})

describe("the 遊 counter said in the middle of a play", () => {
  test("is a line at the data counter where it stands, saying nothing else, and followed from there", () => {
    const log = played(seat(), [reading({ counterSpins: 120, rented: 1000, held: 200 })])
    const made = gaugeSaid(log, 70, "2026-10-17T13:00:00.000Z", EVERY_JACKPOT)
    expect(made.ok).toBe(true)
    const said = made.ok ? [...log, ...made.value] : log
    expect(said.at(-1)?.counter).toEqual({ spins: 120, gauge: 70 })
    expect(said.at(-1)?.outlay).toBe(log.at(-1)?.outlay)
    expect(gaugeNowOf(said, EVERY_JACKPOT)).toBe(70)
    const on = played(said[0] ?? seat(), [...takenOf(said).map((taken) => taken.reading), reading({ counterSpins: 150 })])
    expect(gaugeNowOf(on, EVERY_JACKPOT)).toBe(100)
  })
})

describe("a 0R at a counter that takes none", () => {
  const UNCOUNTED = { ...EVERY_JACKPOT, zeroRounds: "uncounted" } as const
  const ZERO = { name: "0R", payout: 0, spent: 0 }
  /** A 0R at counter 155, then a reading 30 spins on: the counter shows `after` there. */
  const log = (counting: typeof EVERY_JACKPOT, after: number): readonly Checkpoint[] =>
    [reading({ counterSpins: 155, jackpot: { type: "bonus", bonus: ZERO } }), reading({ counterSpins: after })].reduce<readonly Checkpoint[]>((made, each) => {
      const added = checkpointsForReading(made, each, false, counting)
      return added.ok ? [...made, ...added.value] : made
    }, [seat()])

  test("leaves the data counter carrying on and the 遊 counter started over", () => {
    const carried = log(UNCOUNTED, 185)
    expect(carried.map((checkpoint) => checkpoint.spins)).toEqual([0, 100, 130])
    expect(standingBefore(carried, 2, UNCOUNTED)).toMatchObject({ counter: 185, gaugeOffset: 155 })
    expect(gaugeNowOf(carried, UNCOUNTED)).toBe(30)
  })

  test("is a jackpot both counters start over at, where the counter takes one", () => {
    const started = log(EVERY_JACKPOT, 30)
    expect(started.map((checkpoint) => checkpoint.spins)).toEqual([0, 100, 130])
    expect(standingBefore(started, 2, EVERY_JACKPOT)).toMatchObject({ counter: 30, gaugeOffset: undefined })
    expect(gaugeNowOf(started, EVERY_JACKPOT)).toBe(30)
  })
})
