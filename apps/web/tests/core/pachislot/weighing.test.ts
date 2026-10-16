import { describe, expect, test } from "bun:test"

import type { NormalizedSpecDto } from "@p-lens/contracts/pachislot"
import normalized from "@p-lens/contracts/fixtures/pachislot/made-up/normalized.json"

import type { FormulaListing } from "../../../src/core/formula/standing"
import type { MachineId } from "../../../src/core/machine/machine"
import type { FormulaId, SettingDistribution, SettingDistributionId } from "../../../src/core/pachislot/formula"
import type { FormulaSnapshot } from "../../../src/core/pachislot/snapshot"
import { priorFor, selectPrior, STOCK_SPREADS, stockSharesOf, type Prior } from "../../../src/core/pachislot/prior"
import {
  checkpointForReading,
  countCheckpoint,
  countedGamesOf,
  seatCheckpoint,
  totalNowOf,
} from "../../../src/core/pachislot/reading"
import { counterBonusesOf, counterBonusOf, countablesOf, countedOutOf, GAMES_PER_HOUR, huntPlayOf, playOf, settingLevelsOf } from "../../../src/core/pachislot/weighing"
import { tokenValueOf, type PlayTerms } from "../../../src/core/parlor/terms"
import type { Checkpoint } from "../../../src/core/play-log/checkpoint"

const spec: NormalizedSpecDto = normalized as NormalizedSpecDto

const formula: FormulaSnapshot = {
  id: "f" as FormulaId,
  machineId: "m" as MachineId,
  kind: "simulated",
  figures: [1, 6].map((settingLevel) => ({
    settingLevel,
    payoutRate: 1,
    bonuses: [
      { id: "big", label: "BIG", oneIn: 250 },
      { id: "reg", label: "REG", oneIn: 400 },
    ],
    combinedOneIn: 153.8,
  })),
  normalized: spec,
  conditions: { payoutRate: { type: "from-spec" } },
  labels: { big: "BIG", reg: "REG", "reg-solo": "単独REG", "reg-cherry": "チェリー重複REG", grape: "ブドウ", cherry: "チェリー", replay: "リプレイ" },
}

const weekday: Prior = {
  type: "distribution",
  id: "d" as SettingDistributionId,
  label: "平日",
  shares: [
    { settingLevel: 1, basisPoints: 4000 },
    { settingLevel: 2, basisPoints: 3000 },
    { settingLevel: 3, basisPoints: 1500 },
    { settingLevel: 4, basisPoints: 1000 },
    { settingLevel: 5, basisPoints: 400 },
    { settingLevel: 6, basisPoints: 100 },
  ],
}

describe("a pachislot prior", () => {
  test("an even spread is left to the engine", () => {
    expect(priorFor({ type: "even" }, [1, 6])).toEqual({ ok: true, value: undefined })
  })

  test("a 設定配分 is cut to the formula's setting levels and scaled back up to exactly 100%", () => {
    expect(priorFor(weekday, [1, 6])).toEqual({
      ok: true,
      value: {
        shares: [
          { settingLevel: 1, value: 9756 },
          { settingLevel: 6, value: 244 },
        ],
      },
    })
    expect(priorFor(weekday, [1, 2, 3, 4, 5, 6])).toEqual({
      ok: true,
      value: { shares: weekday.shares.map((share) => ({ settingLevel: share.settingLevel, value: share.basisPoints })) },
    })
  })

  test("a level the 設定配分 does not name has no share, and one naming none of the formula's is refused", () => {
    expect(priorFor(weekday, [1, 7])).toEqual({
      ok: true,
      value: {
        shares: [
          { settingLevel: 1, value: 10_000 },
          { settingLevel: 7, value: 0 },
        ],
      },
    })
    expect(priorFor(weekday, [7, 8])).toEqual({ ok: false, error: { type: "prior-rules-out-every-setting-level", prior: weekday } })
  })
})

describe("choosing a play's prior", () => {
  const listing = (id: string, adoptions: number): FormulaListing<SettingDistribution> => ({
    formula: { id: id as SettingDistributionId, machineId: "m" as MachineId, label: id, shares: [], derivedFrom: undefined, createdAt: "2026-10-05T00:00:00Z" },
    standing: { verifications: 0, refutations: 0, adoptions, rejections: 0, favorites: 0, uses: 0 },
  })

  test("has stock spreads for any machine, each a whole over levels 1 to 6 that rules none out, the harshest first", () => {
    const spreads = STOCK_SPREADS.map((key) => stockSharesOf(key))
    expect(STOCK_SPREADS.length).toBeGreaterThanOrEqual(10)
    expect(spreads.map((shares) => shares.reduce((sum, share) => sum + share.basisPoints, 0))).toEqual(STOCK_SPREADS.map(() => 10_000))
    expect(spreads.every((shares) => shares.map((share) => share.settingLevel).join() === "1,2,3,4,5,6" && shares.every((share) => share.basisPoints > 0))).toBe(true)
    const average = (key: (typeof STOCK_SPREADS)[number]): number => stockSharesOf(key).reduce((sum, share) => sum + share.settingLevel * share.basisPoints, 0) / 10_000
    expect(STOCK_SPREADS.every((key) => average(key) >= average("collecting"))).toBe(true)
    expect(average("collecting")).toBeLessThan(1.3)
    expect([average("ordinary-harsh"), average("ordinary")].every((level) => level > 1.2 && level < 1.7)).toBe(true)
    expect(priorFor({ type: "stock", key: "collecting", shares: stockSharesOf("collecting") }, [1, 6])).toEqual({ ok: true, value: { shares: [{ settingLevel: 1, value: 9976 }, { settingLevel: 6, value: 24 }] } })
    expect(selectPrior([], { type: "stock", key: "event" }, new Set())).toEqual({ prior: { type: "stock", key: "event", shares: stockSharesOf("event") }, by: "person" })
    expect(selectPrior([], { type: "stock", key: "no such spread" }, new Set()).by).toBe("default")
  })

  test("is the harshest stock spread by default, however well a 設定配分 ranks", () => {
    expect(selectPrior([listing("weekday", 12)], undefined, new Set())).toEqual({ prior: { type: "stock", key: "ordinary", shares: stockSharesOf("ordinary") }, by: "default" })
  })

  test("is the favourite when one is kept, and what was chosen by hand over either", () => {
    const listings = [listing("weekday", 12), listing("event", 0)]
    const kept = new Set(["event"])
    expect(selectPrior(listings, undefined, kept)).toMatchObject({ prior: { type: "distribution", id: "event" }, by: "favorite" })
    expect(selectPrior(listings, { type: "distribution", id: "weekday" as SettingDistributionId }, kept)).toMatchObject({ prior: { id: "weekday" }, by: "person" })
    expect(selectPrior(listings, { type: "even" }, kept)).toEqual({ prior: { type: "even" }, by: "person" })
  })
})

describe("a pachislot formula at the cabinet", () => {
  test("the counter shows a part as its bonus, and no small win at all", () => {
    const shownAs = counterBonusOf(spec)
    expect(["big", "reg", "reg-solo", "reg-cherry", "grape", "replay"].map(shownAs)).toEqual(["big", "reg", "reg", "reg", undefined, undefined])
  })

  test("everything a game comes to is a tile to count, a split bonus part by part", () => {
    expect(countablesOf(formula).map((countable) => countable.label)).toEqual(["BIG", "単独REG", "チェリー重複REG", "ブドウ", "チェリー", "リプレイ"])
    expect(counterBonusesOf(formula).map((bonus) => bonus.id)).toEqual(["big", "reg"])
    expect(settingLevelsOf(formula)).toEqual([1, 6])
  })

  test("the share played from cash is the outlay in medals over the medals played, or what the machine leaves short before that is known", () => {
    const terms: PlayTerms = { rental: { yen: 1000, tokens: 46 }, exchange: { tokens: 50, yen: 1000 }, replay: { paidOut: 1, deducted: 1 } }
    const play = { bet: 3, games: 100, outlay: 1000, replay: undefined, payoutRate: 0.97 }
    expect(playOf(terms, play)).toEqual({ medalValue: 20, rentalPrice: 1000 / 46, cashShare: 46 / 300, replayShare: 0, replayRate: 1, gamesPerHour: GAMES_PER_HOUR })
    expect(playOf(terms, { ...play, outlay: 10_000 })?.cashShare).toBe(1)
    expect(playOf(terms, { ...play, games: 0 })?.cashShare).toBeCloseTo(0.03, 12)
    expect(playOf(terms, { ...play, outlay: undefined, payoutRate: 1.05 })?.cashShare).toBe(0)
    expect(playOf(undefined, play)).toBeUndefined()
  })

  test("the share drawn from savings is the medals drawn over the medals played, after the rented, at the medals a replay takes for each it pays out", () => {
    const terms: PlayTerms = { rental: { yen: 1000, tokens: 46 }, exchange: { tokens: 50, yen: 1000 }, replay: { paidOut: 100, deducted: 110 } }
    const play = { bet: 3, games: 100, outlay: 1000, replay: 60, payoutRate: 0.97 }
    expect(playOf(terms, play)).toMatchObject({ cashShare: 46 / 300, replayShare: 60 / 300, replayRate: 1.1 })
    expect(playOf(terms, { ...play, outlay: 10_000 })).toMatchObject({ cashShare: 1, replayShare: 0 })
    expect(playOf(terms, { ...play, outlay: undefined, replay: 3 })?.cashShare).toBeCloseTo(0.02, 12)
    expect(playOf(terms, { ...play, outlay: undefined, replay: 30 })).toMatchObject({ cashShare: 0, replayShare: 0.1 })
  })
})

describe("readings of a pachislot data counter", () => {
  const at = "2026-10-05T10:00:00.000Z"
  const seated: readonly Checkpoint[] = [seatCheckpoint({ total: 2400, bonuses: { big: 9, reg: 7 }, sinceBonus: 120 }, at)]

  test("the play's games are the day's games less those at the seat", () => {
    expect(seated).toEqual([{ spins: 0, outlay: 0, at, counter: { spins: 120, total: 2400, bonuses: { big: 9, reg: 7 } } }])
    expect(checkpointForReading(seated, { total: 2650, bonuses: { big: 10, reg: 7 }, outlay: 2000, replay: undefined, at })).toEqual({
      ok: true,
      value: { spins: 250, outlay: 2000, at, counter: { total: 2650, bonuses: { big: 10, reg: 7 } } },
    })
  })

  test("the day's games, the outlay and the medals drawn from savings never go back", () => {
    const played = [...seated, { spins: 300, outlay: 3000, at, counter: { total: 2700, bonuses: {} } }]
    expect(totalNowOf(played)).toBe(2700)
    expect(checkpointForReading(played, { total: 2650, bonuses: {}, outlay: undefined, replay: undefined, at })).toEqual({
      ok: false,
      error: { type: "total-went-back", atLeast: 2700 },
    })
    expect(checkpointForReading(played, { total: 2800, bonuses: {}, outlay: 2000, replay: undefined, at })).toEqual({ ok: false, error: { type: "outlay-went-back", atLeast: 3000 } })
    const drawn = checkpointForReading(played, { total: 2800, bonuses: {}, outlay: undefined, replay: 150, at })
    expect(drawn.ok && drawn.value.replay).toBe(150)
    const after = drawn.ok ? [...played, drawn.value] : played
    expect(checkpointForReading(after, { total: 2900, bonuses: {}, outlay: undefined, replay: 100, at })).toEqual({ ok: false, error: { type: "replay-went-back", atLeast: 150 } })
  })

  test("a tap adds to the running tally or takes one back, counted over the play from its first game", () => {
    const started = [...seated, { spins: 250, at, counter: { total: 2650 } }]
    expect(countedGamesOf(started)).toBe(0)
    const grape = countCheckpoint(started, "grape", 1, at)
    expect(grape).toEqual({ spins: 250, at, tally: { grape: 1 } })
    expect(countCheckpoint([...started, grape], "grape", -1, at).tally).toEqual({ grape: 0 })
    expect(countCheckpoint(started, "cherry", -1, at).tally).toEqual({ cherry: 0 })
    const later = [...started, grape, { spins: 400, at, counter: { total: 2800 } }]
    expect(countedGamesOf(later)).toBe(400)
    expect(countedGamesOf([...seated, { spins: 250, at, tally: {} }, grape, { spins: 400, at, counter: { total: 2800 } }])).toBe(150)
  })
})

describe("天井狙い's terms", () => {
  test("rent every regular game's loss for cash, the bet at the most, and exchange the AT's medals", () => {
    const terms: PlayTerms = { rental: { yen: 1000, tokens: 46 }, exchange: { yen: 10_000, tokens: 510 }, replay: { paidOut: 1, deducted: 1 } }
    expect(huntPlayOf(terms, { base: 33.9, at: "at", modes: [] }, 3)).toEqual({ medalValue: tokenValueOf(terms), rentalPrice: 1000 / 46, cashShare: 50 / 33.9 / 3 })
    expect(huntPlayOf(terms, { base: 10, at: "at", modes: [] }, 3).cashShare).toBe(1)
  })
})

/** The made-up machine with a BIG's 20 games watched for a スイカ, and a REG's lamp once, blue or red. */
const watched: NormalizedSpecDto = {
  ...spec,
  tables: spec.tables.map((table) => ({
    ...table,
    cues: [
      { id: "big-suika", watch: "big-games", chance: 1 / 40 },
      { id: "lamp-blue", watch: "reg-lamp", chance: 0.6 },
      { id: "lamp-red", watch: "reg-lamp", chance: 0.4 },
    ],
  })),
  watches: [
    { id: "big-games", bonus: "big", trials: 20, whole: false },
    { id: "reg-lamp", bonus: "reg", trials: 1, whole: true },
  ],
}

describe("the cues watched for over a bonus", () => {
  test("are counted after what a game comes to, each by its label", () => {
    const countables = countablesOf({ ...formula, normalized: watched, labels: { ...formula.labels, "big-suika": "BIG中スイカ" } })
    expect(countables.map((each) => each.id).slice(-3)).toEqual(["big-suika", "lamp-blue", "lamp-red"])
    expect(countables.at(-3)?.label).toBe("BIG中スイカ")
  })

  test("come up out of the trials watched: a BIG's games for each counted, or the lamps seen", () => {
    const outOf = countedOutOf(watched, { big: 3, "reg-solo": 1, "reg-cherry": 1, "big-suika": 2, "lamp-blue": 1, "lamp-red": 2 }, 900)
    expect(outOf("grape")).toBe(900)
    expect(outOf("big-suika")).toBe(60)
    expect(outOf("lamp-blue")).toBe(3)
  })
})
