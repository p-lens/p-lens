import { describe, expect, test } from "bun:test"

import { consumptionOf } from "../../../src/core/pachinko/consumption"
import { withReadingsMerged } from "../../../src/core/pachinko/merging"
import { checkpointsForRapid, checkpointsForReading, inReliefDrive, supportPhaseOf, type Reading } from "../../../src/core/pachinko/reading"
import { gaugeNowOf, reliefDriveCounter, standingBefore, takenOf, withReadingRevised } from "../../../src/core/pachinko/revision"
import type { PlayTerms } from "../../../src/core/parlor/terms"
import type { Checkpoint } from "../../../src/core/play-log/checkpoint"
import { bonusKey, formOfReading, readingFrom, readReadingForm, readReliefDrive, readRunJackpot, readSupportEnd, saysNothingNew } from "../../../src/ui/features/pachinko/live/reading-form"
import { EVERY_JACKPOT } from "../../../src/core/play-log/live"

const TEN_ROUNDS = { name: "10R確変", payout: 1500, spent: 100 }

const LOG: readonly Checkpoint[] = [
  { spins: 0, outlay: 0, counter: { spins: 120 } },
  { spins: 80, outlay: 2000, counter: { spins: 200 }, phase: "regular", held: 150 },
  { spins: 180, outlay: 3000, replay: 125, counter: { spins: 300 }, phase: "regular", event: { kind: "jackpot", bonus: TEN_ROUNDS } },
]

describe("where a pachinko play stood before a reading", () => {
  test("is the seat before the first, and after them all the totals, the last count of the hand with what the bonuses since paid, and a counter a jackpot started over", () => {
    expect(standingBefore(LOG, 0, EVERY_JACKPOT)).toEqual({ counter: 120, held: undefined, outlay: 0, replay: 0, gaugeOffset: undefined })
    expect(standingBefore(LOG, 1, EVERY_JACKPOT)).toEqual({ counter: 200, held: 150, outlay: 2000, replay: 0, gaugeOffset: undefined })
    expect(standingBefore(LOG, 2, EVERY_JACKPOT)).toEqual({ counter: 0, held: 1550, outlay: 3000, replay: 125, gaugeOffset: undefined })
  })

  test("never takes the regular games played since off the hand, and starts from none where a bonus comes before any count", () => {
    const spun: readonly Checkpoint[] = [...LOG.slice(0, 2), { spins: 150, outlay: 2000, counter: { spins: 270 }, phase: "regular" }]
    expect(standingBefore(spun, 2, EVERY_JACKPOT).held).toBe(150)
    const uncounted: readonly Checkpoint[] = [LOG[0] as Checkpoint, { spins: 100, outlay: 3000, counter: { spins: 220 }, phase: "regular", event: { kind: "jackpot", bonus: TEN_ROUNDS } }]
    expect(standingBefore(uncounted, 1, EVERY_JACKPOT).held).toBe(1400)
  })
})

describe("a pachinko reading typed onto where the play stands", () => {
  const before = standingBefore(LOG, 1, EVERY_JACKPOT)
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

describe("the 遊 counter of a pachinko reading set right", () => {
  const before = standingBefore(LOG, 1, EVERY_JACKPOT)

  test("is never typed into a new reading, and is kept as it was where a reading set right said it", () => {
    const fresh = readReadingForm(readingFrom("regular", before), [], before)
    expect(fresh.ok && fresh.value.gauge).toBeUndefined()
    const said = formOfReading({ counterSpins: 200, phase: "regular", rented: 0, replayed: 0, supported: 0, held: undefined, jackpot: { type: "none" }, at: "", gauge: 15 }, before)
    const read = readReadingForm(said, [], before)
    expect(read.ok && read.value.gauge).toBe(15)
  })
})

describe("a pachinko reading made of several, set right", () => {
  const TERMS: PlayTerms = { rental: { yen: 1000, tokens: 250 }, exchange: { yen: 100, tokens: 28 }, replay: { paidOut: 125, deducted: 125 } }
  const reading = (fields: Partial<Reading> & Pick<Reading, "counterSpins">): Reading => ({ phase: "regular", rented: 0, replayed: 0, supported: 0, held: undefined, jackpot: { type: "none" }, at: "2026-10-18T12:00:00.000Z", ...fields })
  const played = [reading({ counterSpins: 100, rented: 2000 }), reading({ counterSpins: 150, held: 120 }), reading({ counterSpins: 200 })].reduce<readonly Checkpoint[]>(
    (log, each) => ((added) => (added.ok ? [...log, ...added.value] : log))(checkpointsForReading(log, each, false, EVERY_JACKPOT)),
    [{ spins: 0, outlay: 0, counter: { spins: 0 } }],
  )
  const merged = ((made) => (made.ok ? made.value : []))(withReadingsMerged(played, { from: 0, to: 2 }, EVERY_JACKPOT))
  const before = standingBefore(merged, 0, EVERY_JACKPOT)
  const taken = takenOf(merged)[0]
  const resaved = (change: (form: ReturnType<typeof formOfReading>) => ReturnType<typeof formOfReading>): readonly Checkpoint[] => {
    if (taken === undefined) return []
    const read = readReadingForm(change(formOfReading(taken.reading, before)), [], before)
    const revised = read.ok ? withReadingRevised(merged, 0, { ...read.value, at: taken.reading.at }, EVERY_JACKPOT) : undefined
    return revised?.ok === true ? revised.value : []
  }

  test("keeps where it knew the hand inside it, so it is measured and told as before", () => {
    const kept = resaved((form) => form)
    expect(consumptionOf(kept, TERMS, undefined).measured).toEqual(consumptionOf(merged, TERMS, undefined).measured)
    expect(standingBefore(kept, 1, EVERY_JACKPOT).held).toBe(120)
  })

  test("lets go of a hand inside it further on than the counter it is set right to", () => {
    const kept = resaved((form) => ({ ...form, counter: "140" }))
    expect(takenOf(kept)[0]?.reading.handsBefore?.some((hand) => hand.counterSpins > 140)).not.toBe(true)
  })
})

describe("the 電サポ after a pachinko jackpot", () => {
  const before = standingBefore(LOG, takenOf(LOG).length, EVERY_JACKPOT)
  const form = readingFrom("special", before)

  test("runs in 確変 from a jackpot until a line with none says it ended", () => {
    expect(supportPhaseOf(LOG.slice(0, 2))).toBeUndefined()
    expect(supportPhaseOf(LOG)).toBe("special")
    const ended = checkpointsForReading(LOG, { counterSpins: 12, phase: "special", rented: 0, replayed: 0, supported: 0, held: undefined, jackpot: { type: "none" }, at: "2026-10-24T12:00:00+09:00" }, false, EVERY_JACKPOT)
    expect(ended.ok && supportPhaseOf([...LOG, ...ended.value])).toBeUndefined()
  })

  test("turns to 時短 once, on the jackpot's spins, and never from regular games or 時短", () => {
    const turned = checkpointsForRapid(LOG, "2026-10-24T12:00:00+09:00", EVERY_JACKPOT)
    expect(turned.ok && turned.value.map((line) => [line.spins, line.phase, line.event?.kind])).toEqual([[180, "special", "rapid-began"]])
    const after = turned.ok ? [...LOG, ...turned.value] : LOG
    expect(supportPhaseOf(after)).toBe("rapid")
    expect(checkpointsForRapid(after, "2026-10-24T12:01:00+09:00", EVERY_JACKPOT)).toEqual({ ok: false, error: { type: "not-in-special" } })
    expect(checkpointsForRapid(LOG.slice(0, 2), "2026-10-24T12:01:00+09:00", EVERY_JACKPOT)).toEqual({ ok: false, error: { type: "not-in-special" } })
    const revised = withReadingRevised(after, takenOf(after).length - 1, takenOf(after).at(-1)?.reading as Reading, EVERY_JACKPOT)
    expect(revised.ok && supportPhaseOf(revised.value)).toBe("rapid")
  })

  test("takes a jackpot of the run at the counter where it stood, in the state the bar says, with nothing else", () => {
    const read = readRunJackpot({ ...form, jackpot: bonusKey(TEN_ROUNDS.name), counter: "999", rented: "9000" }, [TEN_ROUNDS], before, "rapid")
    expect(read.ok && [read.value.counterSpins, read.value.phase, read.value.rented, read.value.held, read.value.jackpot.type]).toEqual([0, "rapid", 0, undefined, "bonus"])
    const run = read.ok ? checkpointsForReading(LOG, { ...read.value, at: "2026-10-24T12:00:00+09:00" }, false, EVERY_JACKPOT) : undefined
    expect(run?.ok && run.value.map((line) => [line.spins, line.phase, line.event?.kind])).toEqual([[180, "rapid", "jackpot"]])
  })

  test("asks the counter as it ends, and takes nought, the hand where counted but not the guide left as it is, and what drifted", () => {
    expect(readSupportEnd({ ...form, counter: "" }, before, "special", false)).toEqual({ ok: false, error: [{ field: "counter", reason: "required" }] })
    const single = readSupportEnd({ ...form, counter: "0", held: "", heldCarried: false }, before, "special", false)
    expect(single.ok && [single.value.counterSpins, single.value.held]).toEqual([0, undefined])
    const guided = readSupportEnd({ ...form, counter: "100", held: "1550", heldCarried: true }, before, "special", false)
    expect(guided.ok && guided.value.held).toBeUndefined()
    const read = readSupportEnd({ ...form, counter: "100", held: "1800", heldCarried: false, supported: "40", drift: "loss" }, before, "rapid", false)
    expect(read.ok && [read.value.counterSpins, read.value.phase, read.value.held, read.value.supported]).toEqual([100, "rapid", 1800, -40])
  })
})

describe("the 遊タイム reached in pachinko regular games", () => {
  const regular = LOG.slice(0, 2)
  const before = standingBefore(regular, takenOf(regular).length, EVERY_JACKPOT)
  const form = readingFrom("regular", before)
  const at = "2026-10-24T12:00:00+09:00"

  test("is read at the counter where it comes, where the counter was left as it stood, and at the counter typed otherwise", () => {
    const left = readReliefDrive(form, [], before, reliefDriveCounter(500, before))
    expect(left.ok && [left.value.counterSpins, left.value.phase, left.value.rapidBegan]).toEqual([500, "regular", true])
    const typed = readReliefDrive({ ...form, counter: "480" }, [], before, reliefDriveCounter(500, before))
    expect(typed.ok && typed.value.counterSpins).toBe(480)
  })

  test("turns the cabinet to 時短 as its 遊タイム, and run out leaves the 遊 counter at nought while the data counter goes on", () => {
    const read = readReliefDrive(form, [], before, 500)
    const reached = read.ok ? checkpointsForReading(regular, { ...read.value, at }, false, EVERY_JACKPOT) : undefined
    const entered = reached?.ok ? [...regular, ...reached.value] : regular
    expect(entered.at(-1)).toMatchObject({ spins: 380, phase: "regular", event: { kind: "rapid-began" } })
    expect([supportPhaseOf(entered), inReliefDrive(entered)]).toEqual(["rapid", true])
    const end = readSupportEnd({ ...readingFrom("rapid", standingBefore(entered, takenOf(entered).length, EVERY_JACKPOT)), counter: "600" }, standingBefore(entered, takenOf(entered).length, EVERY_JACKPOT), "rapid", true)
    const ended = end.ok ? checkpointsForReading(entered, { ...end.value, at }, false, EVERY_JACKPOT) : undefined
    const after = ended?.ok ? [...entered, ...ended.value] : entered
    expect(after.at(-1)).toMatchObject({ spins: 480, phase: "rapid", counter: { spins: 600, gauge: 0 } })
    expect([supportPhaseOf(after), gaugeNowOf(after, EVERY_JACKPOT)]).toEqual([undefined, 0])
  })
})
