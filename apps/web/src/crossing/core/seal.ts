import { Err, Ok, type Result } from "../../core/result/result"

/** The most bytes one seal carries before padding; anything larger goes in parts (PROTOCOL.md §3.3). */
export const MOST_UNPADDED = 32_000

/** The seal's format, the first byte of every sealed content. */
export const SEAL_VERSION = 0x01

export const NONCE_BYTES = 12

/** What a box is stuck to: moved to another kind, line, address or author, it does not open. */
export type Place = { readonly kind: number; readonly v: string; readonly d: string | undefined; readonly pubkey: string }

export type PadFailure = { readonly type: "empty" } | { readonly type: "too-large"; readonly length: number }

export type UnpadFailure = { readonly type: "malformed-padding" }

/** NIP-44 v2's padded length for an unpadded length. */
export const paddedLength = (length: number): number => {
  if (length <= 32) return 32
  const nextPower = 2 ** (Math.floor(Math.log2(length - 1)) + 1)
  const chunk = nextPower <= 256 ? 32 : nextPower / 8
  return chunk * (Math.floor((length - 1) / chunk) + 1)
}

/** A 2-byte big-endian length, the bytes, and zeros to the padded length. */
export const pad = (bytes: Uint8Array): Result<Uint8Array<ArrayBuffer>, PadFailure> => {
  if (bytes.length === 0) return Err({ type: "empty" })
  if (bytes.length > MOST_UNPADDED) return Err({ type: "too-large", length: bytes.length })
  const padded = new Uint8Array(2 + paddedLength(bytes.length))
  padded[0] = bytes.length >> 8
  padded[1] = bytes.length & 0xff
  padded.set(bytes, 2)
  return Ok(padded)
}

export const unpad = (padded: Uint8Array): Result<Uint8Array<ArrayBuffer>, UnpadFailure> => {
  const length = ((padded[0] ?? 0) << 8) | (padded[1] ?? 0)
  const wellFormed = length >= 1 && length <= MOST_UNPADDED && padded.length === 2 + paddedLength(length)
  return wellFormed ? Ok(padded.slice(2, 2 + length)) : Err({ type: "malformed-padding" })
}

const encoder = new TextEncoder()

/** pln-1 ‖ 0 ‖ kind ‖ 0 ‖ v ‖ 0 ‖ d ‖ 0 ‖ pubkey: what a seal's AES-GCM tag binds it to. */
export const aadOf = (place: Place): Uint8Array<ArrayBuffer> => {
  const parts = ["pln-1", String(place.kind), place.v, place.d ?? "", place.pubkey].map((part) => encoder.encode(part))
  const whole = new Uint8Array(parts.reduce((length, part) => length + part.length + 1, -1))
  parts.reduce((offset, part, index) => {
    whole.set(part, offset)
    return offset + part.length + (index < parts.length - 1 ? 1 : 0)
  }, 0)
  return whole
}

/** Bytes cut into pieces a seal carries each, in order (PROTOCOL.md §5.5). */
export const piecesOf = (bytes: Uint8Array): readonly Uint8Array<ArrayBuffer>[] =>
  Array.from({ length: Math.max(1, Math.ceil(bytes.length / MOST_UNPADDED)) }, (_, index) => bytes.slice(index * MOST_UNPADDED, (index + 1) * MOST_UNPADDED))
