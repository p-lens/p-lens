import { describe, expect, test } from "bun:test"

import type { FormulaDraft } from "../../src/core/catalog/draft"
import { readDraft, writtenDraft } from "../../src/core/catalog/draft"
import { quotaOf, standingFor } from "../../src/core/catalog/quota"
import type { MachineId } from "../../src/core/machine/machine"
import { describeCatalogError, quotaStandingText } from "../../src/ui/wording/catalog"
import { formatMoment } from "../../src/ui/wording/dates"

const NEXT = "2026-10-10T12:20:00.000Z"

describe("where a device stands against the shared catalog's quotas", () => {
  test("is read kind by kind, and a catalog that counts none has no standing", () => {
    const quota = quotaOf({ type: "limited", machine: { remaining: 5, nextAt: NEXT }, addition: { remaining: 12 }, tag: { remaining: 20 } })
    expect(standingFor(quota, "machine")).toEqual({ remaining: 5, nextAt: NEXT })
    expect(standingFor(quota, "addition")).toEqual({ remaining: 12, nextAt: undefined })
    expect(standingFor(quotaOf({ type: "unlimited" }), "machine")).toBeUndefined()
  })

  test("is said before anything is typed: how many more today, and from when if not now", () => {
    expect(quotaStandingText("machine", { remaining: 6, nextAt: undefined })).toBe("機種の登録は、今日はあと6件送れます。")
    expect(quotaStandingText("addition", { remaining: 0, nextAt: NEXT })).toBe(`算出条件の追加は、${formatMoment(NEXT)} から送れます（今日はあと0件）。それまでに入力したものは、送れなくてもこの端末に残ります。`)
  })

  test("a refusal says from when, and that what was typed is kept", () => {
    expect(describeCatalogError({ type: "quota-reached", kind: "machine", nextAt: NEXT })).toBe(
      `機種の登録は、${formatMoment(NEXT)} から送れます。入力した内容はこの端末に残してあるので、その時刻になったらもう一度登録を押してください。`,
    )
  })
})

describe("a formula that could not be sent", () => {
  const draft: FormulaDraft = {
    target: { type: "new", machine: { name: "P森", modelName: "", keywords: "もり", hitChance: "1/319.7", releasedOn: "2025-09-01" } },
    formula: { gameKind: "pachinko", formula: { kind: "manual", figures: { roundChanceOneIn: 31.9, payoutPerRound: 140, totalChanceOneIn: undefined, spinsPerHour: undefined }, bonuses: [{ name: "10R", payout: 1500, spent: 100 }], derivedFrom: undefined } },
  }

  test("is read back as it was written, for its own game alone", () => {
    const read = readDraft(writtenDraft(draft), "pachinko")
    expect(read?.target).toEqual(draft.target)
    expect(read?.formula.gameKind).toBe("pachinko")
    expect(readDraft(writtenDraft(draft), "pachislot")).toBeUndefined()
  })

  test("for a machine in the catalog names it", () => {
    const forMachine: FormulaDraft = { ...draft, target: { type: "catalog", machineId: "01a10000-0000-7000-8000-000000000001" as MachineId, name: "P森" } }
    expect(readDraft(writtenDraft(forMachine), "pachinko")?.target).toEqual(forMachine.target)
  })

  test("is not read from nothing, from what is no draft, or from another shape", () => {
    expect(readDraft(undefined, "pachinko")).toBeUndefined()
    expect(readDraft("{", "pachinko")).toBeUndefined()
    expect(readDraft(JSON.stringify({ v: 0, ...draft }), "pachinko")).toBeUndefined()
    expect(readDraft(JSON.stringify({ v: 1, target: [], formula: draft.formula }), "pachinko")).toBeUndefined()
  })
})
