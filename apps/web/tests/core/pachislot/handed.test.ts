import { describe, expect, test } from "bun:test"

import { mergeableSpan } from "../../../src/core/pachislot/merging"
import { checkpointForReading } from "../../../src/core/pachislot/reading"
import { withStepRevised } from "../../../src/core/pachislot/revision"
import type { Checkpoint } from "../../../src/core/play-log/checkpoint"
import { heldNowOf } from "../../../src/core/play-log/held-now"
import { checkpointsForReading } from "../../../src/core/play-log/live"

const AT = "2026-11-06T12:00:00.000+09:00"

const SEAT: Checkpoint = { spins: 0, outlay: 0, at: AT, held: 100, counter: { spins: 0, total: 1200, bonuses: {} } }

/** A bonus machine's log with each reading added in turn: the day's games and what was handed, the medals in hand where counted. */
const played = (readings: readonly { readonly total: number; readonly handed?: number; readonly held?: number }[]): readonly Checkpoint[] =>
  readings.reduce<readonly Checkpoint[]>(
    (log, each) => ((made) => (made.ok ? [...log, made.value] : log))(checkpointForReading(log, { bonuses: {}, outlay: undefined, replay: undefined, at: AT, ...each })),
    [SEAT],
  )

describe("medals handed at a pachislot reading", () => {
  test("move the hand from the next reading on where it is not counted, a count being the hand as the cabinet shows it", () => {
    expect(heldNowOf(played([{ total: 1300, handed: -60 }]))).toBe(40)
    expect(heldNowOf(played([{ total: 1300, handed: 500 }, { total: 1400, handed: -100 }]))).toBe(500)
    expect(heldNowOf(played([{ total: 1300, handed: 500, held: 900 }]))).toBe(900)
    expect(heldNowOf(played([{ total: 1300, handed: 500, held: 900 }, { total: 1400, handed: -200 }]))).toBe(700)
    expect(heldNowOf([{ spins: 0, at: AT }])).toBeUndefined()
  })

  test("are refused where more are handed away than are in hand, by either kind of machine", () => {
    const log = played([{ total: 1300 }])
    expect(checkpointForReading(log, { total: 1400, bonuses: {}, outlay: undefined, replay: undefined, handed: -101, at: AT })).toEqual({ ok: false, error: { type: "handed-beyond-hand", held: 100 } })
    expect(checkpointForReading(log, { total: 1400, bonuses: {}, outlay: undefined, replay: undefined, handed: -101, held: 0, at: AT }).ok).toBe(true)
    const at = checkpointsForReading([{ spins: 0, at: AT, held: 50, counter: { spins: 0 } }], { counterSpins: 30, outlay: undefined, replay: undefined, handed: -80, counterJackpots: undefined, at: AT, jackpot: false }, false)
    expect(at).toEqual({ ok: false, error: { type: "handed-beyond-hand", held: 50 } })
  })

  test("are set right with every line after them following, and refused where a later handing then outruns the hand", () => {
    const log = played([{ total: 1300, handed: -30 }, { total: 1400, handed: -50 }])
    const eased = withStepRevised(log, 0, { type: "reading", input: { total: 1300, bonuses: {}, outlay: undefined, replay: undefined, handed: -10, at: AT } })
    expect(eased.ok && heldNowOf(eased.value)).toBe(40)
    const overdone = withStepRevised(log, 0, { type: "reading", input: { total: 1300, bonuses: {}, outlay: undefined, replay: undefined, handed: -80, at: AT } })
    expect(overdone).toEqual({ ok: false, error: { type: "handed-beyond-hand", held: 20, index: 1 } })
  })

  test("keep their reading from being merged with another", () => {
    const log = played([{ total: 1300 }, { total: 1400, handed: -50 }, { total: 1500 }, { total: 1600 }])
    expect(mergeableSpan(log, 0, 3)).toEqual({ from: 0, to: 0 })
    expect(mergeableSpan(log, 2, 0)).toEqual({ from: 2, to: 2 })
    expect(mergeableSpan(log, 2, 3)).toEqual({ from: 2, to: 3 })
  })
})
