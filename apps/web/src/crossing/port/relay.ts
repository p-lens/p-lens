import type { Result } from "../../core/result/result"
import type { NostrEvent } from "../core/event"
import type { Answer, Filter } from "../core/messages"

/** Where a connection to a relay stands. */
export type ConnectionState =
  | { readonly type: "connecting" }
  | { readonly type: "open" }
  | { readonly type: "failing"; readonly attempts: number; readonly lastOpenAt: number | undefined }
  /** Let rest while the page is out of sight: nothing is opened again until it is asked to be. */
  | { readonly type: "paused" }
  | { readonly type: "closed" }

export type PublishFailure = { readonly type: "no-answer" } | { readonly type: "closed" }

/** What a subscription is told: each event, once what was kept has all come (`EOSE`), and if the relay ends it. */
export type SubscriptionHandlers = {
  readonly onEvent: (event: NostrEvent) => void
  readonly onCaughtUp?: () => void
  readonly onEnded?: (reason: string) => void
}

export type Subscription = { readonly close: () => void }

/**
 * One WebSocket to one relay address, kept open while wanted: opened again
 * after it drops, with a wait that grows, its subscriptions asked again each
 * time it opens — each by the filters it gives then, so that a live one asks
 * from that moment, not from when it began — and what is published while it
 * is down sent once it is up. It may be let rest, its socket closed and all
 * else kept, and opened again as the page comes back. Nothing it holds
 * outlives the page; what must is the application's to keep.
 */
export interface Connection {
  readonly state: () => ConnectionState
  readonly onState: (listener: (state: ConnectionState) => void) => () => void
  /** Asks for what the filters match, each time the socket opens, by the filters `asked` gives at that moment. */
  readonly subscribe: (asked: () => readonly Filter[], handlers: SubscriptionHandlers) => Subscription
  /** Sends an event and waits for the relay's `OK`, as long as `timeoutMs` at most. */
  readonly publish: (event: NostrEvent, timeoutMs: number) => Promise<Result<Answer, PublishFailure>>
  /** Opens again now, if it is failing or resting: the page came back in sight, or the device online. */
  readonly reopen: () => void
  /** Lets the socket rest, keeping its subscriptions and what waits to be sent, until `reopen`: the page went out of sight. */
  readonly pause: () => void
  readonly close: () => void
}

export interface Relays {
  readonly connect: (url: string) => Connection
}
