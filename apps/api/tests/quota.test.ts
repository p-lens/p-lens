import { describe, expect, test } from "bun:test"

import { formatUuidV7 } from "@p-lens/uuidv7"

import { type Quotas, STANDARD_QUOTAS, standingOf } from "../src/domain/quota"
import { type Effects, runtimeEffects } from "../src/infrastructure/effects"
import { api, countOf, device } from "./support/harness"

const ALICE = device(1_760_000_000_001)
const BOB = device(1_760_000_000_002)
const CAROL = device(1_760_000_000_003)
const HOME = { "CF-Connecting-IP": "203.0.113.7" }
const START = Date.parse("2026-10-10T12:00:00.000Z")
const MINUTE = 60_000

const register = (name: string) => ({
  gameKind: "pachinko",
  modelName: `型式${name}`,
  hitChance: "1/319.7",
  name,
  releasedOn: "2025-09-01",
  formula: { kind: "manual", figures: { roundChanceOneIn: 319.7, payoutPerRound: 140 }, bonuses: [{ name: "10R", payout: 1500, spent: 100 }] },
})

/** Effects over a clock the test moves: ids stay distinct, and now is whenever the test says. */
const clocked = (): { readonly effects: Effects; readonly at: (millis: number) => void } => {
  const held = { now: START, ids: 0 }
  return {
    effects: {
      newId: () => {
        held.ids += 1
        const made = formatUuidV7(1_759_500_000_000 + held.ids, new Uint8Array(10))
        if (!made.ok) throw new Error("the test clock left the UUIDv7 range")
        return made.value
      },
      now: () => new Date(held.now).toISOString(),
      contentHash: runtimeEffects.contentHash,
    },
    at: (millis) => {
      held.now = millis
    },
  }
}

const iso = (millis: number): string => new Date(millis).toISOString()

describe("where a device stands against a quota", () => {
  const quota = STANDARD_QUOTAS.machine

  test("is its whole day with nothing to wait for before it has registered anything", () => {
    expect(standingOf(quota, [], [], iso(START))).toEqual({ remaining: 6 })
  })

  test("waits out the interval after its last, then has the rest of its day", () => {
    expect(standingOf(quota, [iso(START)], [iso(START)], iso(START + MINUTE))).toEqual({ remaining: 5, nextAt: iso(START + 20 * MINUTE) })
    expect(standingOf(quota, [iso(START)], [iso(START)], iso(START + 20 * MINUTE))).toEqual({ remaining: 5 })
  })

  test("with its day full, waits until its oldest registration is a day old", () => {
    const mine = [0, 30, 60, 90, 120, 150].map((minutes) => iso(START + minutes * MINUTE))
    expect(standingOf(quota, mine, mine, iso(START + 400 * MINUTE))).toEqual({ remaining: 0, nextAt: iso(START + 24 * 60 * MINUTE) })
  })

  test("waits for its address where others behind it filled the address's day", () => {
    const others = Array.from({ length: 12 }, (_, index) => iso(START + index * MINUTE))
    expect(standingOf(quota, [], others, iso(START + 60 * MINUTE))).toEqual({ remaining: 0, nextAt: iso(START + 24 * 60 * MINUTE) })
  })
})

describe("registering against the quotas", () => {
  test("a machine is taken, the next refused until twenty minutes on, and what is refused for another reason counts against nothing", async () => {
    const clock = clocked()
    const client = await api({ quotas: STANDARD_QUOTAS, effects: clock.effects })
    expect((await client.call("POST", "/machines", { as: ALICE, headers: HOME, body: { ...register("だめ"), releasedOn: "1900-01-01" } })).status).toBe(400)
    expect((await client.call("POST", "/machines", { as: ALICE, headers: HOME, body: register("一台目") })).status).toBe(201)
    clock.at(START + 19 * MINUTE)
    const early = await client.call("POST", "/machines", { as: ALICE, headers: HOME, body: register("二台目") })
    expect(early.status).toBe(429)
    expect(early.body.error).toEqual({ type: "quota-reached", kind: "machine", nextAt: iso(START + 20 * MINUTE) })
    clock.at(START + 20 * MINUTE)
    expect((await client.call("POST", "/machines", { as: ALICE, headers: HOME, body: register("二台目") })).status).toBe(201)
    expect(countOf(client, "registrations")).toBe(2)
  })

  test("a device is told where it stands before it sets about anything, each kind counted apart", async () => {
    const clock = clocked()
    const client = await api({ quotas: STANDARD_QUOTAS, effects: clock.effects })
    expect((await client.call("GET", "/quota", { as: ALICE, headers: HOME })).body).toEqual({ type: "limited", machine: { remaining: 6 }, addition: { remaining: 12 }, tag: { remaining: 20 } })
    expect(countOf(client, "users")).toBe(0)
    const machine = await client.call("POST", "/machines", { as: ALICE, headers: HOME, body: register("一台目") })
    expect((await client.call("POST", "/tags", { as: ALICE, headers: HOME, body: { name: "甘デジ" } })).status).toBe(201)
    expect((await client.call("POST", `/machines/${machine.body.machineId}/formulas`, { as: ALICE, headers: HOME, body: register("x").formula })).status).toBe(201)
    clock.at(START + MINUTE)
    expect((await client.call("GET", "/quota", { as: ALICE, headers: HOME })).body).toEqual({
      type: "limited",
      machine: { remaining: 5, nextAt: iso(START + 20 * MINUTE) },
      addition: { remaining: 11, nextAt: iso(START + 5 * MINUTE) },
      tag: { remaining: 19 },
    })
    expect((await client.call("GET", "/quota", { headers: HOME })).status).toBe(401)
  })

  test("an address's day is shared by the devices behind it, and a row is kept for a day and no longer", async () => {
    const quotas: Quotas = { ...STANDARD_QUOTAS, machine: { intervalSeconds: 0, perDevice: 1, perAddress: 2 } }
    const clock = clocked()
    const client = await api({ quotas, effects: clock.effects })
    expect((await client.call("POST", "/machines", { as: ALICE, headers: HOME, body: register("一") })).status).toBe(201)
    clock.at(START + MINUTE)
    expect((await client.call("POST", "/machines", { as: BOB, headers: HOME, body: register("二") })).status).toBe(201)
    const third = await client.call("POST", "/machines", { as: CAROL, headers: HOME, body: register("三") })
    expect(third.body.error).toEqual({ type: "quota-reached", kind: "machine", nextAt: iso(START + 24 * 60 * MINUTE) })
    expect((await client.call("GET", "/quota", { as: CAROL, headers: HOME })).body.machine).toEqual({ remaining: 0, nextAt: iso(START + 24 * 60 * MINUTE) })
    expect((await client.call("POST", "/machines", { as: CAROL, headers: { "CF-Connecting-IP": "198.51.100.9" }, body: register("三") })).status).toBe(201)
    clock.at(START + 24 * 60 * MINUTE)
    expect((await client.call("POST", "/machines", { as: ALICE, headers: HOME, body: register("四") })).status).toBe(201)
    expect(countOf(client, "registrations")).toBe(3)
    expect((client.sqlite.query("SELECT COUNT(*) AS n FROM registrations WHERE address_hash LIKE '%203.0.113%'").get() as { n: number }).n).toBe(0)
  })

  test("a deployment with no quotas counts nothing and says so", async () => {
    const client = await api()
    expect((await client.call("GET", "/quota")).body).toEqual({ type: "unlimited" })
    expect((await client.call("POST", "/machines", { as: ALICE, body: register("一") })).status).toBe(201)
    expect((await client.call("POST", "/machines", { as: ALICE, body: register("二") })).status).toBe(201)
    expect(countOf(client, "registrations")).toBe(0)
  })
})
