import { describe, expect, test } from "bun:test"

import { mergeableSpan, withStepsMerged } from "../../../src/core/pachislot/merging"
import { segmentsOf } from "../../../src/core/pachislot/observation"
import { czMissedAt, pathOf } from "../../../src/core/pachislot/path"
import { checkpointForReading, countCheckpoint } from "../../../src/core/pachislot/reading"
import { stepsOf } from "../../../src/core/pachislot/revision"
import type { Checkpoint } from "../../../src/core/play-log/checkpoint"
import { checkpointsForReading } from "../../../src/core/play-log/live"

const AT = "2026-10-12T12:00:00.000Z"

const SEAT: Checkpoint = { spins: 0, outlay: 0, at: AT, counter: { spins: 120, total: 2000, bonuses: { big: 6, reg: 4 } } }

const merged = (log: readonly Checkpoint[], from: number, to: number): readonly Checkpoint[] => ((made) => (made.ok ? made.value : []))(withStepsMerged(log, { from, to }))

/** A bonus machine's log: two readings, a tap, two readings with a tap between them, and a last one. */
const bonusLog = (): readonly Checkpoint[] => {
  const read = (log: readonly Checkpoint[], total: number, outlay: number, big: number): readonly Checkpoint[] => {
    const made = checkpointForReading(log, { total, bonuses: { big, reg: 4 }, outlay, replay: undefined, at: AT })
    return made.ok ? [...log, made.value] : log
  }
  const tap = (log: readonly Checkpoint[]): readonly Checkpoint[] => [...log, countCheckpoint(log, "grape", 1, AT)]
  const early = read(read([SEAT], 2100, 2000, 6), 2180, 3000, 6)
  const counting = tap(early)
  return read(read(tap(read(counting, 2250, 5000, 7)), 2330, 6000, 7), 2400, 7000, 8)
}

describe("a run of a bonus machine's readings made one", () => {
  test("is its last reading, the taps between kept where the log has reached", () => {
    const log = bonusLog()
    expect(stepsOf(log).map((step) => step.type)).toEqual(["reading", "reading", "kept", "reading", "kept", "reading", "reading"])
    expect(mergeableSpan(log, 3, 6)).toEqual({ from: 3, to: 6 })
    expect(merged(log, 3, 6).map((line) => [line.spins, line.outlay, line.counter?.bonuses?.["big"], line.tally?.["grape"]])).toEqual([
      [0, 0, 6, undefined],
      [100, 2000, 6, undefined],
      [180, 3000, 6, undefined],
      [180, undefined, undefined, 1],
      [180, undefined, undefined, 2],
      [400, 7000, 8, undefined],
    ])
  })

  test("passes over every tap, the first among them", () => {
    const log = bonusLog()
    expect(mergeableSpan(log, 0, 6)).toEqual({ from: 0, to: 6 })
    expect(mergeableSpan(log, 6, 0)).toEqual({ from: 0, to: 6 })
  })

  test("never passes the line an older log began counting at, which its counted games are told from", () => {
    const log = bonusLog()
    const older = [...log.slice(0, 3), { spins: 180, at: AT, tally: {} }, ...log.slice(3)]
    expect(mergeableSpan(older, 0, 7)).toEqual({ from: 0, to: 1 })
    expect(mergeableSpan(older, 7, 0)).toEqual({ from: 4, to: 7 })
  })

  test("leaves what was seen of the day, and of the games counted, as it was", () => {
    const log = bonusLog()
    const shownAs = (id: string): string | undefined => (id === "grape" ? undefined : id)
    expect(segmentsOf(merged(log, 3, 6), shownAs)).toEqual(segmentsOf(log, shownAs))
    expect(segmentsOf(merged(log, 0, 1), shownAs)).toEqual(segmentsOf(log, shownAs))
    expect(merged(log, 0, 1).at(-1)).toEqual(log.at(-1) as Checkpoint)
  })

  test("is the log as it was where the span is one reading, or begins on no reading", () => {
    const log = bonusLog()
    expect(merged(log, 3, 3)).toEqual(log)
    expect(mergeableSpan(log, 2, 6)).toEqual({ from: 2, to: 2 })
  })
})

/** An AT machine's log: two readings, a CZ missed, two more, an AT won with its result, then two readings after it. */
const atLog = (): readonly Checkpoint[] => {
  const seat: Checkpoint = { spins: 0, outlay: 0, at: AT, counter: { spins: 200 } }
  const read = (log: readonly Checkpoint[], sinceAt: number, outlay: number, jackpot: boolean, missed = false): readonly Checkpoint[] => {
    const made = checkpointsForReading(log, { counterSpins: sinceAt, outlay, replay: undefined, counterJackpots: undefined, at: AT, jackpot }, false)
    return made.ok ? [...log, ...(missed ? czMissedAt(made.value) : made.value)] : log
  }
  const won = read(read(read(read(read([seat], 260, 1000, false), 300, 3000, false), 420, 6000, false, true), 500, 7000, false), 610, 9000, true)
  const result: Checkpoint = { spins: won.at(-1)?.spins ?? 0, at: AT, event: { kind: "at-ended", medals: 800 } }
  return read(read([...won, result], 40, 9000, false), 90, 10000, false)
}

describe("a run of an AT machine's readings made one", () => {
  test("ends on a CZ missed or an AT won, and never passes one", () => {
    const log = atLog()
    expect(stepsOf(log).map((step) => step.type)).toEqual(["at-reading", "at-reading", "at-reading", "at-reading", "at-reading", "kept", "at-reading", "at-reading"])
    expect(mergeableSpan(log, 0, 7)).toEqual({ from: 0, to: 2 })
    expect(mergeableSpan(log, 3, 7)).toEqual({ from: 3, to: 4 })
    expect(mergeableSpan(log, 7, 0)).toEqual({ from: 6, to: 7 })
    expect(mergeableSpan(log, 4, 0)).toEqual({ from: 3, to: 4 })
  })

  test("leaves the path the play took as it was, with every CZ and AT where it came", () => {
    const log = atLog()
    const after = merged(merged(merged(log, 0, 2), 1, 2), 3, 4)
    expect(stepsOf(after).map((step) => step.type)).toEqual(["at-reading", "at-reading", "kept", "at-reading"])
    expect(pathOf(after)).toEqual(pathOf(log))
    expect([after.at(-1)?.spins, after.at(-1)?.outlay]).toEqual([log.at(-1)?.spins, log.at(-1)?.outlay])
  })
})
