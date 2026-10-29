import { describe, expect, test } from "bun:test"

import { createHttpCatalogApi } from "../../src/catalog/http/http-catalog-api"

interface Asked {
  readonly url: string
  readonly init: RequestInit
}

/** A shared catalog that answers every request with the one response it is given, keeping what was asked. */
const answering = (response: () => Response) => {
  const asked: Asked[] = []
  const api = createHttpCatalogApi({
    base: "https://api.example",
    request: async (url, init) => {
      asked.push({ url, init })
      return response()
    },
    answerWithin: 1000,
    device: async () => "device-1",
    humanCheck: async () => "human",
  })
  return { api, asked }
}

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

describe("the shared catalog over HTTP", () => {
  test("reads its version without naming the device", async () => {
    const { api, asked } = answering(() => json(200, { version: "v1" }))
    expect(await api.version()).toEqual({ ok: true, value: "v1" })
    expect(asked[0]?.url).toBe("https://api.example/catalog/version")
    expect(new Headers(asked[0]?.init.headers).get("X-P-Lens-Device")).toBeNull()
  })

  test("names the device on every write", async () => {
    const { api, asked } = answering(() => new Response(null, { status: 204 }))
    expect(await api.send({ method: "PUT", path: "/formulas/f1/marks/refutation" })).toEqual({ ok: true, value: undefined })
    expect(asked[0]).toMatchObject({ url: "https://api.example/formulas/f1/marks/refutation", init: { method: "PUT" } })
    expect(new Headers(asked[0]?.init.headers).get("X-P-Lens-Device")).toBe("device-1")
    expect(new Headers(asked[0]?.init.headers).get("X-Turnstile-Token")).toBeNull()
  })

  test("sends a mark as the voter it is counted as, in place of the device", async () => {
    const { api, asked } = answering(() => new Response(null, { status: 204 }))
    expect(await api.send({ method: "PUT", path: "/formulas/f1/marks/adoption", as: "voter-1" })).toEqual({ ok: true, value: undefined })
    expect(new Headers(asked[0]?.init.headers).get("X-P-Lens-Device")).toBe("voter-1")
  })

  test("sends the check that a person is registering with what is registered", async () => {
    const { api, asked } = answering(() => json(201, { id: "f1" }))
    await api.addFormula("m1", { kind: "manual", figures: { roundChanceOneIn: 319.7, payoutPerRound: 140 }, bonuses: [{ name: "10R", payout: 1500, spent: 100 }] })
    expect(new Headers(asked[0]?.init.headers).get("X-Turnstile-Token")).toBe("human")
  })

  test("keeps the error the catalog answered with, and its status", async () => {
    const { api } = answering(() => json(409, { error: { type: "conflict", what: "machine-name" } }))
    const registered = await api.register({
      name: "森",
      releasedOn: "2026-10-01",
      gameKind: "pachinko",
      formula: { kind: "manual", figures: { roundChanceOneIn: 319.7, payoutPerRound: 140 }, bonuses: [{ name: "10R", payout: 1500, spent: 100 }] },
    })
    expect(registered).toEqual({ ok: false, error: { type: "answered", status: 409, error: { type: "conflict", what: "machine-name" } } })
  })

  test("says an answer it cannot read is unexpected", async () => {
    const { api } = answering(() => new Response("<html>", { status: 503 }))
    expect(await api.catalog()).toEqual({ ok: false, error: { type: "answered", status: 503, error: { type: "unexpected", status: 503 } } })
  })

  test("takes a gateway's or a hall's login page answering in the catalog's place as no connection", async () => {
    expect(await answering(() => new Response("<html>", { status: 502 })).api.catalog()).toEqual({ ok: false, error: { type: "unreachable", detail: "answered 502" } })
    expect(await answering(() => new Response("<html>login</html>", { status: 511 })).api.version()).toEqual({ ok: false, error: { type: "unreachable", detail: "answered 511" } })
    expect(await answering(() => new Response("<html>", { status: 524 })).api.quota()).toEqual({ ok: false, error: { type: "unreachable", detail: "answered 524" } })
  })

  test("never takes a mark or a use as sent where a login page answered in the catalog's place", async () => {
    const { api } = answering(() => new Response("<html>login</html>", { status: 200, headers: { "Content-Type": "text/html" } }))
    expect(await api.send({ method: "PUT", path: "/formulas/f1/marks/adoption" })).toEqual({ ok: false, error: { type: "unreadable-answer" } })
  })

  test("says a request that got no answer in time timed out, for it may have been taken", async () => {
    const api = createHttpCatalogApi({
      base: "https://api.example",
      request: async () => {
        throw new DOMException("The operation timed out.", "TimeoutError")
      },
      answerWithin: 1000,
      device: async () => "device-1",
      humanCheck: undefined,
    })
    expect(await api.addDistribution("m1", { settings: [] } as never)).toEqual({ ok: false, error: { type: "timed-out" } })
  })

  test("says a catalog it cannot reach is unreachable", async () => {
    const api = createHttpCatalogApi({
      base: "https://api.example",
      request: async () => {
        throw new TypeError("offline")
      },
      answerWithin: 1000,
      device: async () => "device-1",
      humanCheck: undefined,
    })
    expect((await api.version()).ok).toBe(false)
    expect(await api.version()).toMatchObject({ error: { type: "unreachable" } })
  })
})
