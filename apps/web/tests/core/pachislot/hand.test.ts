import { describe, expect, test } from "bun:test"

import { handOf, likelyHeldOf } from "../../../src/core/pachislot/hand"
import type { FormulaSnapshot } from "../../../src/core/pachislot/snapshot"
import { checkpointForReading } from "../../../src/core/pachislot/reading"
import { checkpointsForReading } from "../../../src/core/play-log/live"
import type { Checkpoint } from "../../../src/core/play-log/checkpoint"
import type { PlayTerms } from "../../../src/core/parlor/terms"

const TERMS: PlayTerms = { rental: { yen: 1000, tokens: 46 }, exchange: { tokens: 52, yen: 1000 }, replay: { paidOut: 1, deducted: 1 } }

const AT = "2026-10-26T10:00:00.000+09:00"

describe("the medals in hand where last counted, and what the play had come to there", () => {
  const seat: Checkpoint = { spins: 0, outlay: 0, at: AT, held: 100, counter: { spins: 0, total: 1200, bonuses: {} } }

  test("is nothing until medals are counted after the seat", () => {
    expect(handOf([seat], TERMS)).toBeUndefined()
  })

  test("takes off what was brought, rented and drawn from savings, and values the rest at the exchange less the cash", () => {
    const ordered = [seat, { spins: 500, outlay: 3000, replay: 200, held: 900, at: AT }]
    expect(handOf(ordered, TERMS)).toEqual({ games: 500, held: 900, net: 900 - 100 - 138 - 200, result: Math.round((600 * 1000) / 52 - 3000) })
  })

  test("stands at the last line that counted them, with the cash and savings as they were there", () => {
    const ordered = [seat, { spins: 300, outlay: 2000, held: 40, at: AT }, { spins: 600, outlay: 5000, at: AT }]
    expect(handOf(ordered, TERMS)).toMatchObject({ games: 300, held: 40, net: 40 - 100 - 92 })
  })

  test("gives the medals alone where the play has no terms", () => {
    expect(handOf([seat, { spins: 10, held: 50, at: AT }], undefined)).toEqual({ games: 10, held: 50, net: undefined, result: undefined })
  })

  test("is what a reading of either kind of machine writes", () => {
    const bonus = checkpointForReading([seat], { total: 1700, bonuses: {}, outlay: 1000, replay: undefined, held: 120, at: AT })
    expect(bonus.ok && bonus.value.held).toBe(120)
    const at = checkpointsForReading([{ spins: 0, at: AT, counter: { spins: 0 } }], { counterSpins: 50, outlay: undefined, replay: undefined, held: 75, counterJackpots: undefined, at: AT, jackpot: false }, false)
    expect(at.ok && at.value.at(-1)?.held).toBe(75)
  })
})

describe("the medals likely in hand at a play's last line", () => {
  const bonusMachine = {
    figures: [{ settingLevel: 1, payoutRate: 0.97, bonuses: [{ id: "big", label: "BIG", oneIn: 273 }, { id: "reg", label: "REG", oneIn: 439 }], combinedOneIn: 168 }],
    normalized: {
      schemaVersion: 1,
      bet: 3,
      tables: [{ settingLevel: 1, events: [{ id: "big", kind: { type: "bonus", payout: 252 }, chance: 1 / 273 }, { id: "reg", kind: { type: "bonus", payout: 96 }, chance: 1 / 439 }] }],
    },
  } as unknown as FormulaSnapshot
  const atMachine = {
    figures: [{ settingLevel: 1, payoutRate: 0.98, bonuses: [], combinedOneIn: 300, at: { gain: 400, completion: 0.1 } }],
    normalized: { schemaVersion: 1, bet: 3, tables: [], atRules: { base: 32, at: "at", modes: [] } },
  } as unknown as FormulaSnapshot

  test("is the count where the last line counted them", () => {
    const seat: Checkpoint = { spins: 0, at: AT, counter: { spins: 0, total: 0, bonuses: {} } }
    expect(likelyHeldOf([seat, { spins: 200, held: 333, at: AT }], bonusMachine, TERMS)).toBe(333)
  })

  test("adds to what was begun with the medals rented, each bonus won at what it gains, and the other games at the rest of the 機械割", () => {
    const seat: Checkpoint = { spins: 0, at: AT, counter: { spins: 0, total: 1000, bonuses: { big: 2, reg: 1 } } }
    const ordered: readonly Checkpoint[] = [seat, { spins: 600, outlay: 10000, at: AT, counter: { total: 1600, bonuses: { big: 3, reg: 2 } } }]
    const chance = 1 / 273 + 1 / 439
    const rest = (3 * (0.97 - 1) - (249 / 273 + 93 / 439)) / (1 - chance)
    expect(likelyHeldOf(ordered, bonusMachine, TERMS)).toBe(Math.round(460 + 249 + 93 + 598 * rest))
  })

  test("takes an AT at the medals its result says, or what an AT gains, and a regular game at its ベース, from the last count", () => {
    const ordered: readonly Checkpoint[] = [
      { spins: 0, at: AT, held: 50, counter: { spins: 0 } },
      { spins: 300, outlay: 6000, at: AT, event: { kind: "jackpot" } },
      { spins: 300, at: AT, event: { kind: "at-ended", medals: 620 } },
      { spins: 400, at: AT, event: { kind: "jackpot" } },
      { spins: 500, outlay: 8000, at: AT, counter: { spins: 100 } },
    ]
    expect(likelyHeldOf(ordered, atMachine, TERMS)).toBe(Math.round(50 + 368 + 620 + 400 - (500 * 50) / 32))
  })

  test("is never below none, and nothing without terms", () => {
    const ordered: readonly Checkpoint[] = [{ spins: 0, at: AT, counter: { spins: 0 } }, { spins: 2000, at: AT, counter: { spins: 2000 } }]
    expect(likelyHeldOf(ordered, atMachine, TERMS)).toBe(0)
    expect(likelyHeldOf(ordered, atMachine, undefined)).toBeUndefined()
  })
})
