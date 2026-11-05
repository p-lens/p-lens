import type { ServerWebSocket } from "bun"
import type { NostrEvent } from "../../../src/crossing/core/event"

type Socket = ServerWebSocket<{ readonly id: number }>

type Filter = { readonly kinds?: number[]; readonly "#v"?: string[]; readonly since?: number; readonly until?: number; readonly limit?: number }

/**
 * A relay for the tests: NIP-01 at its plainest (keeps every event, gives
 * what a REQ's kinds and `#v` match, passes new ones on), with what a test
 * needs to make it misbehave: drop every socket, forget every event, refuse
 * with a reason, keep quiet, or hand on an event its author never signed.
 */
export const startTestRelay = () => {
  const held = {
    events: [] as NostrEvent[],
    sockets: new Set<Socket>(),
    subscriptions: new Map<Socket, Map<string, Filter[]>>(),
    refusal: undefined as string | undefined,
    silent: false,
    next: 0,
  }
  const matches = (filters: readonly Filter[], event: NostrEvent): boolean =>
    filters.some(
      (filter) =>
        (filter.kinds === undefined || filter.kinds.includes(event.kind)) &&
        (filter["#v"] === undefined || event.tags.some((tag) => tag[0] === "v" && filter["#v"]?.includes(tag[1] ?? ""))) &&
        (filter.since === undefined || event.created_at >= filter.since) &&
        (filter.until === undefined || event.created_at <= filter.until),
    )
  /** What a REQ's filters match of what is held: the newest first where a filter asks for so many. */
  const stored = (filters: readonly Filter[]): readonly NostrEvent[] => {
    const found = held.events.filter((event) => matches(filters, event))
    const limit = Math.min(...filters.map((filter) => filter.limit ?? Number.POSITIVE_INFINITY))
    return Number.isFinite(limit) ? found.toSorted((one, other) => other.created_at - one.created_at).slice(0, limit) : found
  }
  const server = Bun.serve<{ readonly id: number }>({
    port: 0,
    hostname: "127.0.0.1",
    fetch: (request, bun) => (bun.upgrade(request, { data: { id: held.next++ } }) ? undefined : new Response("relay")),
    websocket: {
      open: (socket) => {
        held.sockets.add(socket)
        held.subscriptions.set(socket, new Map())
      },
      close: (socket) => {
        held.sockets.delete(socket)
        held.subscriptions.delete(socket)
      },
      message: (socket, raw) => {
        const [verb, first, ...rest] = JSON.parse(String(raw)) as [string, unknown, ...unknown[]]
        if (verb === "EVENT") {
          const event = first as NostrEvent
          if (held.silent) return
          if (held.refusal !== undefined) {
            socket.send(JSON.stringify(["OK", event.id, false, held.refusal]))
            return
          }
          held.events.push(event)
          socket.send(JSON.stringify(["OK", event.id, true, ""]))
          held.subscriptions.forEach((subscriptions, other) =>
            subscriptions.forEach((filters, id) => (matches(filters, event) ? other.send(JSON.stringify(["EVENT", id, event])) : undefined)),
          )
        }
        if (verb === "REQ") {
          const filters = rest as Filter[]
          held.subscriptions.get(socket)?.set(String(first), filters)
          stored(filters).forEach((event) => socket.send(JSON.stringify(["EVENT", first, event])))
          socket.send(JSON.stringify(["EOSE", first]))
        }
        if (verb === "CLOSE") held.subscriptions.get(socket)?.delete(String(first))
      },
    },
  })
  return {
    url: `ws://127.0.0.1:${server.port}`,
    events: () => held.events,
    dropEverySocket: () => held.sockets.forEach((socket) => socket.close()),
    forgetEverything: () => {
      held.events = []
    },
    refuseWith: (reason: string | undefined) => {
      held.refusal = reason
    },
    keepQuiet: (silent: boolean) => {
      held.silent = silent
    },
    sendToEvery: (message: unknown) => held.sockets.forEach((socket) => socket.send(JSON.stringify(message))),
    stop: () => server.stop(true),
  }
}
