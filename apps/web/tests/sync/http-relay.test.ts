import { describe, expect, test } from "bun:test"

import { createHttpRelay } from "../../src/sync/http/http-relay"

const ACCESS = { relayUrl: "https://relay.test", lineId: "line-1", token: "token-1" } as const

const answering = (response: () => Response) => createHttpRelay({ request: async () => response(), answerWithin: 1000 })

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

describe("a relay over HTTP, as a hall's network answers in its place", () => {
  test("takes a gateway, or a login page wanting a login first, as no connection", async () => {
    expect(await answering(() => new Response("<html>login</html>", { status: 511 })).entriesAfter(ACCESS, 0)).toEqual({ ok: false, error: { type: "unreachable", detail: "answered 511" } })
    expect(await answering(() => new Response("<html>", { status: 524 })).grants(ACCESS)).toEqual({ ok: false, error: { type: "unreachable", detail: "answered 524" } })
    expect(await answering(() => new Response("<html>", { status: 502 })).append(ACCESS, 0, [])).toEqual({ ok: false, error: { type: "unreachable", detail: "answered 502" } })
  })

  test("takes the relay's own failing as for now, and too much sent as too large", async () => {
    expect(await answering(() => json(500, { error: { type: "storage", detail: "D1" } })).entriesAfter(ACCESS, 0)).toEqual({ ok: false, error: { type: "server-trouble", status: 500 } })
    expect(await answering(() => json(413, { error: { type: "too-large" } })).grant(ACCESS, { id: "g", token: "t", role: "viewer" })).toEqual({ ok: false, error: { type: "too-large" } })
  })

  test("takes a page answering as if it went through as one it cannot read", async () => {
    expect(await answering(() => new Response("<html>login</html>", { status: 200 })).entriesAfter(ACCESS, 0)).toEqual({ ok: false, error: { type: "unreadable-answer" } })
  })

  test("takes an answer cut short as it was read as no connection", async () => {
    const cut = (): Response => new Response(new ReadableStream({ start: (controller) => controller.error(new DOMException("The operation timed out.", "TimeoutError")) }), { status: 200 })
    expect(await answering(cut).entriesAfter(ACCESS, 0)).toMatchObject({ ok: false, error: { type: "unreachable" } })
  })
})
