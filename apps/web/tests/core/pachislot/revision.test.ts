import { describe, expect, test } from "bun:test"

import { czMissedAt } from "../../../src/core/pachislot/path"
import { checkpointForReading, countCheckpoint } from "../../../src/core/pachislot/reading"
import { stepsOf, withStepRemoved, withStepRevised, type Step } from "../../../src/core/pachislot/revision"
import type { Checkpoint } from "../../../src/core/play-log/checkpoint"
import { checkpointsForReading } from "../../../src/core/play-log/live"

const AT = "2026-10-08T12:00:00.000Z"

const SEAT: Checkpoint = { spins: 0, outlay: 0, at: AT, counter: { spins: 120, total: 2000, bonuses: { big: 6, reg: 4 } } }

/** A bonus machine's log: readings of its counter, with two taps between them. */
const bonusLog = (): readonly Checkpoint[] => {
  const read = (log: readonly Checkpoint[], total: number, outlay: number, big: number): readonly Checkpoint[] => {
    const made = checkpointForReading(log, { total, bonuses: { big, reg: 4 }, outlay, replay: undefined, at: AT })
    return made.ok ? [...log, made.value] : log
  }
  const first = read([SEAT], 2100, 2000, 6)
  const tapped = [...first, countCheckpoint(first, "grape", 1, AT)]
  const twice = [...tapped, countCheckpoint(tapped, "grape", 1, AT)]
  return read(read(twice, 2250, 5000, 7), 2400, 7000, 7)
}

describe("a bonus machine's log", () => {
  test("is read back as the steps it was made of, and made again from them as it was", () => {
    const log = bonusLog()
    expect(stepsOf(log).map((step) => step.type)).toEqual(["reading", "kept", "kept", "reading", "reading"])
    const first = stepsOf(log)[0] as Step
    expect(withStepRevised(log, 0, first)).toEqual({ ok: true, value: log })
  })

  test("has every line after a reading set right made again: its games, and the taps that stood on them", () => {
    const log = bonusLog()
    const revised = withStepRevised(log, 0, { type: "reading", input: { total: 2150, bonuses: { big: 6, reg: 4 }, outlay: 3000, replay: undefined, at: AT } })
    expect(revised.ok && revised.value.map((line) => [line.spins, line.outlay, line.tally?.["grape"]])).toEqual([
      [0, 0, undefined],
      [150, 3000, undefined],
      [150, undefined, 1],
      [150, undefined, 2],
      [250, 5000, undefined],
      [400, 7000, undefined],
    ])
  })

  test("takes a reading away, and refuses a change a later reading cannot follow", () => {
    const log = bonusLog()
    const removed = withStepRemoved(log, 3)
    expect(removed.ok && removed.value.map((line) => line.spins)).toEqual([0, 100, 100, 100, 400])
    expect(withStepRevised(log, 0, { type: "reading", input: { total: 2300, bonuses: {}, outlay: 2000, replay: undefined, at: AT } })).toEqual({ ok: false, error: { type: "total-went-back", atLeast: 2300, index: 3 } })
    expect(withStepRevised(log, 0, { type: "reading", input: { total: 2100, bonuses: {}, outlay: 6000, replay: undefined, at: AT } })).toEqual({ ok: false, error: { type: "outlay-went-back", atLeast: 6000, index: 3 } })
  })
})

/** An AT machine's log: a reading, a CZ missed, an AT won with its result, then a reading after it. */
const atLog = (): readonly Checkpoint[] => {
  const seat: Checkpoint = { spins: 0, outlay: 0, at: AT, counter: { spins: 200 } }
  const read = (log: readonly Checkpoint[], sinceAt: number, outlay: number, jackpot: boolean, missed = false): readonly Checkpoint[] => {
    const made = checkpointsForReading(log, { counterSpins: sinceAt, outlay, replay: undefined, counterJackpots: undefined, at: AT, jackpot }, false)
    return made.ok ? [...log, ...(missed ? czMissedAt(made.value) : made.value)] : log
  }
  const won = read(read(read([seat], 300, 3000, false), 420, 6000, false, true), 610, 9000, true)
  const result: Checkpoint = { spins: won.at(-1)?.spins ?? 0, at: AT, event: { kind: "at-ended", medals: 800 } }
  return read([...won, result], 90, 9000, false)
}

describe("a bonus machine's counter", () => {
  test("does not count fewer of a bonus than it showed before, in a new reading or one set right", () => {
    const log = bonusLog()
    expect(checkpointForReading(log, { total: 2500, bonuses: { big: 6, reg: 4 }, outlay: 7000, replay: undefined, at: AT })).toEqual({ ok: false, error: { type: "bonus-went-back", id: "big", atLeast: 7 } })
    expect(checkpointForReading(log, { total: 2500, bonuses: {}, outlay: 7000, replay: undefined, at: AT }).ok).toBe(true)
    expect(withStepRevised(log, 0, { type: "reading", input: { total: 2100, bonuses: { big: 8, reg: 4 }, outlay: 2000, replay: undefined, at: AT } })).toEqual({
      ok: false,
      error: { type: "bonus-went-back", id: "big", atLeast: 8, index: 3 },
    })
  })
})

describe("an AT machine's log", () => {
  test("is read back with how each reading's games ended, and made again as it was", () => {
    const log = atLog()
    expect(stepsOf(log).map((step) => (step.type === "at-reading" ? step.ended : step.type))).toEqual(["going", "cz-missed", "at", "kept", "going"])
    expect(withStepRevised(log, 0, stepsOf(log)[0] as Step)).toEqual({ ok: true, value: log })
  })

  test("drops an AT's result with the AT it told of, and counts the readings after on from the seat again", () => {
    const log = atLog()
    const revised = withStepRevised(log, 2, { type: "at-reading", input: { sinceAt: 610, outlay: 9000, replay: undefined, at: AT }, ended: "going", afterMissedAt: false })
    expect(revised).toEqual({ ok: false, error: { type: "counter-went-back", expectedAtLeast: 610, index: 4 } })
    const withoutLast = withStepRemoved(log, 4)
    const removed = withStepRemoved(withoutLast.ok ? withoutLast.value : log, 2)
    expect(removed.ok && removed.value.map((line) => [line.spins, line.event?.kind])).toEqual([
      [0, undefined],
      [100, undefined],
      [220, "cz-missed"],
    ])
  })
})
