import { describe, expect, test } from "bun:test"

import { api, countOf, device, formulasOf } from "./support/harness"
import { manual, registered } from "./support/pachinko/formulas"

const ALICE = device(1_759_000_000_001)
const BOB = device(1_759_000_000_002)
const CAROL = device(1_759_000_000_003)

const UUIDV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe("registering a machine", () => {
  test("stores the machine and its first formula together, both with UUIDv7 ids", async () => {
    const { client, machineId, manualId } = await registered(ALICE)
    expect(machineId).toMatch(UUIDV7)
    expect(manualId).toMatch(UUIDV7)
    const detail = await client.call("GET", `/machines/${machineId}`)
    expect(detail.status).toBe(200)
    expect(detail.body.machine).toEqual({ id: machineId, gameKind: "pachinko", name: "流星無双", modelName: "型式A1", keywords: [], hitChance: "1/319.7", releasedOn: "2026-08-04", formulaCount: 2 })
    expect(detail.body.formulas[0]).toMatchObject({ id: manualId, kind: "manual", figures: { roundChanceOneIn: 13.9, payoutPerRound: 140 } })
    expect(detail.body.distributions).toBeUndefined()
  })

  test("never stores a machine without a formula", async () => {
    const client = await api()
    const bare = await client.call("POST", "/machines", { as: ALICE, body: { gameKind: "pachinko", modelName: "型式A", hitChance: "1/319.7", name: "流星無双", releasedOn: "2026-08-04" } })
    expect(bare.status).toBe(400)
    expect(bare.body.error).toEqual({ type: "invalid-body", field: "formula", reason: "missing" })
    const broken = await client.call("POST", "/machines", { as: ALICE, body: { gameKind: "pachinko", modelName: "型式A1", hitChance: "1/319.7", name: "流星無双", releasedOn: "2026-08-04", formula: manual(-1) } })
    expect(broken.status).toBe(400)
    expect(countOf(client, "machines")).toBe(0)
  })

  test("a name that is a forbidden word on its own is refused; one holding it inside a word is not", async () => {
    const { client } = await registered(ALICE)
    const rude = await client.call("POST", "/machines", { as: ALICE, body: { gameKind: "pachinko", modelName: "型式A2", hitChance: "1/319.7", name: "P ウンコ", releasedOn: "2026-08-04", formula: manual() } })
    expect(rude.status).toBe(400)
    expect(rude.body.error).toEqual({ type: "invalid-body", field: "name", reason: "forbidden" })
    const real = await client.call("POST", "/machines", { as: ALICE, body: { gameKind: "pachinko", modelName: "型式A3", hitChance: "1/319.7", name: "ぱちんこ ウルトラマン", releasedOn: "2026-08-04", formula: manual() } })
    expect(real.status).toBe(201)
  })

  test("a name is kept at half width, its spaces single, a wave dash as a tilde, and none after the letter it opens with", async () => {
    const client = await api()
    const sent = await client.call("POST", "/machines", { as: ALICE, body: { gameKind: "pachinko", modelName: "型式A4", hitChance: "1/319.7", name: " Ｐ　流星無双　Ⅱ！ ", releasedOn: "2026-08-04", formula: manual() } })
    expect(sent.status).toBe(201)
    await client.call("POST", "/machines", { as: ALICE, body: { gameKind: "pachinko", modelName: "型式A5", hitChance: "1/319.7", name: "P FABLE  TALE", releasedOn: "2026-08-03", formula: manual() } })
    await client.call("POST", "/machines", { as: ALICE, body: { gameKind: "pachinko", modelName: "型式A6", hitChance: "1/319.7", name: "CR銀狼〜焔の紋章～", releasedOn: "2026-08-02", formula: manual() } })
    expect((await client.call("GET", "/machines")).body.map((machine: { name: string }) => machine.name)).toEqual(["P流星無双 II!", "P FABLE TALE", "CR銀狼~焔の紋章~"])
  })

  test("a name opening with its letter in lower case is closed up as one in upper case is, so the two are one name", async () => {
    const client = await api()
    expect((await client.call("POST", "/machines", { as: ALICE, body: { gameKind: "pachinko", modelName: "型式A7", hitChance: "1/319.7", name: "P流星無双", releasedOn: "2026-08-04", formula: manual() } })).status).toBe(201)
    const again = await client.call("POST", "/machines", { as: BOB, body: { gameKind: "pachinko", modelName: "型式A8", hitChance: "1/319.7", name: "p 流星無双", releasedOn: "2026-08-04", formula: manual() } })
    expect([again.status, again.body.error]).toEqual([409, { type: "conflict", what: "machine-name" }])
  })

  test("a model name is kept as a name is", async () => {
    const client = await api()
    await client.call("POST", "/machines", { as: ALICE, body: { gameKind: "pachinko", name: "Pラブ嬢", modelName: " Ｐ　ラブ嬢３Ｈ１ＹＺ６　〜極〜 ", hitChance: "1/319.7", releasedOn: "2026-08-04", formula: manual() } })
    expect((await client.call("GET", "/machines")).body.map((machine: { modelName: string }) => machine.modelName)).toEqual(["Pラブ嬢3H1YZ6 ~極~"])
  })

  test("a name already taken, as compared, is a conflict, and leaves no formula behind", async () => {
    const { client } = await registered(ALICE)
    const formulas = countOf(client, "formulas")
    const again = await client.call("POST", "/machines", { as: BOB, body: { gameKind: "pachinko", modelName: "型式A7", hitChance: "1/319.7", name: "  流星無双 ", releasedOn: "2026-08-04", formula: manual() } })
    expect(again.status).toBe(409)
    expect(again.body.error).toEqual({ type: "conflict", what: "machine-name" })
    expect(countOf(client, "formulas")).toBe(formulas)
  })

  test("lists the newest release first", async () => {
    const client = await api()
    await client.call("POST", "/machines", { as: ALICE, body: { gameKind: "pachinko", modelName: "型式A8", hitChance: "1/319.7", name: "古い機種", releasedOn: "2023-01-10", formula: manual() } })
    await client.call("POST", "/machines", { as: ALICE, body: { gameKind: "pachinko", modelName: "型式A9", hitChance: "1/319.7", name: "新しい機種", releasedOn: "2026-09-01", formula: manual() } })
    expect((await client.call("GET", "/machines")).body.map((machine: { name: string }) => machine.name)).toEqual(["新しい機種", "古い機種"])
    const undated = await client.call("POST", "/machines", { as: ALICE, body: { gameKind: "pachinko", modelName: "型式A10", hitChance: "1/319.7", name: "日付なし", formula: manual() } })
    expect(undated.body.error).toEqual({ type: "invalid-body", field: "releasedOn", reason: "missing" })
    const impossible = await client.call("POST", "/machines", { as: ALICE, body: { gameKind: "pachinko", modelName: "型式A11", hitChance: "1/319.7", name: "日付なし", releasedOn: "2026-02-30", formula: manual() } })
    expect(impossible.body.error).toEqual({ type: "invalid-body", field: "releasedOn", reason: "not-a-date" })
  })

  test("is refused with no name, a blank one, or a release date no machine can have", async () => {
    const client = await api()
    const machines = countOf(client, "machines")
    const register = (body: Record<string, unknown>) => client.call("POST", "/machines", { as: ALICE, body: { gameKind: "pachinko", modelName: "型式A12", hitChance: "1/319.7", formula: manual(), ...body } })
    expect((await register({ releasedOn: "2025-09-01" })).body.error).toEqual({ type: "invalid-body", field: "name", reason: "missing" })
    expect((await register({ name: "  　", releasedOn: "2025-09-01" })).body.error).toEqual({ type: "invalid-body", field: "name", reason: "missing" })
    expect((await register({ name: "日付空", releasedOn: "" })).body.error).toEqual({ type: "invalid-body", field: "releasedOn", reason: "missing" })
    expect((await register({ name: "大昔", releasedOn: "1969-12-31" })).body.error).toEqual({ type: "invalid-body", field: "releasedOn", reason: "too-early" })
    expect((await register({ name: "遠い未来", releasedOn: "2099-01-01" })).body.error).toEqual({ type: "invalid-body", field: "releasedOn", reason: "too-far-ahead" })
    expect(countOf(client, "machines")).toBe(machines)
    expect((await register({ name: "来年の新台", releasedOn: "2026-10-01" })).status).toBe(201)
  })

  test("is found by any part of its name, width and case aside, a search's wildcards taken literally", async () => {
    const client = await api()
    const made = await client.call("POST", "/machines", { as: ALICE, body: { gameKind: "pachinko", modelName: "型式A13", hitChance: "1/319.7", name: "Pフィーバー ＡＢＣ", releasedOn: "2026-08-04", formula: manual() } })
    const found = await client.call("GET", `/machines?q=${encodeURIComponent("ａｂｃ")}`)
    expect(found.body).toEqual([{ id: made.body.machineId, gameKind: "pachinko", name: "Pフィーバー ABC", modelName: "型式A13", keywords: [], hitChance: "1/319.7", releasedOn: "2026-08-04", formulaCount: 1 }])
    expect((await client.call("GET", "/machines?q=100%25")).body).toEqual([])
  })

  test("a write without a device id is refused", async () => {
    const client = await api()
    const reply = await client.call("POST", "/machines", { body: { gameKind: "pachinko", modelName: "型式A14", hitChance: "1/319.7", name: "流星無双", releasedOn: "2026-08-04", formula: manual() } })
    expect(reply.status).toBe(401)
    const named = await client.call("POST", "/machines", { as: "alice", body: { gameKind: "pachinko", modelName: "型式A15", hitChance: "1/319.7", name: "流星無双", formula: manual() } })
    expect(named.status).toBe(401)
  })
})

describe("a machine's model name", () => {
  const registering = (name: string, modelName: string, gameKind: "pachinko" = "pachinko") => ({
    gameKind,
    name,
    modelName,
    hitChance: "1/319.7",
    releasedOn: "2026-09-01",
    formula: { kind: "manual", figures: { roundChanceOneIn: 13.9, payoutPerRound: 140 }, bonuses: [{ name: "10R", payout: 1500, spent: 100 }] },
  })

  test("is one machine's: a second machine is refused it however it is written, until the first is hidden", async () => {
    const { client } = await registered(ALICE)
    const first = await client.call("POST", "/machines", { as: BOB, body: registering("e団長 99ver.", "e／ 押忍団長 ／A03") })
    expect(first.status).toBe(201)
    const kept = (await client.call("GET", `/machines/${first.body.machineId}`)).body.machine.modelName
    expect(kept).toBe("e/押忍団長/A03")
    const again = await client.call("POST", "/machines", { as: CAROL, body: registering("e団長 別名", "E/押忍団長/a03") })
    expect([again.status, again.body.error]).toEqual([409, { type: "conflict", what: "model-name" }])
    expect((await client.call("POST", "/machines", { as: CAROL, body: registering("e団長 別名", "e/押忍団長/M03") })).status).toBe(201)
  })

  test("is one machine's even registered twice in the same instant: the table holds it, and the second is told of the model name", async () => {
    const { client } = await registered(ALICE)
    const both = await Promise.all([client.call("POST", "/machines", { as: BOB, body: registering("同時の機種", "同時/A01") }), client.call("POST", "/machines", { as: CAROL, body: registering("同時の別機種", "同時/a01") })])
    expect(both.map((each) => each.status).toSorted()).toEqual([201, 409])
    expect(both.find((each) => each.status === 409)?.body.error).toEqual({ type: "conflict", what: "model-name" })
    expect(() => client.sqlite.exec("UPDATE machines SET comparable_model_name = '同時/a01'")).toThrow(/UNIQUE/)
  })
})

describe("marks on a formula", () => {
  test("a device adopts one formula per machine: a new adoption replaces the old", async () => {
    const { client, machineId, manualId, simulatedId } = await registered(ALICE)
    expect((await client.call("PUT", `/formulas/${manualId}/marks/adoption`, { as: BOB })).status).toBe(204)
    expect((await client.call("PUT", `/formulas/${simulatedId}/marks/adoption`, { as: BOB })).status).toBe(204)
    await client.call("PUT", `/formulas/${simulatedId}/marks/adoption`, { as: CAROL })
    const standing = Object.fromEntries((await formulasOf(client, machineId)).map((each) => [each.id, each.standing.adoptions]))
    expect(standing).toEqual({ [manualId]: 0, [simulatedId]: 2 })
  })

  test("only a formula with a basis can be checked; a device checks one once each way, and neither is taken back", async () => {
    const { client, machineId, manualId, simulatedId } = await registered(ALICE)
    const refused = await client.call("PUT", `/formulas/${manualId}/marks/verification`, { as: BOB })
    expect(refused.status).toBe(400)
    expect(refused.body.error).toEqual({ type: "not-verifiable" })
    expect((await client.call("PUT", `/formulas/${manualId}/marks/refutation`, { as: BOB })).body.error).toEqual({ type: "not-verifiable" })
    const standing = async () => (await formulasOf(client, machineId)).find((each) => each.id === simulatedId).standing
    await client.call("PUT", `/formulas/${simulatedId}/marks/verification`, { as: BOB })
    await client.call("PUT", `/formulas/${simulatedId}/marks/verification`, { as: BOB })
    await client.call("PUT", `/formulas/${simulatedId}/marks/verification`, { as: ALICE })
    expect(await standing()).toMatchObject({ verifications: 2, refutations: 0 })
    await client.call("PUT", `/formulas/${simulatedId}/marks/refutation`, { as: BOB })
    await client.call("PUT", `/formulas/${simulatedId}/marks/refutation`, { as: BOB })
    expect(await standing()).toMatchObject({ verifications: 2, refutations: 1 })
    const takenBack = await client.call("DELETE", `/formulas/${simulatedId}/marks/verification`, { as: BOB })
    expect([takenBack.status, takenBack.body.error]).toEqual([400, { type: "check-stands" }])
    expect(await standing()).toMatchObject({ verifications: 2, refutations: 1 })
  })

  test("a rejection counts against a formula, and a person may adopt and reject the same one, clearing each on its own", async () => {
    const { client, machineId, manualId, simulatedId } = await registered(ALICE)
    const standing = async (id: string) => (await formulasOf(client, machineId)).find((each) => each.id === id).standing
    await client.call("PUT", `/formulas/${manualId}/marks/adoption`, { as: BOB })
    await client.call("PUT", `/formulas/${manualId}/marks/rejection`, { as: BOB })
    await client.call("PUT", `/formulas/${manualId}/marks/rejection`, { as: BOB })
    expect(await standing(manualId)).toMatchObject({ adoptions: 1, rejections: 1 })
    await client.call("PUT", `/formulas/${simulatedId}/marks/rejection`, { as: BOB })
    expect(await standing(simulatedId)).toMatchObject({ rejections: 1 })
    await client.call("DELETE", `/formulas/${manualId}/marks/adoption`, { as: BOB })
    expect(await standing(manualId)).toMatchObject({ adoptions: 0, rejections: 1 })
    await client.call("DELETE", `/formulas/${simulatedId}/marks/rejection`, { as: BOB })
    expect(await standing(simulatedId)).toMatchObject({ rejections: 0 })
  })

  test("a formula's favourite and its machine's favourite are separate things", async () => {
    const { client, machineId, manualId } = await registered(ALICE)
    await client.call("PUT", `/machines/${machineId}/favorite`, { as: BOB })
    expect((await formulasOf(client, machineId)).every((each) => each.standing.favorites === 0)).toBe(true)
    await client.call("PUT", `/formulas/${manualId}/marks/favorite`, { as: BOB })
    expect(countOf(client, "machine_favorites")).toBe(1)
    expect(countOf(client, "formula_favorites")).toBe(1)
    await client.call("DELETE", `/machines/${machineId}/favorite`, { as: BOB })
    expect(countOf(client, "formula_favorites")).toBe(1)
  })

  test("uses are counted every time", async () => {
    const { client, machineId, manualId } = await registered(ALICE)
    await client.call("POST", `/formulas/${manualId}/uses`, { as: BOB })
    await client.call("POST", `/formulas/${manualId}/uses`, { as: BOB })
    expect((await formulasOf(client, machineId)).find((each) => each.id === manualId).standing.uses).toBe(2)
  })

  test("an unknown mark or formula is refused", async () => {
    const { client, manualId } = await registered(ALICE)
    expect((await client.call("PUT", `/formulas/${manualId}/marks/like`, { as: BOB })).body.error).toEqual({ type: "invalid-body", field: "mark", reason: "unknown-value" })
    expect((await client.call("PUT", `/formulas/${device(1_759_000_000_009)}/marks/favorite`, { as: BOB })).body.error).toEqual({ type: "not-found", what: "formula" })
  })
})

describe("tags", () => {
  test("tag a machine or a formula, once each, removable only by whoever tagged", async () => {
    const { client, machineId, simulatedId } = await registered(ALICE)
    const tag = await client.call("POST", "/tags", { as: ALICE, body: { name: "甘デジ" } })
    expect(tag.status).toBe(201)
    const onMachine = await client.call("POST", "/taggings", { as: ALICE, body: { tagId: tag.body.id, targetType: "machine", targetId: machineId } })
    const onFormula = await client.call("POST", "/taggings", { as: ALICE, body: { tagId: tag.body.id, targetType: "formula", targetId: simulatedId } })
    expect([onMachine.status, onFormula.status]).toEqual([201, 201])
    const twice = await client.call("POST", "/taggings", { as: BOB, body: { tagId: tag.body.id, targetType: "machine", targetId: machineId } })
    expect(twice.body.error).toEqual({ type: "conflict", what: "tagging" })
    const wrongKind = await client.call("POST", "/taggings", { as: ALICE, body: { tagId: tag.body.id, targetType: "formula", targetId: machineId } })
    expect(wrongKind.body.error).toEqual({ type: "not-found", what: "target" })
    expect((await client.call("DELETE", `/taggings/${onMachine.body.id}`, { as: BOB })).status).toBe(404)
    expect((await client.call("DELETE", `/taggings/${onMachine.body.id}`, { as: ALICE })).status).toBe(204)
  })

  test("a tag name is taken once", async () => {
    const client = await api()
    await client.call("POST", "/tags", { as: ALICE, body: { name: "甘デジ" } })
    expect((await client.call("POST", "/tags", { as: BOB, body: { name: "甘デジ" } })).body.error).toEqual({ type: "conflict", what: "tag-name" })
  })
})

describe("routes", () => {
  test("an unknown route or method says so", async () => {
    const client = await api()
    expect((await client.call("GET", "/specs")).status).toBe(404)
    expect((await client.call("PATCH", "/machines")).status).toBe(405)
  })
})
