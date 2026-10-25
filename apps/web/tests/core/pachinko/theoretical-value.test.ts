import { describe, expect, test } from "bun:test"

import type { PlayTerms } from "../../../src/core/parlor/terms"
import { consumptionOf } from "../../../src/core/pachinko/consumption"
import { checkpointsForReading, type Reading } from "../../../src/core/pachinko/reading"
import { playTheoreticalValue } from "../../../src/core/pachinko/theoretical-value"
import type { Checkpoint } from "../../../src/core/play-log/checkpoint"

/** A machine whose 等価 border is 18 spins for 1,000 balls: a spin wins 1000 / 18 balls. */
const FIGURES = { roundChanceOneIn: 100, payoutPerRound: 100_000 / 18, totalChanceOneIn: undefined, spinsPerHour: undefined }

const SAT_DOWN: Checkpoint = { spins: 0, outlay: 0, counter: { spins: 0, jackpots: 0 } }

const reading = (fields: Partial<Reading> & Pick<Reading, "counterSpins">): Reading => ({
  phase: "regular",
  rented: 0,
  replayed: 0,
  supported: 0,
  held: undefined,
  jackpot: { type: "none" },
  at: "2026-10-26T12:00:00.000Z",
  ...fields,
})

const played = (readings: readonly Reading[]): readonly Checkpoint[] =>
  readings.reduce<readonly Checkpoint[]>((log, each) => {
    const added = checkpointsForReading(log, each, false)
    return added.ok ? [...log, ...added.value] : log
  }, [SAT_DOWN])

const oneYen = (rentedPerThousand: number, exchangedPerThousand: number): PlayTerms => ({
  rental: { yen: 1000, tokens: rentedPerThousand },
  exchange: { yen: 1000, tokens: exchangedPerThousand },
  replay: { paidOut: 1000, deducted: 1000 },
})

/** 20 spins for every 1,000 balls, ¥10,000 of them rented for cash or 10,000 drawn from savings at a time. */
const figuresOf = (terms: PlayTerms, how: "rented" | "replayed") => {
  const balls = how === "rented" ? (10_000 * terms.rental.tokens) / terms.rental.yen : 10_000
  const fields = how === "rented" ? { rented: 10_000 } : { replayed: 10_000 }
  const log = played([reading({ counterSpins: balls / 50, ...fields }), reading({ counterSpins: (balls / 50) * 2, ...fields })])
  const value = playTheoreticalValue(FIGURES, terms, consumptionOf(log, terms))
  return { spinPerformance: Number(value?.spinPerformance.toFixed(2)), border: Number(value?.border.toFixed(2)) }
}

describe("a 1-yen play's spin performance and border, counted for each ¥1,000 paid", () => {
  test("is 20 against 18 at 等価", () => {
    expect(figuresOf(oneYen(1000, 1000), "rented")).toEqual({ spinPerformance: 20, border: 18 })
  })

  test("is fewer spins against the same border where ¥1,000 rents 890 balls", () => {
    expect(figuresOf(oneYen(890, 1000), "rented")).toEqual({ spinPerformance: 17.8, border: 18 })
  })

  test("is the same spins against a higher border where ¥100 of prizes takes 112 balls", () => {
    expect(figuresOf(oneYen(1000, 1120), "rented")).toEqual({ spinPerformance: 20, border: 20.16 })
  })

  test("is set against a border lowered for balls drawn from savings, which cost what they exchange for", () => {
    expect(figuresOf(oneYen(890, 1000), "replayed")).toEqual({ spinPerformance: 17.8, border: 16.02 })
    expect(figuresOf(oneYen(1000, 1120), "replayed")).toEqual({ spinPerformance: 20, border: 18 })
  })
})
