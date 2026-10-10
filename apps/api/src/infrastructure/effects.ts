import { RANDOM_BYTES, formatUuidV7, type UuidV7 } from "@p-lens/uuidv7"

import { canonicalJson } from "../domain/canonical"

/** The effects the API needs, passed in so handlers stay testable. */
export interface Effects {
  readonly newId: () => UuidV7
  /** Now, as ISO 8601 in UTC. */
  readonly now: () => string
  readonly contentHash: (value: unknown) => Promise<string>
}

/**
 * A fresh UUIDv7. The only failure is a clock outside 1970..10889, which no
 * Worker has; reaching it is a broken runtime, said at once.
 */
const freshUuidV7 = (): UuidV7 => {
  const made = formatUuidV7(Date.now(), crypto.getRandomValues(new Uint8Array(RANDOM_BYTES)))
  if (!made.ok) throw new Error(`the clock cannot make a UUIDv7: ${made.error.type}`)
  return made.value
}

/** SHA-256 of the canonical JSON, as lower-case hex. */
const sha256 = async (value: unknown): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(value)))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

export const runtimeEffects: Effects = { newId: freshUuidV7, now: () => new Date().toISOString(), contentHash: sha256 }
