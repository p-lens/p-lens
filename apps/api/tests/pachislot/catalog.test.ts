import type { RegisterMachineDto } from "@p-lens/contracts"
import type { NewFormulaDto, FormulaSettingLevelFiguresDto } from "@p-lens/contracts/pachislot"
import { describe, expect, test } from "bun:test"

import { type Api, api, device, pachislotFixture, realPachislotEngine } from "../support/harness"

const ALICE = device(1_759_000_000_001)
const BOB = device(1_759_000_000_002)

const UUIDV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

interface Expected {
  readonly settingLevels: readonly {
    readonly settingLevel: number
    readonly payoutRate: number
    readonly bonuses: readonly { readonly id: string; readonly chance: number }[]
    readonly combined: number
  }[]
}

/** The made-up A-type machine's figures, as the engine solves them. */
const madeUpFigures = async (): Promise<readonly FormulaSettingLevelFiguresDto[]> => {
  const expected: Expected = await pachislotFixture("made-up", "expected.json")
  return expected.settingLevels.map((figures) => ({
    settingLevel: figures.settingLevel,
    payoutRate: figures.payoutRate,
    bonuses: figures.bonuses.map((bonus) => ({ id: bonus.id, oneIn: 1 / bonus.chance })),
    combinedOneIn: 1 / figures.combined,
  }))
}

/** The made-up A-type machine worked out from its 解析値. */
const simulated = async (): Promise<NewFormulaDto> => ({
  kind: "simulated",
  figures: await madeUpFigures(),
  basis: { spec: await pachislotFixture("made-up", "spec.json"), conditions: { payoutRate: { type: "from-spec" } } },
})

/** The made-up machine typed in by hand: its bonuses, its 機械割 as measured. */
const manual = async (): Promise<NewFormulaDto> => {
  const figures = (await madeUpFigures()).map((each) => ({ ...each, payoutRate: each.settingLevel === 1 ? 0.97 : 1.1 }))
  return {
    kind: "manual",
    figures,
    basis: {
      spec: await pachislotFixture("made-up", "spec.json"),
      conditions: {
        payoutRate: {
          type: "measured",
          bySettingLevel: [
            { settingLevel: 1, value: 9_700 },
            { settingLevel: 6, value: 11_000 },
          ],
        },
      },
    },
  }
}

const registered = async () => {
  const client = await api()
  const machine = await client.call("POST", "/machines", {
    as: ALICE,
    body: { gameKind: "pachislot", modelName: "型式A1", name: "テストピエロット", releasedOn: "2026-09-01", formula: await simulated() } satisfies RegisterMachineDto,
  })
  return { client, machineId: machine.body.machineId as string, formulaId: machine.body.formulaId as string }
}

const count = (client: Api, table: string): number => (client.sqlite.query(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n

describe("pachislot in the one catalog", () => {
  test("a pachinko and a pachislot machine may share a name; two of one game may not", async () => {
    const { client } = await registered()
    const again = await client.call("POST", "/machines", { as: BOB, body: { gameKind: "pachislot", modelName: "型式A2", name: " テストピエロット", releasedOn: "2026-09-01", formula: await simulated() } })
    expect(again.body.error).toEqual({ type: "conflict", what: "machine-name" })
    const pachinko = await client.call("POST", "/machines", {
      as: BOB,
      body: { gameKind: "pachinko", modelName: "型式A3", hitChance: "1/319.7", name: "テストピエロット", releasedOn: "2026-09-01", formula: { kind: "manual", figures: { roundChanceOneIn: 13.9, payoutPerRound: 140 }, bonuses: [{ name: "10R", payout: 1500, spent: 100 }] } },
    })
    expect(pachinko.status).toBe(201)
    const shares = { label: "平日", shares: [{ settingLevel: 1, value: 10_000 }] }
    const refused = await client.call("POST", `/machines/${pachinko.body.machineId}/distributions`, { as: BOB, body: shares })
    expect(refused.body.error).toEqual({ type: "not-for-game", what: "distribution" })
    const pachislotFormula = await client.call("POST", `/machines/${pachinko.body.machineId}/formulas`, { as: BOB, body: await simulated() })
    expect(pachislotFormula.body.error).toMatchObject({ type: "invalid-body" })
  })

  test("registers a machine with its first formula, normalised here, apart from pachinko's", async () => {
    const { client, machineId, formulaId } = await registered()
    expect(machineId).toMatch(UUIDV7)
    expect(formulaId).toMatch(UUIDV7)
    const detail = await client.call("GET", `/machines/${machineId}`)
    expect(detail.status).toBe(200)
    expect(detail.body.machine).toEqual({ id: machineId, gameKind: "pachislot", name: "テストピエロット", modelName: "型式A1", keywords: [], releasedOn: "2026-09-01", formulaCount: 1 })
    const [formula] = detail.body.formulas
    expect(formula.kind).toBe("simulated")
    expect(formula.basis.normalized).toEqual(await pachislotFixture("made-up", "normalized.json"))
    expect(formula.standing).toEqual({ verifications: 0, refutations: 0, adoptions: 0, rejections: 0, favorites: 0, uses: 0 })
    expect(detail.body.distributions).toEqual([])
    expect((await client.call("GET", "/machines?q=ピエロット&game=pachislot")).body.map((each: { id: string }) => each.id)).toEqual([machineId])
    expect((await client.call("GET", "/machines?game=pachinko")).body).toEqual([])
    expect((await client.call("GET", "/machines?game=mahjong")).body.error).toEqual({ type: "invalid-body", field: "game", reason: "unknown-value" })
  })

  test("refuses figures its 解析値 do not come to, and 解析値 the engine refuses, keeping nothing", async () => {
    const client = await api()
    const sent = await simulated()
    const off = { ...sent, figures: sent.figures.map((each, index) => (index === 1 ? { ...each, payoutRate: each.payoutRate + 0.01 } : each)) }
    const wrong = await client.call("POST", "/machines", { as: ALICE, body: { gameKind: "pachislot", modelName: "型式A4", name: "ずれ", releasedOn: "2026-09-01", formula: off } })
    expect(wrong.status).toBe(422)
    expect(wrong.body.error).toEqual({ type: "figures-disagree-with-basis", field: "figures[1].payoutRate" })
    const broken = { ...sent, basis: { ...sent.basis, spec: { ...sent.basis.spec, resources: { ...sent.basis.spec.resources, settingLevels: [] } } } }
    const refused = await client.call("POST", "/machines", { as: ALICE, body: { gameKind: "pachislot", modelName: "型式A5", name: "空", releasedOn: "2026-09-01", formula: broken } })
    expect(refused.status).toBe(422)
    expect(refused.body.error).toEqual({ type: "basis-rejected", error: { type: "no-setting-levels" } })
    expect(count(client, "machines")).toBe(0)
  })

  test("takes a typed-in formula's measured 機械割, and no sampled one, whatever margins it states", async () => {
    const { client, machineId } = await registered()
    expect((await client.call("POST", `/machines/${machineId}/formulas`, { as: BOB, body: await manual() })).status).toBe(201)
    const exact = await simulated()
    const sampled = (stray: number, payoutRateMargin: number) => ({
      ...exact,
      kind: "sampled",
      figures: exact.figures.map((each) => ({ ...each, payoutRate: each.payoutRate + stray })),
      sampling: {
        gamesPerSettingLevel: 1_000_000,
        seed: "7",
        margins: exact.figures.map((each) => ({ settingLevel: each.settingLevel, payoutRateMargin })),
      },
    })
    for (const body of [sampled(0, 0.002), sampled(0.004, 0.002), sampled(0.5, 1_000)])
      expect((await client.call("POST", `/machines/${machineId}/formulas`, { as: BOB, body })).body.error).toEqual({ type: "invalid-body", field: "kind", reason: "unknown-value" })
    const formulas = (await client.call("GET", `/machines/${machineId}`)).body.formulas
    expect(formulas.map((each: { kind: string }) => each.kind)).toEqual(["simulated", "manual"])
  })

  test("refuses a formula said to be made a way its basis does not bear out: a stated 機械割 is typed in, and what is typed in states it", async () => {
    const { client, machineId } = await registered()
    const typed = await manual()
    const worked = await simulated()
    const stated = await client.call("POST", `/machines/${machineId}/formulas`, { as: BOB, body: { ...typed, kind: "simulated" } })
    expect([stated.status, stated.body.error]).toEqual([400, { type: "invalid-body", field: "kind", reason: "unknown-value" }])
    const unstated = await client.call("POST", `/machines/${machineId}/formulas`, { as: BOB, body: { ...worked, kind: "manual" } })
    expect([unstated.status, unstated.body.error]).toEqual([400, { type: "invalid-body", field: "kind", reason: "unknown-value" }])
  })

  test("an AT machine's figures include what an AT comes to, and are checked like any other", async () => {
    const client = await api()
    const spec = await pachislotFixture("made-up-cap", "spec.json")
    const conditions = {
      payoutRate: {
        type: "measured" as const,
        bySettingLevel: [
          { settingLevel: 1, value: 9_700 },
          { settingLevel: 6, value: 11_000 },
        ],
      },
    }
    const solved = await client.call("POST", "/machines", {
      as: ALICE,
      body: { gameKind: "pachislot", modelName: "型式A6", name: "上限機", releasedOn: "2026-09-01", formula: { kind: "manual", figures: [], basis: { spec, conditions } } },
    })
    expect(solved.body.error).toEqual({ type: "invalid-body", field: "figures", reason: "missing" })
    const figures = [
      { settingLevel: 1, payoutRate: 0.97, bonuses: [{ id: "at", oneIn: 500 }], combinedOneIn: 500, at: { gain: 1, completion: 0 } },
      { settingLevel: 6, payoutRate: 1.1, bonuses: [{ id: "at", oneIn: 400 }], combinedOneIn: 400, at: { gain: 1, completion: 0 } },
    ]
    const wrong = await client.call("POST", "/machines", { as: ALICE, body: { gameKind: "pachislot", modelName: "型式A7", name: "上限機", releasedOn: "2026-09-01", formula: { kind: "manual", figures, basis: { spec, conditions } } } })
    expect(wrong.body.error).toEqual({ type: "figures-disagree-with-basis", field: "figures[0].at" })
    const engine = await realPachislotEngine()
    const normalized = engine.normalize(spec)
    const analysis = normalized.ok ? engine.analyze(normalized.value, conditions) : normalized
    if (!analysis.ok) throw new Error(JSON.stringify(analysis.error))
    const solvedFigures = analysis.value.settingLevels.map((each) => ({
      settingLevel: each.settingLevel,
      payoutRate: each.payoutRate,
      bonuses: each.bonuses.map((bonus) => ({ id: bonus.id, oneIn: 1 / bonus.chance })),
      combinedOneIn: 1 / each.combined,
      ...(each.at === undefined ? {} : { at: each.at }),
    }))
    const right = await client.call("POST", "/machines", { as: ALICE, body: { gameKind: "pachislot", modelName: "型式A8", name: "上限機", releasedOn: "2026-09-01", formula: { kind: "manual", figures: solvedFigures, basis: { spec, conditions } } } })
    expect(right.status).toBe(201)
    const stored = (await client.call("GET", `/machines/${right.body.machineId}`)).body.formulas[0]
    expect(stored.basis.normalized.atRules.cap).toBe(2400)
    expect(stored.figures[0].at.completion).toBeGreaterThan(0)
  })

  test("an AT whose medals follow from its stated 機械割 is solved from its world alone, and a 機械割 that is not the stated one is refused", async () => {
    const client = await api()
    const spec = await pachislotFixture("made-up-rate", "spec.json")
    const conditions = { payoutRate: { type: "from-spec" as const } }
    const engine = await realPachislotEngine()
    const normalized = engine.normalize(spec)
    const analysis = normalized.ok ? engine.analyze(normalized.value, conditions) : normalized
    if (!analysis.ok) throw new Error(JSON.stringify(analysis.error))
    const figures = analysis.value.settingLevels.map((each) => ({
      settingLevel: each.settingLevel,
      payoutRate: each.payoutRate,
      bonuses: each.bonuses.map((bonus) => ({ id: bonus.id, oneIn: 1 / bonus.chance })),
      combinedOneIn: 1 / each.combined,
      ...(each.at === undefined ? {} : { at: each.at }),
    }))
    expect(figures.map((each) => each.payoutRate)).toEqual([expect.closeTo(0.975, 12), expect.closeTo(1.1, 12)])
    const register = (sent: typeof figures) => client.call("POST", "/machines", { as: ALICE, body: { gameKind: "pachislot", modelName: "型式A9", name: "機械割から", releasedOn: "2026-09-01", formula: { kind: "manual", figures: sent, basis: { spec, conditions } } } })
    const wrong = await register(figures.map((each) => ({ ...each, payoutRate: each.payoutRate + 0.01 })))
    expect(wrong.body.error).toMatchObject({ type: "figures-disagree-with-basis" })
    const right = await register(figures)
    expect(right.status).toBe(201)
    const stored = (await client.call("GET", `/machines/${right.body.machineId}`)).body.formulas[0]
    expect(stored.basis.normalized.atRules.netPerGame).toBe(4)
    expect(stored.figures[0].at.gain).toBeCloseTo(576.687, 2)
  })

  test("a 設定配分 is a decent label and whole shares, one per setting level, and is listed with its machine", async () => {
    const { client, machineId } = await registered()
    const post = (body: unknown) => client.call("POST", `/machines/${machineId}/distributions`, { as: BOB, body })
    const made = await post({ label: "平日", shares: [{ settingLevel: 1, value: 9_000 }, { settingLevel: 6, value: 1_000 }] })
    expect(made.status).toBe(201)
    expect((await post({ label: "平日", shares: [{ settingLevel: 1, value: 9_000 }, { settingLevel: 6, value: 900 }] })).body.error).toEqual({
      type: "invalid-body",
      field: "shares",
      reason: "unknown-value",
    })
    expect((await post({ label: "平日", shares: [{ settingLevel: 1, value: 5_000 }, { settingLevel: 1, value: 5_000 }] })).body.error.field).toBe("shares")
    expect((await post({ label: "ウンコ", shares: [{ settingLevel: 1, value: 10_000 }] })).body.error.reason).toBe("forbidden")
    expect((await client.call("POST", `/machines/${machineId}/distributions`, { body: { label: "x", shares: [] } })).status).toBe(401)
    const listed = (await client.call("GET", `/machines/${machineId}`)).body.distributions
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({ id: made.body.id, label: "平日", shares: [{ settingLevel: 1, value: 9_000 }, { settingLevel: 6, value: 1_000 }] })
  })

  test("marks and uses are kept per formula and per 設定配分, one adoption of each per machine", async () => {
    const { client, machineId, formulaId } = await registered()
    const second = await client.call("POST", `/machines/${machineId}/formulas`, { as: ALICE, body: await manual() })
    const distribution = await client.call("POST", `/machines/${machineId}/distributions`, {
      as: ALICE,
      body: { label: "平日", shares: [{ settingLevel: 1, value: 9_000 }, { settingLevel: 6, value: 1_000 }] },
    })
    const put = (path: string) => client.call("PUT", path, { as: BOB })
    expect((await put(`/formulas/${formulaId}/marks/adoption`)).status).toBe(204)
    expect((await put(`/formulas/${second.body.id}/marks/adoption`)).status).toBe(204)
    expect((await put(`/formulas/${formulaId}/marks/verification`)).status).toBe(204)
    expect((await put(`/formulas/${second.body.id}/marks/verification`)).body.error).toEqual({ type: "not-verifiable" })
    expect((await put(`/distributions/${distribution.body.id}/marks/adoption`)).status).toBe(204)
    expect((await put(`/distributions/${distribution.body.id}/marks/favorite`)).status).toBe(204)
    expect((await put(`/distributions/${distribution.body.id}/marks/verification`)).body.error).toEqual({ type: "not-markable", mark: "verification" })
    expect((await put(`/distributions/${distribution.body.id}/marks/rejection`)).body.error).toEqual({ type: "not-markable", mark: "rejection" })
    expect((await client.call("POST", `/distributions/${distribution.body.id}/uses`, { as: BOB })).status).toBe(204)
    expect((await client.call("POST", `/formulas/${formulaId}/uses`, { as: BOB })).status).toBe(204)
    expect((await put(`/formulas/${distribution.body.id}/marks/favorite`)).body.error).toEqual({ type: "not-found", what: "formula" })
    const detail = (await client.call("GET", `/machines/${machineId}`)).body
    expect(detail.formulas.map((each: { standing: unknown }) => each.standing)).toEqual([
      { verifications: 1, refutations: 0, adoptions: 0, rejections: 0, favorites: 0, uses: 1 },
      { verifications: 0, refutations: 0, adoptions: 1, rejections: 0, favorites: 0, uses: 0 },
    ])
    expect(detail.distributions[0].standing).toEqual({ verifications: 0, refutations: 0, adoptions: 1, rejections: 0, favorites: 1, uses: 1 })
    expect((await client.call("DELETE", `/distributions/${distribution.body.id}/marks/favorite`, { as: BOB })).status).toBe(204)
    expect((await client.call("GET", `/machines/${machineId}`)).body.distributions[0].standing.favorites).toBe(0)
  })

  test("the whole catalog is delivered with its version, which moves when anything but a use is written", async () => {
    const { client, machineId, formulaId } = await registered()
    await client.call("POST", "/machines", {
      as: BOB,
      body: { gameKind: "pachinko", modelName: "型式A10", hitChance: "1/319.7", name: "流星", releasedOn: "2026-08-01", formula: { kind: "manual", figures: { roundChanceOneIn: 13.9, payoutPerRound: 140 }, bonuses: [{ name: "10R", payout: 1500, spent: 100 }] } },
    })
    const version = async () => (await client.call("GET", "/catalog/version")).body.version as string
    const catalog = await client.call("GET", "/catalog")
    expect(catalog.body.version).toBe(await version())
    expect(catalog.body.machines.map((each: { machine: { gameKind: string; name: string } }) => [each.machine.gameKind, each.machine.name])).toEqual([
      ["pachislot", "テストピエロット"],
      ["pachinko", "流星"],
    ])
    expect(catalog.body.machines[0].formulas[0].basis.normalized).toEqual(await pachislotFixture("made-up", "normalized.json"))
    expect(catalog.body.machines[1].distributions).toBeUndefined()
    const before = await version()
    await client.call("POST", `/formulas/${formulaId}/uses`, { as: BOB })
    expect(await version()).toBe(before)
    await client.call("PUT", `/formulas/${formulaId}/marks/favorite`, { as: BOB })
    const favoured = await version()
    expect(favoured).not.toBe(before)
    await client.call("DELETE", `/formulas/${formulaId}/marks/favorite`, { as: BOB })
    expect(await version()).not.toBe(favoured)
    await client.call("POST", `/machines/${machineId}/distributions`, { as: BOB, body: { label: "平日", shares: [{ settingLevel: 1, value: 10_000 }] } })
    expect((await client.call("GET", "/catalog")).body.machines[0].distributions).toHaveLength(1)
  })

  test("formulas and 設定配分 are never changed or removed", async () => {
    const { client, machineId } = await registered()
    await client.call("POST", `/machines/${machineId}/distributions`, { as: BOB, body: { label: "平日", shares: [{ settingLevel: 1, value: 10_000 }] } })
    expect(() => client.sqlite.exec("UPDATE formulas SET kind = 'manual'")).toThrow(/immutable/)
    expect(() => client.sqlite.exec("DELETE FROM formulas")).toThrow(/immutable/)
    expect(() => client.sqlite.exec("UPDATE distributions SET label = '休日'")).toThrow(/immutable/)
    expect(() => client.sqlite.exec("DELETE FROM distributions")).toThrow(/immutable/)
  })
})
