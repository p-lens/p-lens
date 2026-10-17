import { describe, expect, test } from "bun:test"

import { standingBefore } from "../../../src/core/pachinko/revision"
import type { Checkpoint } from "../../../src/core/play-log/checkpoint"
import { formOfReading, readingFrom, readReadingForm, saysNothingNew } from "../../../src/ui/features/pachinko/live/reading-form"

const TEN_ROUNDS = { name: "10R確変", payout: 1500, spent: 100 }

const LOG: readonly Checkpoint[] = [
  { spins: 0, outlay: 0, counter: { spins: 120 } },
  { spins: 80, outlay: 2000, counter: { spins: 200 }, phase: "regular", held: 150 },
  { spins: 180, outlay: 3000, replay: 125, counter: { spins: 300 }, phase: "regular", event: { kind: "jackpot", bonus: TEN_ROUNDS } },
]

describe("where a pachinko play stood before a reading", () => {
  test("is the seat before the first, and after them all the totals, the last count of the hand with what the bonuses since paid, and a counter a jackpot started over", () => {
    expect(standingBefore(LOG, 0)).toEqual({ counter: 120, held: undefined, outlay: 0, replay: 0 })
    expect(standingBefore(LOG, 1)).toEqual({ counter: 200, held: 150, outlay: 2000, replay: 0 })
    expect(standingBefore(LOG, 2)).toEqual({ counter: 0, held: 1550, outlay: 3000, replay: 125 })
  })

  test("never takes the regular games played since off the hand, and starts from none where a bonus comes before any count", () => {
    const spun: readonly Checkpoint[] = [...LOG.slice(0, 2), { spins: 150, outlay: 2000, counter: { spins: 270 }, phase: "regular" }]
    expect(standingBefore(spun, 2).held).toBe(150)
    const uncounted: readonly Checkpoint[] = [LOG[0] as Checkpoint, { spins: 100, outlay: 3000, counter: { spins: 220 }, phase: "regular", event: { kind: "jackpot", bonus: TEN_ROUNDS } }]
    expect(standingBefore(uncounted, 1).held).toBe(1400)
  })
})

describe("a pachinko reading typed onto where the play stands", () => {
  const before = standingBefore(LOG, 1)
  const form = readingFrom("regular", before)

  test("opens on the counter, the hand as last counted and the totals so far", () => {
    expect([form.counter, form.held, form.rented, form.replayed]).toEqual(["200", "150", "2000", ""])
  })

  test("says nothing new until something is changed, and the hand carried over is not counted again", () => {
    const read = readReadingForm(form, [], before)
    expect(read.ok && saysNothingNew(read.value, before)).toBe(true)
    expect(read.ok && read.value.held).toBeUndefined()
  })

  test("reads the totals added to as what was rented and drawn since, and a hand typed as counted", () => {
    const read = readReadingForm({ ...form, counter: "260", rented: "3000", replayed: "125", held: "40", heldCarried: false }, [], before)
    expect(read.ok && [read.value.counterSpins, read.value.rented, read.value.replayed, read.value.held]).toEqual([260, 1000, 125, 40])
    expect(read.ok && saysNothingNew(read.value, before)).toBe(false)
  })

  test("refuses a total behind where the play stood, and takes one left empty as unchanged", () => {
    expect(readReadingForm({ ...form, rented: "1500" }, [], before)).toEqual({ ok: false, error: [{ field: "rented", reason: "went-back" }] })
    const read = readReadingForm({ ...form, counter: "210", rented: "" }, [], before)
    expect(read.ok && read.value.rented).toBe(0)
  })

  test("shows a reading being set right as the play stood with it, and reads it back the same", () => {
    const reading = { counterSpins: 300, phase: "regular" as const, rented: 1000, replayed: 125, supported: 0, held: undefined, jackpot: { type: "bonus" as const, bonus: TEN_ROUNDS }, at: "" }
    const shown = formOfReading(reading, before)
    expect([shown.rented, shown.replayed]).toEqual(["3000", "125"])
    const read = readReadingForm(shown, [TEN_ROUNDS], before)
    expect(read.ok && { ...read.value, at: "" }).toEqual(reading)
  })
})
