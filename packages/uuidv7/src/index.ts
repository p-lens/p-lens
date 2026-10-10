/**
 * A UUIDv7 as RFC 9562 lays it out: 48 bits of Unix milliseconds, the
 * version, 12 random bits, the variant, 62 random bits. Ids made later sort
 * later, which keeps an index on them in insertion order.
 *
 * Pure: the time and the randomness are the caller's to supply, so the effect
 * of reading a clock or a random source stays where the caller is.
 */
export type UuidV7 = string & { readonly __brand: "UuidV7" }

/** How many random bytes an id needs. */
export const RANDOM_BYTES = 10

export type UuidV7Error = { readonly type: "time-out-of-range" } | { readonly type: "wrong-random-length"; readonly length: number }

const MAX_MILLIS = 2 ** 48 - 1

const hex = (bytes: readonly number[]): string => bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("")

/** The low 48 bits of a millisecond count, most significant first. */
const timeBytes = (millis: number): readonly number[] =>
  [5, 4, 3, 2, 1, 0].map((power) => Math.floor(millis / 2 ** (8 * power)) % 256)

export const formatUuidV7 = (
  unixMillis: number,
  random: Uint8Array,
): { readonly ok: true; readonly value: UuidV7 } | { readonly ok: false; readonly error: UuidV7Error } => {
  if (!Number.isInteger(unixMillis) || unixMillis < 0 || unixMillis > MAX_MILLIS) return { ok: false, error: { type: "time-out-of-range" } }
  if (random.length !== RANDOM_BYTES) return { ok: false, error: { type: "wrong-random-length", length: random.length } }
  const [a = 0, b = 0, c = 0, ...rest] = random
  const bytes = [...timeBytes(unixMillis), 0x70 | (a & 0x0f), b, 0x80 | (c & 0x3f), ...rest]
  const text = hex(bytes)
  return { ok: true, value: `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}` as UuidV7 }
}

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/** Whether text is a UUIDv7 in its canonical, lower-case form. */
export const isUuidV7 = (text: string): text is UuidV7 => UUID_V7.test(text)

/**
 * A UUIDv7 with its time set to another moment and everything else kept: for
 * an id that should sort by when what it names happened, not by when the id
 * was made.
 */
export const retimeUuidV7 = (id: UuidV7, unixMillis: number): { readonly ok: true; readonly value: UuidV7 } | { readonly ok: false; readonly error: UuidV7Error } => {
  if (!Number.isInteger(unixMillis) || unixMillis < 0 || unixMillis > MAX_MILLIS) return { ok: false, error: { type: "time-out-of-range" } }
  const time = hex(timeBytes(unixMillis))
  return { ok: true, value: `${time.slice(0, 8)}-${time.slice(8, 12)}${id.slice(13)}` as UuidV7 }
}
