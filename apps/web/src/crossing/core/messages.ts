import { isSignedEvent, type NostrEvent } from "./event"

/** A NIP-01 filter, with the tags PLN-1 asks by. */
export type Filter = {
  readonly ids?: readonly string[]
  readonly authors?: readonly string[]
  readonly kinds?: readonly number[]
  readonly "#v"?: readonly string[]
  readonly "#d"?: readonly string[]
  readonly since?: number
  readonly until?: number
  readonly limit?: number
}

export type ClientMessage =
  | { readonly type: "event"; readonly event: NostrEvent }
  | { readonly type: "req"; readonly subscription: string; readonly filters: readonly Filter[] }
  | { readonly type: "close"; readonly subscription: string }

export const encodeClientMessage = (message: ClientMessage): string => {
  switch (message.type) {
    case "event":
      return JSON.stringify(["EVENT", message.event])
    case "req":
      return JSON.stringify(["REQ", message.subscription, ...message.filters])
    case "close":
      return JSON.stringify(["CLOSE", message.subscription])
  }
}

/** What a relay sends, read; an event that is not its author's is dropped, never handed on. */
export type RelayMessage =
  | { readonly type: "event"; readonly subscription: string; readonly event: NostrEvent }
  | { readonly type: "ok"; readonly id: string; readonly accepted: boolean; readonly reason: string }
  | { readonly type: "eose"; readonly subscription: string }
  | { readonly type: "closed"; readonly subscription: string; readonly reason: string }
  | { readonly type: "notice"; readonly text: string }

const parsed = (raw: string): unknown => {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

const text = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined)

export const readRelayMessage = (raw: string): RelayMessage | undefined => {
  const message = parsed(raw)
  if (!Array.isArray(message)) return undefined
  const [verb, first, second, third] = message as readonly unknown[]
  const subscription = text(first)
  switch (verb) {
    case "EVENT":
      return subscription !== undefined && isSignedEvent(second) ? { type: "event", subscription, event: second } : undefined
    case "OK":
      return subscription !== undefined && typeof second === "boolean" ? { type: "ok", id: subscription, accepted: second, reason: text(third) ?? "" } : undefined
    case "EOSE":
      return subscription === undefined ? undefined : { type: "eose", subscription }
    case "CLOSED":
      return subscription === undefined ? undefined : { type: "closed", subscription, reason: text(second) ?? "" }
    case "NOTICE":
      return { type: "notice", text: subscription ?? "" }
    default:
      return undefined
  }
}

/** Why a relay would not keep an event, by NIP-01's prefixes; the rest of its reason is the relay's words, never shown as they are. */
export type Refusal =
  | { readonly type: "invalid" }
  | { readonly type: "blocked" }
  | { readonly type: "restricted"; readonly reason: "pass-required" | "full" | "other" }
  | { readonly type: "rate-limited" }
  | { readonly type: "have-newer" }
  | { readonly type: "other" }

/** What an `OK` says of an event: kept (or held already), or refused and why. */
export type Answer = { readonly type: "kept" } | { readonly type: "refused"; readonly refusal: Refusal }

const refusalOf = (reason: string): Refusal => {
  const [prefix] = reason.split(":")
  switch (prefix) {
    case "invalid":
      return { type: "invalid" }
    case "blocked":
      return { type: "blocked" }
    case "rate-limited":
      return { type: "rate-limited" }
    case "replaced":
      return { type: "have-newer" }
    case "restricted":
      return { type: "restricted", reason: reason.includes("pass-required") ? "pass-required" : reason.includes("full") ? "full" : "other" }
    default:
      return { type: "other" }
  }
}

export const answerOf = (accepted: boolean, reason: string): Answer =>
  accepted || reason.startsWith("duplicate:") ? { type: "kept" } : { type: "refused", refusal: refusalOf(reason) }
