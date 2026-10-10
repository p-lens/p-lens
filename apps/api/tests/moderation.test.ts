import type * as PachinkoContract from "@p-lens/contracts/pachinko"
import { describe, expect, test } from "bun:test"

import { type Api, api, device } from "./support/harness"

const ALICE = device(1_759_000_000_001)
const VANDAL = device(1_759_000_000_066)
const TOKEN = "admin-secret"
const AS_ADMIN = { Authorization: `Bearer ${TOKEN}` }

const manual = (roundChanceOneIn = 319.7): PachinkoContract.NewFormulaDto => ({ kind: "manual", figures: { roundChanceOneIn, payoutPerRound: 140 }, bonuses: [{ name: "10R", payout: 1500, spent: 100 }] })

const register = async (client: Api, as: string, name: string): Promise<{ readonly machineId: string; readonly formulaId: string }> =>
  (await client.call("POST", "/machines", { as, body: { gameKind: "pachinko", modelName: `型式${name}`, hitChance: "1/319.7", name, releasedOn: "2025-09-01", formula: manual() } })).body

const names = async (client: Api): Promise<readonly string[]> => (await client.call("GET", "/catalog")).body.machines.map((machine: { machine: { name: string } }) => machine.machine.name)

describe("an administrator", () => {
  test("is only one with the deployment's token, and none without one set", async () => {
    expect((await (await api()).call("GET", "/admin/recent", { headers: AS_ADMIN })).status).toBe(404)
    const client = await api({ adminToken: TOKEN })
    expect((await client.call("GET", "/admin/recent", { headers: { Authorization: "Bearer guess" } })).status).toBe(404)
    expect((await client.call("GET", "/admin/recent", { headers: AS_ADMIN })).status).toBe(200)
  })

  test("sees what was registered lately, by which device", async () => {
    const client = await api({ adminToken: TOKEN })
    const { machineId } = await register(client, VANDAL, "ゴミ機種")
    const recent = (await client.call("GET", "/admin/recent", { headers: AS_ADMIN })).body
    expect(recent.map((each: { target: string }) => each.target).sort()).toEqual(["formula", "machine"])
    expect(recent.find((each: { target: string }) => each.target === "machine")).toMatchObject({ id: machineId, name: "ゴミ機種", device: VANDAL })
  })

  test("hides a machine from everyone, letting its name go, and can show it again", async () => {
    const client = await api({ adminToken: TOKEN })
    const squatted = await register(client, VANDAL, "流星無双")
    const before = (await client.call("GET", "/catalog/version")).body.version
    expect((await client.call("PUT", `/admin/machine/${squatted.machineId}/hidden`, { headers: AS_ADMIN, body: { reason: "でたらめ" } })).status).toBe(204)
    expect((await client.call("GET", "/catalog/version")).body.version).not.toBe(before)
    expect(await names(client)).toEqual([])
    expect((await client.call("GET", `/machines/${squatted.machineId}`)).status).toBe(404)
    expect((await client.call("PUT", `/formulas/${squatted.formulaId}/marks/adoption`, { as: ALICE })).status).toBe(404)
    expect((await client.call("POST", `/machines/${squatted.machineId}/formulas`, { as: ALICE, body: manual() })).status).toBe(404)
    await register(client, ALICE, "流星無双")
    expect(await names(client)).toEqual(["流星無双"])
    const shown = await client.call("DELETE", `/admin/machine/${squatted.machineId}/hidden`, { headers: AS_ADMIN })
    expect(shown.body.error).toEqual({ type: "conflict", what: "machine-name" })
  })

  test("hides one formula, leaving its machine", async () => {
    const client = await api({ adminToken: TOKEN })
    const { machineId } = await register(client, ALICE, "森物語")
    const junk = (await client.call("POST", `/machines/${machineId}/formulas`, { as: VANDAL, body: manual(1.1) })).body.id
    await client.call("PUT", `/admin/formula/${junk}/hidden`, { headers: AS_ADMIN })
    const detail = (await client.call("GET", `/machines/${machineId}`)).body
    expect(detail.machine.formulaCount).toBe(1)
    expect(detail.formulas.map((formula: { id: string }) => formula.id)).not.toContain(junk)
  })

  test("hides everything one device registered in one go", async () => {
    const client = await api({ adminToken: TOKEN })
    const { machineId } = await register(client, ALICE, "森物語")
    await register(client, VANDAL, "荒らし1")
    await register(client, VANDAL, "荒らし2")
    await client.call("POST", `/machines/${machineId}/formulas`, { as: VANDAL, body: manual(1.1) })
    const hidden = await client.call("PUT", `/admin/devices/${VANDAL}/hidden`, { headers: AS_ADMIN, body: { reason: "荒らし" } })
    expect(hidden.body).toEqual({ machines: 2, formulas: 3, distributions: 0 })
    expect(await names(client)).toEqual(["森物語"])
    expect((await client.call("GET", `/machines/${machineId}`)).body.formulas).toHaveLength(1)
  })
})

describe("writes", () => {
  test("past an address's limit are refused for now, reads going on", async () => {
    const client = await api({ limits: async (bucket) => bucket !== "write" })
    const refused = await client.call("PUT", "/machines/x/favorite", { as: ALICE })
    expect(refused.status).toBe(429)
    expect(refused.body.error).toEqual({ type: "too-many-requests" })
    expect((await client.call("GET", "/catalog/version")).status).toBe(200)
  })

  test("registering something new needs the check a person is doing it; a mark does not", async () => {
    const client = await api({ humanCheck: async (token) => token === "human" })
    const robot = await client.call("POST", "/machines", { as: ALICE, body: { gameKind: "pachinko", modelName: "型式A2", hitChance: "1/319.7", name: "森", releasedOn: "2025-09-01", formula: manual() } })
    expect(robot.status).toBe(403)
    expect(robot.body.error).toEqual({ type: "human-check-failed" })
    const person = await client.call("POST", "/machines", {
      as: ALICE,
      headers: { "X-Turnstile-Token": "human" },
      body: { gameKind: "pachinko", modelName: "型式A3", hitChance: "1/319.7", name: "森", releasedOn: "2025-09-01", formula: manual() },
    })
    expect(person.status).toBe(201)
    expect((await client.call("PUT", `/formulas/${person.body.formulaId}/marks/adoption`, { as: ALICE })).status).toBe(204)
  })
})
