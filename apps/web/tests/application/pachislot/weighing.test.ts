import { describe, expect, test } from "bun:test"

import type { NormalizedSpecDto, SpecDto } from "@p-lens/contracts/pachislot"
import atSpec from "@p-lens/contracts/fixtures/pachislot/made-up-at/spec.json"
import expected from "@p-lens/contracts/fixtures/pachislot/made-up/expected.json"
import normalized from "@p-lens/contracts/fixtures/pachislot/made-up/normalized.json"

import { weighPlay } from "../../../src/application/pachislot/weighing"
import type { MachineId } from "../../../src/core/machine/machine"
import type { FormulaId, SettingDistributionId } from "../../../src/core/pachislot/formula"
import { seatCheckpoint } from "../../../src/core/pachislot/reading"
import { atSeatCheckpoint } from "../../../src/core/pachislot/path"
import { GAMES_PER_HOUR, readableBy, type Weighing } from "../../../src/core/pachislot/weighing"
import type { PlayTerms } from "../../../src/core/parlor/terms"
import type { Checkpoint } from "../../../src/core/play-log/checkpoint"
import { inProcessEngine } from "../../support/pachislot/engine"

const [low, high] = expected.settingLevels

const weighing = (prior: Weighing["prior"]): Weighing => ({
  formula: {
    id: "f" as FormulaId,
    machineId: "m" as MachineId,
    kind: "simulated",
    figures: [],
    normalized: normalized as NormalizedSpecDto,
    conditions: { payoutRate: { type: "from-spec" } },
    labels: {},
  },
  prior,
})

const even = weighing({ type: "even" })

const terms: PlayTerms = { rental: { yen: 1000, tokens: 50 }, exchange: { tokens: 50, yen: 1000 }, replay: { paidOut: 1, deducted: 1 } }

const at = "2026-10-05T10:00:00.000Z"

const seated: readonly Checkpoint[] = [seatCheckpoint({ total: 0, bonuses: {}, sinceBonus: 0 }, at)]

describe("weighing a pachislot play", () => {
  test("with nothing seen, an even prior stands and an hour's play is weighed at its odds", async () => {
    const outlook = await weighPlay(inProcessEngine, even, seated, terms)
    if (!outlook.ok) throw new Error(JSON.stringify(outlook.error))
    expect(outlook.value.settingLevels.map((weight) => weight.probability)).toEqual([0.5, 0.5])
    expect(outlook.value.payoutRate).toBeCloseTo(((low?.payoutRate ?? 0) + (high?.payoutRate ?? 0)) / 2, 12)
    expect(outlook.value.theoreticalValuePerHour).toBeCloseTo(GAMES_PER_HOUR * (outlook.value.netPerGame ?? Number.NaN) * 20, 6)
    expect(outlook.value.theoreticalValue).toBeUndefined()
    expect(outlook.value.grounded).toBe(false)
    expect(outlook.value.hunt).toBeUndefined()
  })

  test("a 設定配分 for every level of the machine is weighed on the formula's levels alone", async () => {
    const weekday = weighing({
      type: "distribution",
      id: "d" as SettingDistributionId,
      label: "平日",
      shares: [1, 2, 3, 4, 5, 6].map((settingLevel) => ({ settingLevel, basisPoints: settingLevel === 1 ? 9000 : 200 })),
    })
    const outlook = await weighPlay(inProcessEngine, weekday, seated, terms)
    if (!outlook.ok) throw new Error(JSON.stringify(outlook.error))
    const [first, sixth] = outlook.value.settingLevels
    expect(first?.probability).toBeCloseTo(0.9783, 12)
    expect(sixth?.probability).toBeCloseTo(0.0217, 12)
    expect(outlook.value.grounded).toBe(true)
  })

  test("the games played are weighed at what was seen, the rental spread charged on the share played from cash", async () => {
    const played = [...seated, { spins: 1000, outlay: 10_000, at, counter: { total: 1000, bonuses: { big: 5, reg: 4 } } }]
    const outlook = await weighPlay(inProcessEngine, even, played, terms)
    if (!outlook.ok) throw new Error(JSON.stringify(outlook.error))
    const [first, sixth] = outlook.value.settingLevels
    expect(sixth?.probability ?? 0).toBeGreaterThan(first?.probability ?? 0)
    expect(outlook.value.grounded).toBe(true)
    expect(outlook.value.theoreticalValue).toBeCloseTo(1000 * (outlook.value.netPerGame ?? Number.NaN) * 20, 6)
  })

  test("what was counted under names the formula lacks is refused by the engine, and weighed once the log is read by the formula alone", async () => {
    const played = [...seated, { spins: 0, at, tally: {} }, { spins: 1000, outlay: 10_000, at, counter: { total: 1000, bonuses: { big: 5, reg: 4, "another-machines-bonus": 3 } }, tally: { "another-machines-grape": 140 } }]
    expect((await weighPlay(inProcessEngine, even, played, terms)).ok).toBe(false)
    const read = readableBy(even.formula, played)
    expect(read.at(-1)).toEqual({ spins: 1000, outlay: 10_000, at, counter: { total: 1000, bonuses: { big: 5, reg: 4 } }, tally: {} })
    expect((await weighPlay(inProcessEngine, even, read, terms)).ok).toBe(true)
  })

  test("with no terms, the medals are weighed and no yen is given", async () => {
    const outlook = await weighPlay(inProcessEngine, even, seated, undefined)
    if (!outlook.ok) throw new Error(JSON.stringify(outlook.error))
    expect(outlook.value.payoutRate).toBeCloseTo(((low?.payoutRate ?? 0) + (high?.payoutRate ?? 0)) / 2, 12)
    expect(outlook.value.priced).toBe(false)
    expect(outlook.value.theoreticalValuePerHour).toBeUndefined()
    expect(outlook.value.theoreticalValue).toBeUndefined()
  })

  test("an AT machine is weighed by the path its play went through, each game for its count since the last AT", async () => {
    const conditions = {
      payoutRate: {
        type: "measured" as const,
        bySettingLevel: [
          { settingLevel: 1, value: 9_700 },
          { settingLevel: 6, value: 11_000 },
        ],
      },
    }
    const analysed = await inProcessEngine.call("analyze", { source: { type: "spec", spec: atSpec as SpecDto }, conditions })
    if (!analysed.ok) throw new Error(JSON.stringify(analysed.error))
    const machine: Weighing = { ...even, formula: { ...even.formula, normalized: analysed.value.normalized, conditions } }
    const seat = atSeatCheckpoint({ sinceAt: 400, sinceCz: undefined, misses: 0, afterReset: false, held: undefined }, at)
    const seated = await weighPlay(inProcessEngine, machine, [seat], terms)
    expect(seated.ok && { netPerGame: seated.value.netPerGame, value: seated.value.theoreticalValue, grounded: seated.value.grounded }).toEqual({ netPerGame: undefined, value: undefined, grounded: true })
    if (!seated.ok) throw new Error("weighs")
    const hunted = await inProcessEngine.call("hunt", {
      source: { type: "normalized", normalized: analysed.value.normalized },
      weights: seated.value.settingLevels,
      play: { medalValue: 20, rentalPrice: 20, cashShare: 50 / 40 / 3 },
      seats: [{ sinceTrigger: 400, sinceAt: 400, misses: 0, afterReset: false }],
    })
    expect(seated.value.hunt).toEqual(hunted.ok ? hunted.value[0] : undefined)
    const unread = await weighPlay(inProcessEngine, machine, [atSeatCheckpoint({ sinceAt: 0, sinceCz: undefined, misses: 0, afterReset: false, held: undefined }, at)], terms)
    expect(unread.ok && unread.value.grounded).toBe(false)

    const toCeiling = [seat, { spins: 600, at, event: { kind: "jackpot" as const } }]
    const outlook = await weighPlay(inProcessEngine, machine, toCeiling, { ...terms, rental: { yen: 1000, tokens: 50 } })
    if (!outlook.ok) throw new Error(JSON.stringify(outlook.error))
    const chances = analysed.value.normalized.tables.map((table) => table.at?.chance ?? Number.NaN)
    const likelihoods = chances.map((p) => (1 - p) ** 599)
    const odds = likelihoods.map((each) => each / likelihoods.reduce((sum, other) => sum + other, 0))
    const medals = chances.map((p) => 600 * (p * 599 + 1) - (50 / 40) * 600)
    expect(outlook.value.settingLevels[0]?.probability).toBeCloseTo(odds[0] ?? Number.NaN, 12)
    expect(outlook.value.theoreticalValue).toBeCloseTo(20 * medals.reduce((sum, each, index) => sum + each * (odds[index] ?? 0), 0), 6)
  })

  test("an AT machine's small wins counted in its regular games weigh beside its path", async () => {
    const spec = atSpec as SpecDto
    const belled: SpecDto = {
      ...spec,
      entities: [...spec.entities, "bell"],
      components: {
        ...spec.components,
        chance: {
          ...spec.components.chance,
          bell: [
            { settingLevel: 1, value: { type: "ratio", numerator: 1, denominatorHundredths: 730 } },
            { settingLevel: 6, value: { type: "ratio", numerator: 1, denominatorHundredths: 690 } },
          ],
        },
      },
    }
    const conditions = {
      payoutRate: {
        type: "measured" as const,
        bySettingLevel: [
          { settingLevel: 1, value: 9_700 },
          { settingLevel: 6, value: 11_000 },
        ],
      },
    }
    const analysed = await inProcessEngine.call("analyze", { source: { type: "spec", spec: belled }, conditions })
    if (!analysed.ok) throw new Error(JSON.stringify(analysed.error))
    const machine: Weighing = { ...even, formula: { ...even.formula, normalized: analysed.value.normalized, conditions } }
    const seat = atSeatCheckpoint({ sinceAt: 0, sinceCz: undefined, misses: 0, afterReset: false, held: undefined }, at)
    const counting: readonly Checkpoint[] = [seat, { spins: 0, at, tally: {} }, { spins: 300, at, counter: { spins: 300 } }, { spins: 300, at, tally: { bell: 45 } }]
    const walked = await weighPlay(inProcessEngine, machine, counting.slice(0, 3), undefined)
    const both = await weighPlay(inProcessEngine, machine, counting, undefined)
    if (!walked.ok || !both.ok) throw new Error("weighs")
    const weighed = walked.value.settingLevels.map((each, index) => each.probability * Math.exp(45 * Math.log(index === 0 ? 1 / 7.3 : 1 / 6.9) + 255 * Math.log1p(-(index === 0 ? 1 / 7.3 : 1 / 6.9))))
    const total = weighed.reduce((sum, each) => sum + each, 0)
    both.value.settingLevels.forEach((each, index) => expect(each.probability).toBeCloseTo((weighed[index] ?? Number.NaN) / total, 9))
  })

  test("a counter showing fewer bonuses than were counted is the play's problem, not the engine's", async () => {
    const counted = [...seated, { spins: 0, tally: {} }, { spins: 0, tally: { big: 2 } }, { spins: 100, counter: { total: 100, bonuses: { big: 1 } } }]
    expect(await weighPlay(inProcessEngine, even, counted, terms)).toEqual({
      ok: false,
      error: { type: "pachislot-play", problem: { type: "counter-below-counting", id: "big" } },
    })
  })
})
