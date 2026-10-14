import type { MachineDetailDto, StandingDto } from "@p-lens/contracts"
import type * as PachislotContract from "@p-lens/contracts/pachislot"
import type * as PachinkoContract from "@p-lens/contracts/pachinko"
import type { ProbabilityDto } from "@p-lens/contracts/pachinko"
import { describe, expect, test } from "bun:test"

import { entryOf, locate, machineNamed, markable, searchDelivered } from "../../src/core/catalog/delivered"

const STANDING: StandingDto = { verifications: 2, refutations: 1, adoptions: 5, rejections: 1, favorites: 0, uses: 3 }

const formula = (id: string, machineId: string, kind: PachinkoContract.FormulaDto["kind"]): PachinkoContract.FormulaDto => ({
  id,
  machineId,
  kind,
  figures: { roundChanceOneIn: 319.7, payoutPerRound: 140 },
  bonuses: [{ name: "10R", payout: 1500, spent: 100 }],
  contentHash: id,
  createdAt: "2026-10-01T00:00:00.000Z",
  standing: STANDING,
})

const distribution = (id: string, machineId: string): PachislotContract.SettingDistributionDto => ({
  id,
  machineId,
  label: "平日",
  shares: [{ settingLevel: 1, value: 10000 }],
  contentHash: id,
  createdAt: "2026-10-01T00:00:00.000Z",
  standing: STANDING,
})

const UMI: MachineDetailDto = {
  machine: { id: "mori", gameKind: "pachinko", name: "Pスーパー森物語", modelName: "PA森物語3R2", keywords: ["もり", "森"], hitChance: "1/319.7", releasedOn: "2026-09-01", formulaCount: 2 },
  formulas: [formula("mori-typed", "mori", "manual"), formula("mori-basis", "mori", "simulated")],
}

const JUGGLER: MachineDetailDto = {
  machine: { id: "pierrot", gameKind: "pachislot", name: "ハッピーピエロット", keywords: [], releasedOn: "2026-08-01", formulaCount: 0 },
  formulas: [],
  distributions: [distribution("weekday", "pierrot")],
}

const DELIVERED = [UMI, JUGGLER]

describe("the delivered catalog", () => {
  test("is searched within one game", () => {
    expect(searchDelivered(DELIVERED, "", "pachinko").map((machine) => machine.id)).toEqual(["mori"] as never)
    expect(searchDelivered(DELIVERED, "ピエロット", "pachislot").map((machine) => machine.id)).toEqual(["pierrot"] as never)
    expect(searchDelivered(DELIVERED, "ピエロット", "pachinko")).toEqual([])
  })

  test("is searched by a machine's name, its model name and the words it is searched by", () => {
    for (const query of ["森物語", "すーぱー", "ｽｰﾊﾟｰ", "もり", "pa森", "3r2"]) expect([query, searchDelivered(DELIVERED, query, "pachinko").map((machine) => machine.id)]).toEqual([query, ["mori"]] as never)
    expect(searchDelivered(DELIVERED, "流星", "pachinko")).toEqual([])
  })

  test("gives the 大当り確率 its formulas' bases say, each once and the likeliest first, none from one typed in by hand", () => {
    const based = (id: string, denominatorHundredths: number): PachinkoContract.FormulaDto => ({
      ...formula(id, "wanwan", "simulated"),
      basis: { spec: { v: 1, entities: ["regular"], components: { regularGame: { regular: { chance: { type: "ratio", numerator: 1, denominatorHundredths } } } } } } as never,
    })
    const wanwan: MachineDetailDto = {
      machine: { id: "wanwan", gameKind: "pachinko", name: "わんわん", keywords: [], releasedOn: "2026-10-05", formulaCount: 4 },
      formulas: [based("seventy-seven", 7774), formula("typed", "wanwan", "manual"), based("forty-nine", 4991), based("again", 7774)],
    }
    expect(searchDelivered([wanwan], "", "pachinko")[0]).toMatchObject({ hitChance: undefined, formulaHitChances: [{ type: "ratio", numerator: 1, denominatorHundredths: 4991 }, { type: "ratio", numerator: 1, denominatorHundredths: 7774 }] })
    expect(searchDelivered(DELIVERED, "", "pachislot")[0]?.formulaHitChances).toEqual([])
  })

  test("tells chances whose one-in lies within two of each other as one, the chance of the formula ranked first among them, and keeps those further apart", () => {
    const based = (id: string, denominatorHundredths: number): PachinkoContract.FormulaDto => ({
      ...formula(id, "wanwan", "simulated"),
      basis: { spec: { v: 1, entities: ["regular"], components: { regularGame: { regular: { chance: { type: "ratio", numerator: 1, denominatorHundredths } } } } } } as never,
    })
    const ratio = (denominatorHundredths: number): ProbabilityDto => ({ type: "ratio", numerator: 1, denominatorHundredths })
    const machine = (formulas: readonly PachinkoContract.FormulaDto[]): MachineDetailDto => ({ machine: { id: "wanwan", gameKind: "pachinko", name: "わんわん", keywords: [], releasedOn: "2026-10-05", formulaCount: formulas.length }, formulas })
    expect(searchDelivered([machine([based("a", 31967), based("b", 31999)])], "", "pachinko")[0]?.formulaHitChances).toEqual([ratio(31967)])
    const adopted = { ...based("b", 31999), standing: { ...based("b", 31999).standing, adoptions: 9 } }
    expect(searchDelivered([machine([based("a", 31967), adopted])], "", "pachinko")[0]?.formulaHitChances).toEqual([ratio(31999)])
    expect(searchDelivered([machine([based("a", 99900), based("b", 39900)])], "", "pachinko")[0]?.formulaHitChances).toEqual([ratio(39900), ratio(99900)])
  })

  test("gives a machine as it is described, and one delivered before machines had keywords with none", () => {
    expect(searchDelivered(DELIVERED, "", "pachinko")[0]).toMatchObject({ name: "Pスーパー森物語", modelName: "PA森物語3R2", keywords: ["もり", "森"], hitChance: "1/319.7" })
    const { keywords: _keywords, ...before } = JUGGLER.machine
    expect(searchDelivered([{ ...JUGGLER, machine: before } as never], "", "pachislot")[0]).toMatchObject({ modelName: undefined, keywords: [], hitChance: undefined })
  })

  test("finds a name already taken only in the same game", () => {
    expect(machineNamed(DELIVERED, "Ｐスーパー森物語", "pachinko")).toBe("mori" as never)
    expect(machineNamed(DELIVERED, "Pスーパー森物語", "pachislot")).toBeUndefined()
  })

  test("gives a machine in its game's shape, with everyone's standing", () => {
    const entry = entryOf(JUGGLER)
    expect(entry.gameKind).toBe("pachislot")
    if (entry.gameKind !== "pachislot") return
    expect(entry.distributions[0]?.standing).toEqual(STANDING)
    expect(entry.distributions[0]?.formula.shares).toEqual([{ settingLevel: 1, basisPoints: 10000 }])
  })

  test("locates what a mark is on, and whether it has a basis to check", () => {
    expect(locate(DELIVERED, { type: "formula", id: "mori-typed" })).toEqual({ machineId: "mori", checkable: false })
    expect(locate(DELIVERED, { type: "formula", id: "mori-basis" })).toEqual({ machineId: "mori", checkable: true })
    expect(locate(DELIVERED, { type: "distribution", id: "weekday" })).toEqual({ machineId: "pierrot", checkable: false })
    expect(locate(DELIVERED, { type: "formula", id: "not-yet" })).toBeUndefined()
  })

  test("takes only an adoption or a favourite on a 設定配分", () => {
    expect(markable({ type: "distribution", id: "weekday" }, "adoption")).toBe(true)
    expect(markable({ type: "distribution", id: "weekday" }, "rejection")).toBe(false)
    expect(markable({ type: "distribution", id: "weekday" }, "verification")).toBe(false)
    expect(markable({ type: "formula", id: "mori-basis" }, "refutation")).toBe(true)
  })
})
