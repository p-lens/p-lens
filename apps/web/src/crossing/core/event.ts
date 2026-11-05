import { schnorr } from "@noble/curves/secp256k1.js"
import { sha256 } from "@noble/hashes/sha2.js"
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js"

/** A signed Nostr event, as NIP-01 gives it. */
export type NostrEvent = {
  readonly id: string
  readonly pubkey: string
  readonly created_at: number
  readonly kind: number
  readonly tags: readonly (readonly string[])[]
  readonly content: string
  readonly sig: string
}

/** An event before it is signed: everything but its id and signature. */
export type Draft = Omit<NostrEvent, "id" | "sig">

/** NIP-01's id: the SHA-256 of the event serialized without its id and signature. */
export const eventId = (draft: Draft): string =>
  bytesToHex(sha256(utf8ToBytes(JSON.stringify([0, draft.pubkey, draft.created_at, draft.kind, draft.tags, draft.content]))))

const HEX64 = /^[0-9a-f]{64}$/
const HEX128 = /^[0-9a-f]{128}$/

const isWellFormed = (value: unknown): value is NostrEvent => {
  const event = value as Record<string, unknown> | null
  return (
    typeof event === "object" &&
    event !== null &&
    typeof event.id === "string" &&
    HEX64.test(event.id) &&
    typeof event.pubkey === "string" &&
    HEX64.test(event.pubkey) &&
    typeof event.sig === "string" &&
    HEX128.test(event.sig) &&
    Number.isSafeInteger(event.created_at) &&
    Number.isSafeInteger(event.kind) &&
    typeof event.content === "string" &&
    Array.isArray(event.tags) &&
    event.tags.every((tag) => Array.isArray(tag) && tag.every((part) => typeof part === "string"))
  )
}

const signatureHolds = (event: NostrEvent): boolean => {
  try {
    return schnorr.verify(hexToBytes(event.sig), hexToBytes(event.id), hexToBytes(event.pubkey))
  } catch {
    return false
  }
}

/**
 * Whether something a relay sent is an event signed by its author, as its id
 * says: a relay is trusted with nothing, so whatever it hands on is checked
 * before anything is made of it.
 */
export const isSignedEvent = (value: unknown): value is NostrEvent =>
  isWellFormed(value) && eventId(value) === value.id && signatureHolds(value)

export const tagValues = (event: Pick<NostrEvent, "tags">, name: string): readonly string[] =>
  event.tags.flatMap((tag) => (tag[0] === name && tag[1] !== undefined ? [tag[1]] : []))

/** Oldest first; in one second, by id, so that every device puts the same events in the same order. */
export const oldestFirst = (a: NostrEvent, b: NostrEvent): number => a.created_at - b.created_at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
