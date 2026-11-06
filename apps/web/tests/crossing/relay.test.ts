import { afterEach, describe, expect, test } from "bun:test"
import { createWebCryptoKeys } from "../../src/crossing/browser/web-crypto-keys"
import { backoffMs, createWebSocketRelays } from "../../src/crossing/browser/websocket-relays"
import type { NostrEvent } from "../../src/crossing/core/event"
import { answerOf, readRelayMessage } from "../../src/crossing/core/messages"
import type { Connection, ConnectionState } from "../../src/crossing/port/relay"
import { startTestRelay } from "./support/test-relay"

const keys = createWebCryptoKeys()
const author = await keys.signingKey(new Uint8Array(32).fill(7), "owner")
const LINE = "0".repeat(31) + "1"

const event = (content: string, created_at = Math.floor(Date.now() / 1000)): NostrEvent =>
  keys.sign(author, { created_at, kind: 4738, tags: [["v", LINE]], content })

const until = async (condition: () => boolean, ms = 3_000): Promise<void> => {
  const started = Date.now()
  while (!condition()) {
    if (Date.now() - started > ms) throw new Error("waited too long")
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

const opened = async (connection: Connection): Promise<void> => until(() => connection.state().type === "open")

const held = { relay: undefined as ReturnType<typeof startTestRelay> | undefined, connections: [] as Connection[] }

const relay = () => {
  held.relay = startTestRelay()
  return held.relay
}

const connect = (url: string): Connection => {
  const connection = createWebSocketRelays().connect(url)
  held.connections.push(connection)
  return connection
}

afterEach(() => {
  held.connections.forEach((connection) => connection.close())
  held.connections = []
  held.relay?.stop()
})

describe("a connection", () => {
  test("publishes and hears the relay keep it", async () => {
    const server = relay()
    const connection = connect(server.url)
    expect(await connection.publish(event("one"), 2_000)).toEqual({ ok: true, value: { type: "kept" } })
    expect(server.events().length).toBe(1)
  })

  test("gives what was kept, says when that is all, and passes on what comes after", async () => {
    const server = relay()
    const writer = connect(server.url)
    await writer.publish(event("kept"), 2_000)
    const reader = connect(server.url)
    const seen: string[] = []
    const caughtUp = { at: -1 }
    reader.subscribe(() => [{ kinds: [4738], "#v": [LINE] }], {
      onEvent: (arrived) => seen.push(arrived.content),
      onCaughtUp: () => {
        caughtUp.at = seen.length
      },
    })
    await until(() => caughtUp.at === 1)
    await writer.publish(event("live"), 2_000)
    await until(() => seen.length === 2)
    expect(seen).toEqual(["kept", "live"])
  })

  test("drops an event its author did not sign", async () => {
    const server = relay()
    const reader = connect(server.url)
    const seen: string[] = []
    const caughtUp = { done: false }
    reader.subscribe(() => [{ kinds: [4738] }], { onEvent: (arrived) => seen.push(arrived.content), onCaughtUp: () => (caughtUp.done = true) })
    await until(() => caughtUp.done)
    const forged = { ...event("real"), content: "forged" }
    server.sendToEvery(["EVENT", "s0", forged])
    server.sendToEvery(["EVENT", "s0", event("signed")])
    await until(() => seen.length === 1)
    expect(seen).toEqual(["signed"])
  })

  test("opens again after the relay drops it, asks its subscriptions again, and sends what waited", async () => {
    const server = relay()
    const connection = connect(server.url)
    const states: ConnectionState["type"][] = []
    connection.onState((state) => states.push(state.type))
    const seen: string[] = []
    connection.subscribe(() => [{ kinds: [4738] }], { onEvent: (arrived) => seen.push(arrived.content) })
    await opened(connection)
    server.dropEverySocket()
    await until(() => connection.state().type === "failing")
    const waiting = connection.publish(event("sent while down"), 5_000)
    connection.reopen()
    expect(await waiting).toEqual({ ok: true, value: { type: "kept" } })
    expect(states).toEqual(["open", "failing", "connecting", "open"])
    await until(() => seen.includes("sent while down"))
  })

  test("let rest, opens nothing until asked, then asks each subscription by what it gives at that moment", async () => {
    const server = relay()
    const connection = connect(server.url)
    const since = { at: 100 }
    connection.subscribe(() => [{ kinds: [4738], since: since.at }], { onEvent: () => undefined })
    await opened(connection)
    connection.pause()
    expect(connection.state()).toEqual({ type: "paused" })
    await new Promise((resolve) => setTimeout(resolve, 1_200))
    expect(connection.state()).toEqual({ type: "paused" })
    since.at = 200
    const waiting = connection.publish(event("sent while resting"), 5_000)
    connection.reopen()
    expect(await waiting).toEqual({ ok: true, value: { type: "kept" } })
    expect(server.asked().map((filters) => filters[0]?.since)).toEqual([100, 200])
  })

  test("gives up waiting for an answer that never comes", async () => {
    const server = relay()
    server.keepQuiet(true)
    const connection = connect(server.url)
    expect(await connection.publish(event("unheard"), 200)).toEqual({ ok: false, error: { type: "no-answer" } })
  })

  test("says why the relay refused", async () => {
    const server = relay()
    server.refuseWith("restricted: pass-required for sync")
    const connection = connect(server.url)
    expect(await connection.publish(event("unpaid"), 2_000)).toEqual({ ok: true, value: { type: "refused", refusal: { type: "restricted", reason: "pass-required" } } })
  })

  test("closed, publishes nothing and opens no more", async () => {
    const server = relay()
    const connection = connect(server.url)
    await opened(connection)
    connection.close()
    expect(await connection.publish(event("late"), 200)).toEqual({ ok: false, error: { type: "closed" } })
    connection.reopen()
    expect(connection.state()).toEqual({ type: "closed" })
  })
})

describe("what a relay sends", () => {
  test("is read, and what is not NIP-01 is dropped", () => {
    expect(readRelayMessage('["EOSE","s1"]')).toEqual({ type: "eose", subscription: "s1" })
    expect(readRelayMessage('["OK","abc",false,"blocked: no"]')).toEqual({ type: "ok", id: "abc", accepted: false, reason: "blocked: no" })
    expect(readRelayMessage('["CLOSED","s1","restricted: full"]')).toEqual({ type: "closed", subscription: "s1", reason: "restricted: full" })
    expect(readRelayMessage("not json")).toBeUndefined()
    expect(readRelayMessage('["AUTH","challenge"]')).toBeUndefined()
  })

  test("as an answer, is kept or refused by NIP-01's prefixes", () => {
    expect(answerOf(true, "")).toEqual({ type: "kept" })
    expect(answerOf(false, "duplicate: already have this event")).toEqual({ type: "kept" })
    expect(answerOf(false, "restricted: full")).toEqual({ type: "refused", refusal: { type: "restricted", reason: "full" } })
    expect(answerOf(false, "replaced: have newer event")).toEqual({ type: "refused", refusal: { type: "have-newer" } })
    expect(answerOf(false, "rate-limited: slow down")).toEqual({ type: "refused", refusal: { type: "rate-limited" } })
    expect(answerOf(false, "something")).toEqual({ type: "refused", refusal: { type: "other" } })
  })
})

describe("the wait before opening again", () => {
  test("grows from a second to a minute", () => {
    expect([1, 2, 3, 6, 7, 20].map((attempts) => backoffMs(attempts, 0))).toEqual([1_000, 2_000, 4_000, 32_000, 60_000, 60_000])
    expect(backoffMs(1, 1)).toBe(1_250)
  })
})
