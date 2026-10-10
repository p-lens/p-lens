import { describe, expect, test } from "bun:test"

import { originPolicyOf, routedPath } from "../src/infrastructure/origins"
import { api } from "./support/harness"

const ALICE = "01a10000-0000-7000-8000-000000000001"
const APP = "https://app.example"

const register = (name: string) => ({
  gameKind: "pachinko",
  modelName: `型式${name}`,
  hitChance: "1/319.7",
  name,
  releasedOn: "2025-09-01",
  formula: { kind: "manual", figures: { roundChanceOneIn: 319.7, payoutPerRound: 140 }, bonuses: [{ name: "10R", payout: 1500, spent: 100 }] },
})

describe("the pages a deployment serves the app from", () => {
  test("are read from a comma-separated list, none listed taking any", () => {
    expect(originPolicyOf(" https://app.example/, https://beta.example ")).toEqual({ type: "only", origins: ["https://app.example", "https://beta.example"] })
    expect(originPolicyOf(undefined)).toEqual({ type: "any" })
    expect(originPolicyOf(" , ")).toEqual({ type: "any" })
  })

  test("alone may write, a copy of the app served elsewhere or a page naming none being refused", async () => {
    const client = await api({ origins: originPolicyOf(APP) })
    const elsewhere = await client.call("POST", "/machines", { as: ALICE, origin: "https://copy.example", body: register("よそ") })
    expect(elsewhere.status).toBe(403)
    expect(elsewhere.body.error).toEqual({ type: "forbidden-origin" })
    expect((await client.call("POST", "/machines", { as: ALICE, body: register("名乗らず") })).status).toBe(403)
    expect((await client.call("GET", "/machines", { origin: APP })).body).toEqual([])
    const ours = await client.call("POST", "/machines", { as: ALICE, origin: APP, body: register("ここ") })
    expect(ours.status).toBe(201)
    expect(ours.headers.get("Access-Control-Allow-Origin")).toBe(APP)
  })

  test("alone may read, the catalog refused to any other page and to a request naming none", async () => {
    const client = await api({ origins: originPolicyOf(APP) })
    const ours = await client.call("GET", "/catalog/version", { origin: APP })
    expect(ours.status).toBe(200)
    expect(ours.headers.get("Access-Control-Allow-Origin")).toBe(APP)
    const elsewhere = await client.call("GET", "/catalog", { origin: "https://copy.example" })
    expect(elsewhere.status).toBe(403)
    expect(elsewhere.headers.get("Access-Control-Allow-Origin")).toBeNull()
    expect((await client.call("GET", "/catalog")).status).toBe(403)
  })

  test("is the API's own origin too, when it is served under the app's", async () => {
    const client = await api({ origins: originPolicyOf("https://api.test"), basePath: "/api" })
    expect((await client.call("GET", "/api/catalog/version", { site: "same-origin" })).status).toBe(200)
    expect((await client.call("GET", "/api/catalog/version", { site: "cross-site" })).status).toBe(403)
    expect((await client.call("GET", "/catalog/version", { site: "same-origin" })).status).toBe(404)
  })

  test("routes a path under the prefix the API is served under", () => {
    expect(routedPath("/catalog", "")).toBe("/catalog")
    expect(routedPath("/api/catalog", "/api")).toBe("/catalog")
    expect(routedPath("/apiary", "/api")).toBeUndefined()
  })
})
