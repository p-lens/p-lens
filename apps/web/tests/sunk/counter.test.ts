import { describe, expect, test } from "bun:test"

import { askedOf, keyOf, type Typed } from "../../src/sunk/core/counter"
import { doneShareOf, readingOf, spreadOf } from "../../src/sunk/core/reading"
import { burstOf, busyWordAt, delayOf, LEAST_RUN_MILLIS, lingers, shownShareOf, shownTrialsOf, stepsOf } from "../../src/sunk/core/theatre"

const typed = (overrides: Partial<Typed>): Typed => ({ spins: "4100", jackpots: "0", sinceLast: "", spinPerformance: "17.0", ...overrides })

describe("a counter as typed", () => {
  test("of no jackpot is its spins since the last too: left empty, typed as 0 beside the 0, or typed the same, and nothing else", () => {
    expect(askedOf(typed({}))).toEqual({ ok: true, value: { counter: { spins: 4100, jackpots: 0, sinceLast: 4100 }, spinPerformance: 17 } })
    expect(askedOf(typed({ sinceLast: "4100" }))).toEqual({ ok: true, value: { counter: { spins: 4100, jackpots: 0, sinceLast: 4100 }, spinPerformance: 17 } })
    expect(askedOf(typed({ sinceLast: "0" }))).toEqual({ ok: true, value: { counter: { spins: 4100, jackpots: 0, sinceLast: 4100 }, spinPerformance: 17 } })
    expect(askedOf(typed({ sinceLast: "12" }))).toEqual({ ok: false, error: { type: "since-not-spins" } })
  })

  test("of jackpots goes without the spins since the last where they were not read", () => {
    expect(askedOf(typed({ jackpots: "3" }))).toEqual({ ok: true, value: { counter: { spins: 4100, jackpots: 3, sinceLast: undefined }, spinPerformance: 17 } })
    expect(askedOf(typed({ jackpots: "３", sinceLast: "１,２００", spins: "５,０００" }))).toEqual({ ok: true, value: { counter: { spins: 5000, jackpots: 3, sinceLast: 1200 }, spinPerformance: 17 } })
  })

  test("says the first figure that cannot be played out", () => {
    expect(askedOf(typed({ spins: "" }))).toEqual({ ok: false, error: { type: "spins" } })
    expect(askedOf(typed({ spins: "0" }))).toEqual({ ok: false, error: { type: "spins" } })
    expect(askedOf(typed({ jackpots: "1.5" }))).toEqual({ ok: false, error: { type: "jackpots" } })
    expect(askedOf(typed({ jackpots: "2", sinceLast: "-1" }))).toEqual({ ok: false, error: { type: "since-last" } })
    expect(askedOf(typed({ jackpots: "2", sinceLast: "4101" }))).toEqual({ ok: false, error: { type: "since-past-spins" } })
    expect(askedOf(typed({ spinPerformance: "0" }))).toEqual({ ok: false, error: { type: "spin-performance" } })
  })

  test("is played out from its figures alone, so the same counter comes out the same", () => {
    const asked = askedOf(typed({ jackpots: "2", sinceLast: "300" }))
    if (!asked.ok) throw new Error("asked")
    expect(keyOf("formula-1", asked.value)).toBe("formula-1|4100|2|300|17")
  })
})

describe("what a run says", () => {
  const summary = { trials: 1_000_000, planned: 3_000_000, matched: 0, finished: false, way: "searched" } as const
  const outlay = { low: 100_000, lower: 150_000, middle: 200_000, upper: 250_000, high: 300_000, mean: 201_000 }

  test("is no day matched until one has", () => {
    expect(readingOf(summary, 600)).toEqual({ type: "unmatched", played: 1_000_000, over: false })
  })

  test("of a dry day is known from the start, with how seldom such a spell comes", () => {
    expect(readingOf({ ...summary, trials: 0, way: "dry", dryOneIn: 378_899, outlay }, 4100)).toEqual({ type: "outlay", outlay, rough: false, rarity: { type: "dry", spins: 4100, oneIn: 378_899 } })
  })

  test("is rough while few days matched, and says how seldom a searched day comes", () => {
    expect(readingOf({ ...summary, matched: 20, outlay }, 600)).toEqual({ type: "outlay", outlay, rough: true, rarity: { type: "day", oneIn: 50_000 } })
    expect(readingOf({ ...summary, matched: 2_000, outlay }, 600)).toEqual({ type: "outlay", outlay, rough: false, rarity: { type: "day", oneIn: 500 } })
  })

  test("of pinned days says only the dry spell, their matching telling nothing of how seldom the day comes", () => {
    expect(readingOf({ ...summary, way: "pinned", matched: 2_000, dryOneIn: 7, outlay }, 600)).toEqual({ type: "outlay", outlay, rough: false, rarity: { type: "dry", spins: 600, oneIn: 7 } })
  })
})

describe("a dry day worked out", () => {
  test("bursts through as many as it did one by one, but no more than it can show", () => {
    expect(burstOf(3)).toEqual([1, 2, 3])
    expect(burstOf(4100, 4)).toEqual([1025, 2050, 3075, 4100])
  })

  test("reads the counter a digit at a time and presses for each lot, and then, apart, works out the spell's rarity", () => {
    const steps = stepsOf({ spins: 4100, spinPerformance: 18.6, outlay: 220_500, hitChance: 1 / 319.7 })
    expect(steps.filter((step) => step.type === "digit").map((step) => (step.type === "digit" ? step.digit : ""))).toEqual(["4", "1", "0", "0"])
    expect(steps.find((step) => step.type === "decimal-point")).toEqual({ type: "decimal-point", at: 3 })
    expect(steps.filter((step) => step.type === "pressed").at(-1)).toEqual({ type: "pressed", times: 441 })
    expect(steps.filter((step) => step.type === "multiplied")).toEqual([{ type: "multiplied", spins: 4100 }])
    const at = (type: string): number => steps.findIndex((step) => step.type === type)
    expect(at("zero-added") < at("pressed") && at("pressed") < at("outlay-done") && at("outlay-done") < at("rarity-begun") && at("rarity-begun") < at("miss-chance")).toBe(true)
    expect(steps.at(-1)).toEqual({ type: "multiplied", spins: 4100 })
  })

  test("rattles through the cash in two seconds, and lingers half a second on each step of the rarity", () => {
    const steps = stepsOf({ spins: 4100, spinPerformance: 18.6, outlay: 220_500, hitChance: 1 / 319.7 })
    const rattled = steps.filter((step) => !lingers(step)).reduce((sum, step) => sum + delayOf(step, steps), 0)
    expect(Math.round(rattled)).toBe(2000)
    expect(steps.filter(lingers).map((step) => delayOf(step, steps))).toEqual([500, 500, 500])
    expect(steps.findIndex(lingers)).toBe(steps.findIndex((step) => step.type === "rarity-begun"))
  })
})

describe("how a run is shown", () => {
  const summary = { trials: 180_000, planned: 3_000_000, matched: 10_000, finished: false, way: "pinned" } as const

  test("goes as far as it is toward its most days or enough matches, whichever is nearer", () => {
    expect(doneShareOf(undefined)).toBe(0)
    expect(doneShareOf(summary)).toBe(0.5)
    expect(doneShareOf({ ...summary, finished: true })).toBe(1)
  })

  test("goes on over a few seconds while a run found in a blink idles, and no faster than the run where it is slower", () => {
    expect(shownShareOf(1, LEAST_RUN_MILLIS / 4)).toBe(0.25)
    expect(shownShareOf(1, LEAST_RUN_MILLIS)).toBe(1)
    expect(shownShareOf(0.1, LEAST_RUN_MILLIS / 2)).toBe(0.1)
  })

  test("counts its days over again from none once it has ended in a blink, back to them as its time is up", () => {
    const run = { startedAt: 0, endedAt: 250 }
    expect(shownTrialsOf(180_000, { startedAt: 0, endedAt: undefined }, 100)).toBe(180_000)
    expect(shownTrialsOf(180_000, run, 250)).toBe(0)
    expect(shownTrialsOf(180_000, run, 250 + (LEAST_RUN_MILLIS - 250) / 2)).toBe(90_000)
    expect(shownTrialsOf(180_000, run, LEAST_RUN_MILLIS)).toBe(180_000)
    expect(shownTrialsOf(180_000, { startedAt: 0, endedAt: LEAST_RUN_MILLIS + 1 }, LEAST_RUN_MILLIS + 1)).toBe(180_000)
  })

  test("says its words in turn, round and round", () => {
    expect([0, 799, 800, 1_600, 16_000].map((at) => busyWordAt(at, 20))).toEqual([0, 0, 1, 2, 0])
  })

  test("spreads what the days took once where the middle half is as wide as the middle eight tenths, and not at all where they took the same", () => {
    const outlay = { low: 90_500, lower: 90_500, middle: 90_500, upper: 95_000, high: 95_000, mean: 91_000 }
    expect(spreadOf(outlay)).toEqual({ type: "one", low: 90_500, high: 95_000 })
    expect(spreadOf({ ...outlay, high: 99_500 })).toEqual({ type: "two", outlay: { ...outlay, high: 99_500 } })
    expect(spreadOf({ ...outlay, upper: 90_500, high: 90_500 })).toEqual({ type: "none" })
  })
})
