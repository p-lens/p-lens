import { describe, expect, test } from "bun:test"

import type { SpecDto } from "@p-lens/contracts/pachislot"
import czSpec from "@p-lens/contracts/fixtures/pachislot/made-up-cz/spec.json"
import normalized from "@p-lens/contracts/fixtures/pachislot/made-up/normalized.json"

import { huntTable } from "../../../src/application/pachislot/hunt"
import type { Basis } from "../../../src/core/pachislot/formula"
import { huntSeatsOf } from "../../../src/core/pachislot/path"
import { DEFAULT_PRIOR, priorFor } from "../../../src/core/pachislot/prior"
import { huntPlayOf } from "../../../src/core/pachislot/weighing"
import type { PlayTerms } from "../../../src/core/parlor/terms"
import { inProcessEngine } from "../../support/pachislot/engine"

const terms: PlayTerms = { rental: { yen: 1000, tokens: 46 }, exchange: { yen: 10_000, tokens: 510 }, replay: { paidOut: 1, deducted: 1 } }

const conditions = { payoutRate: { type: "measured" as const, bySettingLevel: [{ settingLevel: 1, value: 9_700 }, { settingLevel: 6, value: 11_000 }] } }

describe("天井狙い down a formula's table", () => {
  test("is each seat's hunt under the stock spread a play starts with, played from cash", async () => {
    const analysed = await inProcessEngine.call("analyze", { source: { type: "spec", spec: czSpec as SpecDto }, conditions })
    if (!analysed.ok) throw new Error(JSON.stringify(analysed.error))
    const basis: Basis = { spec: czSpec as SpecDto, conditions, normalized: analysed.value.normalized, engineSchemaVersion: analysed.value.schemaVersion }
    const rules = basis.normalized.atRules
    if (rules === undefined) throw new Error("an AT machine")
    const seats = huntSeatsOf(basis.normalized, false, 1)
    const table = await huntTable(inProcessEngine, basis, terms, seats)
    if (!table.ok) throw new Error(JSON.stringify(table.error))
    const prior = priorFor(DEFAULT_PRIOR, [1, 6])
    const shares = prior.ok ? (prior.value?.shares ?? []) : []
    const direct = await inProcessEngine.call("hunt", {
      source: { type: "normalized", normalized: basis.normalized },
      weights: shares.map((share) => ({ settingLevel: share.settingLevel, probability: share.value / 10_000 })),
      play: huntPlayOf(terms, rules, basis.normalized.bet),
      seats,
    })
    if (!direct.ok) throw new Error(JSON.stringify(direct.error))
    expect(table.value.map((row) => row.hunt)).toEqual([...direct.value])
    expect(table.value.map((row) => row.seat)).toEqual([...seats])
  })

  test("is none at a machine of bonuses", async () => {
    const basis = { spec: {} as SpecDto, conditions: { payoutRate: { type: "from-spec" as const } }, normalized: normalized as Basis["normalized"], engineSchemaVersion: 3 }
    expect(await huntTable(inProcessEngine, basis, terms, [{ sinceTrigger: 0, sinceAt: 0, misses: 0, afterReset: false }])).toEqual({ ok: true, value: [] })
  })
})
