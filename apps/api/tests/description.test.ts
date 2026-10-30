import type * as PachinkoContract from "@p-lens/contracts/pachinko"
import { describe, expect, test } from "bun:test"

import { type Api, api, device } from "./support/harness"

const ALICE = device(1_759_000_000_001)
const TOKEN = "admin-secret"
const AS_ADMIN = { Authorization: `Bearer ${TOKEN}` }

const manual = (): PachinkoContract.NewFormulaDto => ({ kind: "manual", figures: { roundChanceOneIn: 319.7, payoutPerRound: 140 }, bonuses: [{ name: "10R", payout: 1500, spent: 100 }] })

const GENKI = { gameKind: "pachinko", name: "e星都幻鬼", modelName: "e星都幻鬼W", keywords: ["ゲンキ", "せいとげんき"], hitChance: "1/399.9", releasedOn: "2025-02-03", formula: manual() }

const register = (client: Api, body: object) => client.call("POST", "/machines", { as: ALICE, body })

const found = async (client: Api, query: string): Promise<readonly string[]> =>
  (await client.call("GET", `/machines?q=${encodeURIComponent(query)}`)).body.map((machine: { name: string }) => machine.name)

describe("how a machine is described", () => {
  test("it is kept with its model name, the words it is searched by and its hit chance", async () => {
    const client = await api()
    const made = await register(client, GENKI)
    expect(made.status).toBe(201)
    const machine = (await client.call("GET", `/machines/${made.body.machineId}`)).body.machine
    expect(machine).toEqual({ id: made.body.machineId, gameKind: "pachinko", name: "e星都幻鬼", modelName: "e星都幻鬼W", keywords: ["ゲンキ", "せいとげんき"], hitChance: "1/399.9", releasedOn: "2025-02-03", formulaCount: 1 })
    expect((await client.call("GET", "/catalog")).body.machines[0].machine).toEqual(machine)
  })

  test("is registered with its model name, and a pachinko machine with its 大当り確率; the rest may be left out", async () => {
    const client = await api()
    const bare = { gameKind: "pachinko", name: "名前だけ", releasedOn: "2025-02-03", formula: manual() }
    expect((await register(client, { ...bare, modelName: " ", hitChance: "1/319.7" })).body.error).toEqual({ type: "invalid-body", field: "modelName", reason: "missing" })
    expect((await register(client, { ...bare, modelName: "型式A", hitChance: "" })).body.error).toEqual({ type: "invalid-body", field: "hitChance", reason: "missing" })
    expect((await register(client, { ...bare, gameKind: "pachislot" })).body.error).toEqual({ type: "invalid-body", field: "modelName", reason: "missing" })
    const made = await register(client, { ...bare, modelName: "型式A", hitChance: "1/319.7" })
    expect((await client.call("GET", `/machines/${made.body.machineId}`)).body.machine).toEqual({ id: made.body.machineId, gameKind: "pachinko", name: "名前だけ", modelName: "型式A", keywords: [], hitChance: "1/319.7", releasedOn: "2025-02-03", formulaCount: 1 })
  })

  test("it is found by a word it is searched by, or by its model name, width and case aside", async () => {
    const client = await api()
    await register(client, GENKI)
    await register(client, { ...GENKI, name: "ほかの機種", modelName: "PA別物", keywords: ["べつもの"] })
    expect(await found(client, "ゲンキ")).toEqual(["e星都幻鬼"])
    expect(await found(client, "ｹﾞﾝｷ")).toEqual(["e星都幻鬼"])
    expect(await found(client, "幻鬼w")).toEqual(["e星都幻鬼"])
    expect(await found(client, "pa別")).toEqual(["ほかの機種"])
    expect(await found(client, "どこにもない")).toEqual([])
  })

  test("a word given twice, however it is written, is kept once", async () => {
    const client = await api()
    const made = await register(client, { ...GENKI, keywords: ["TG", "ｔｇ", " tg ", "ゲンキ"] })
    expect((await client.call("GET", `/machines/${made.body.machineId}`)).body.machine.keywords).toEqual(["TG", "ゲンキ"])
  })

  test("what is not a list of short decent words, or a hit chance, is refused", async () => {
    const client = await api()
    const refusal = async (patch: object) => (await register(client, { ...GENKI, ...patch })).body.error
    expect(await refusal({ keywords: "ゲンキ" })).toEqual({ type: "invalid-body", field: "keywords", reason: "not-a-list" })
    expect(await refusal({ keywords: [1] })).toEqual({ type: "invalid-body", field: "keywords", reason: "not-text" })
    expect(await refusal({ keywords: ["あ".repeat(31)] })).toEqual({ type: "invalid-body", field: "keywords", reason: "too-long" })
    expect(await refusal({ keywords: Array.from({ length: 11 }, (_, index) => `語${index}`) })).toEqual({ type: "invalid-body", field: "keywords", reason: "too-many" })
    for (const hitChance of ["319.7", "1/0", "2/319", "1/abc", "約1/319"]) expect(await refusal({ hitChance })).toEqual({ type: "invalid-body", field: "hitChance", reason: "not-a-chance" })
    expect((await client.call("GET", "/catalog")).body.machines).toEqual([])
  })

  test("a hit chance is written as a spec sheet writes it, whatever its width", async () => {
    const client = await api()
    const made = await register(client, { ...GENKI, hitChance: "１／３１９．７" })
    expect((await client.call("GET", `/machines/${made.body.machineId}`)).body.machine.hitChance).toBe("1/319.7")
  })

  test("a pachislot machine has no hit chance", async () => {
    const client = await api()
    expect((await register(client, { ...GENKI, gameKind: "pachislot" })).body.error).toEqual({ type: "invalid-body", field: "hitChance", reason: "unknown-value" })
  })
})

describe("an administrator setting right how a machine is described", () => {
  const described = { name: "e星都幻鬼W", modelName: "e星都幻鬼W1", keywords: ["ゲンキ", "幻鬼"], hitChance: "1/399.9" }

  test("changes its name, model name, keywords and hit chance at once, and every device takes them anew", async () => {
    const client = await api({ adminToken: TOKEN })
    const made = await register(client, GENKI)
    const before = (await client.call("GET", "/catalog/version")).body.version
    expect((await client.call("PUT", `/admin/machines/${made.body.machineId}/description`, { headers: AS_ADMIN, body: described })).status).toBe(204)
    expect((await client.call("GET", "/catalog/version")).body.version).not.toBe(before)
    expect((await client.call("GET", `/machines/${made.body.machineId}`)).body.machine).toEqual({ id: made.body.machineId, gameKind: "pachinko", ...described, releasedOn: "2025-02-03", formulaCount: 1 })
    expect(await found(client, "せいとげんき")).toEqual([])
    expect(await found(client, "幻鬼w1")).toEqual(["e星都幻鬼W"])
  })

  test("takes away what is left out, and leaves the formulas as they are", async () => {
    const client = await api({ adminToken: TOKEN })
    const made = await register(client, GENKI)
    const formulas = (await client.call("GET", `/machines/${made.body.machineId}`)).body.formulas
    await client.call("PUT", `/admin/machines/${made.body.machineId}/description`, { headers: AS_ADMIN, body: { name: "e星都幻鬼" } })
    const after = (await client.call("GET", `/machines/${made.body.machineId}`)).body
    expect(after.machine).toEqual({ id: made.body.machineId, gameKind: "pachinko", name: "e星都幻鬼", keywords: [], releasedOn: "2025-02-03", formulaCount: 1 })
    expect(after.formulas).toEqual(formulas)
  })

  test("sets a release date where one is given, keeps it where none is, and refuses one no machine could have", async () => {
    const client = await api({ adminToken: TOKEN })
    const made = await register(client, GENKI)
    const at = `/admin/machines/${made.body.machineId}/description`
    expect((await client.call("PUT", at, { headers: AS_ADMIN, body: { ...described, releasedOn: "2025-02-17" } })).status).toBe(204)
    expect((await client.call("GET", `/machines/${made.body.machineId}`)).body.machine.releasedOn).toBe("2025-02-17")
    await client.call("PUT", at, { headers: AS_ADMIN, body: described })
    expect((await client.call("GET", `/machines/${made.body.machineId}`)).body.machine.releasedOn).toBe("2025-02-17")
    expect((await client.call("PUT", at, { headers: AS_ADMIN, body: { ...described, releasedOn: "2025-02-30" } })).body.error).toEqual({ type: "invalid-body", field: "releasedOn", reason: "not-a-date" })
    expect((await client.call("PUT", at, { headers: AS_ADMIN, body: { ...described, releasedOn: "1969-12-31" } })).body.error).toEqual({ type: "invalid-body", field: "releasedOn", reason: "too-early" })
    expect((await client.call("GET", "/catalog")).body.machines[0].machine.releasedOn).toBe("2025-02-17")
  })

  test("frees the old name, and cannot take a name another machine of the game goes by", async () => {
    const client = await api({ adminToken: TOKEN })
    const first = await register(client, GENKI)
    await register(client, { ...GENKI, name: "別の機種", modelName: "e別の機種X" })
    expect((await client.call("PUT", `/admin/machines/${first.body.machineId}/description`, { headers: AS_ADMIN, body: { name: "別の機種" } })).body.error).toEqual({ type: "conflict", what: "machine-name" })
    await client.call("PUT", `/admin/machines/${first.body.machineId}/description`, { headers: AS_ADMIN, body: { name: "改名した機種" } })
    expect((await register(client, GENKI)).status).toBe(201)
  })

  test("is no one without the token, and finds no machine that is not there", async () => {
    const client = await api({ adminToken: TOKEN })
    const made = await register(client, GENKI)
    expect((await client.call("PUT", `/admin/machines/${made.body.machineId}/description`, { body: described })).status).toBe(404)
    expect((await client.call("PUT", `/admin/machines/${made.body.machineId}/description`, { as: ALICE, body: described })).status).toBe(404)
    expect((await client.call("PUT", "/admin/machines/0199aa5f-0000-7000-8000-000000000000/description", { headers: AS_ADMIN, body: described })).body.error).toEqual({ type: "not-found", what: "machine" })
    expect((await client.call("GET", `/machines/${made.body.machineId}`)).body.machine.name).toBe("e星都幻鬼")
  })
})

describe("the bonuses a formula states", () => {
  const BONUSES = [
    { name: "10R", payout: 1500, spent: 100 },
    { name: "4R", payout: 400, spent: 40 },
  ]
  const stating = (bonuses: unknown) => ({ ...GENKI, formula: { ...manual(), bonuses } })

  test("are kept in the order given, and delivered with the formula, not the machine", async () => {
    const client = await api()
    const made = await register(client, stating(BONUSES))
    expect(made.status).toBe(201)
    const detail = (await client.call("GET", `/machines/${made.body.machineId}`)).body
    expect(detail.formulas[0].bonuses).toEqual(BONUSES)
    expect(detail.machine.bonuses).toBeUndefined()
    expect((await client.call("GET", "/catalog")).body.machines[0].formulas[0].bonuses).toEqual(BONUSES)
  })

  test("say how many jackpots each is won over where it is more than one, and nothing of it where it is one", async () => {
    const client = await api()
    const made = await register(client, stating([{ name: "20R", payout: 3000, spent: 200, jackpots: 2 }, { name: "10R", payout: 1500, spent: 100, jackpots: 1 }]))
    expect(made.status).toBe(201)
    expect((await client.call("GET", `/machines/${made.body.machineId}`)).body.formulas[0].bonuses).toEqual([{ name: "20R", payout: 3000, spent: 200, jackpots: 2 }, { name: "10R", payout: 1500, spent: 100 }])
  })

  test("take a 0R, which pays out nothing and takes nothing", async () => {
    const client = await api()
    const made = await register(client, stating([{ name: "10R", payout: 1500, spent: 100 }, { name: "Re:Start", payout: 0, spent: 0 }]))
    expect(made.status).toBe(201)
    expect((await client.call("GET", `/machines/${made.body.machineId}`)).body.formulas[0].bonuses).toEqual([{ name: "10R", payout: 1500, spent: 100 }, { name: "Re:Start", payout: 0, spent: 0 }])
  })

  test("are refused when one pays out nothing for balls shot, or less than is shot for it, or shares a name, and a formula typed in states at least one", async () => {
    const client = await api()
    const refusal = async (bonuses: unknown) => (await register(client, stating(bonuses))).body.error
    expect(await refusal("10R")).toEqual({ type: "invalid-body", field: "bonuses", reason: "not-a-list" })
    expect(await refusal([{ name: "", payout: 1500, spent: 100 }])).toEqual({ type: "invalid-body", field: "bonuses", reason: "missing" })
    expect(await refusal([{ name: "0R", payout: 0, spent: 10 }])).toEqual({ type: "invalid-body", field: "bonuses", reason: "not-positive" })
    expect(await refusal([{ name: "10R", payout: 100, spent: 101 }])).toEqual({ type: "invalid-body", field: "bonuses", reason: "not-positive" })
    expect(await refusal([{ name: "10R", payout: 1500.5, spent: 100 }])).toEqual({ type: "invalid-body", field: "bonuses", reason: "not-positive" })
    expect(await refusal([{ name: "20R", payout: 3000, spent: 200, jackpots: 0 }])).toEqual({ type: "invalid-body", field: "bonuses", reason: "not-positive" })
    expect(await refusal([{ name: "20R", payout: 3000, spent: 200, jackpots: 51 }])).toEqual({ type: "invalid-body", field: "bonuses", reason: "not-positive" })
    expect(await refusal([{ name: "20R", payout: 3000, spent: 200, jackpots: "2" }])).toEqual({ type: "invalid-body", field: "bonuses", reason: "not-positive" })
    expect(await refusal([BONUSES[0], { ...BONUSES[1], name: "１０Ｒ" }])).toEqual({ type: "invalid-body", field: "bonuses", reason: "unknown-value" })
    expect(await refusal(Array.from({ length: 21 }, (_, index) => ({ name: `B${index}`, payout: 1500, spent: 100 })))).toEqual({ type: "invalid-body", field: "bonuses", reason: "too-many" })
    expect(await refusal([])).toEqual({ type: "invalid-body", field: "bonuses", reason: "missing" })
    expect(await refusal(undefined)).toEqual({ type: "invalid-body", field: "bonuses", reason: "missing" })
    expect((await client.call("GET", "/catalog")).body.machines).toEqual([])
  })
})
