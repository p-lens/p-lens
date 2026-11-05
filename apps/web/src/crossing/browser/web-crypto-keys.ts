import { schnorr, secp256k1 } from "@noble/curves/secp256k1.js"
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js"
import { Err, Ok, type Result } from "../../core/result/result"
import { eventId } from "../core/event"
import { LABEL, SALT } from "../core/keyring"
import { aadOf, NONCE_BYTES, pad, SEAL_VERSION, unpad, type PadFailure, type Place } from "../core/seal"
import type { Keys, OpenFailure, SigningKey } from "../port/keys"

const encoder = new TextEncoder()

const copied = (bytes: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(bytes)

const joined = (...parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const whole = new Uint8Array(parts.reduce((length, part) => length + part.length, 0))
  parts.reduce((offset, part) => (whole.set(part, offset), offset + part.length), 0)
  return whole
}

const derive = async (secret: Uint8Array, info: string | Uint8Array): Promise<Uint8Array<ArrayBuffer>> => {
  const key = await crypto.subtle.importKey("raw", copied(secret), "HKDF", false, ["deriveBits"])
  const label = typeof info === "string" ? encoder.encode(info) : copied(info)
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: encoder.encode(SALT), info: label }, key, 256))
}

const ORDER = secp256k1.Point.CURVE().n

const signingKeyFrom = async (secret: Uint8Array, name: string, counter: number): Promise<SigningKey> => {
  const candidate = await derive(secret, LABEL.sign(name, counter))
  const scalar = BigInt(`0x${bytesToHex(candidate)}`)
  return scalar >= 1n && scalar < ORDER ? { secret: candidate, pubkey: bytesToHex(schnorr.getPublicKey(candidate)) } : signingKeyFrom(secret, name, counter + 1)
}

const toBase64 = (bytes: Uint8Array): string => btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))

const fromBase64 = (text: string): Uint8Array<ArrayBuffer> | undefined =>
  /^[A-Za-z0-9+/]*={0,2}$/.test(text) && text.length % 4 === 0 ? Uint8Array.from(atob(text), (character) => character.charCodeAt(0)) : undefined

const through = async (bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> =>
  new Uint8Array(await new Response(new Blob([copied(bytes)]).stream().pipeThrough(stream)).arrayBuffer())

const aesKey = (key: Uint8Array, usage: "encrypt" | "decrypt"): Promise<CryptoKey> => crypto.subtle.importKey("raw", copied(key), "AES-GCM", false, [usage])

/** Seals bytes as they are, with the nonce given; `sealJson` draws one. Kept apart for the test vectors. */
export const sealBytesWith = async (key: Uint8Array, nonce: Uint8Array, place: Place, bytes: Uint8Array): Promise<Result<string, PadFailure>> => {
  const padded = pad(bytes)
  if (!padded.ok) return padded
  const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv: copied(nonce), additionalData: aadOf(place) }, await aesKey(key, "encrypt"), padded.value)
  return Ok(toBase64(joined(Uint8Array.of(SEAL_VERSION), nonce, new Uint8Array(sealed))))
}

const openBytes = async (key: Uint8Array, place: Place, content: string): Promise<Result<Uint8Array<ArrayBuffer>, OpenFailure>> => {
  const box = fromBase64(content)
  if (box === undefined) return Err({ type: "not-base64" })
  if (box[0] !== SEAL_VERSION) return Err({ type: "unknown-version" })
  const opened = await aesKey(key, "decrypt")
    .then((aes) => crypto.subtle.decrypt({ name: "AES-GCM", iv: box.slice(1, 1 + NONCE_BYTES), additionalData: aadOf(place) }, aes, box.slice(1 + NONCE_BYTES)))
    .then(
      (plain): Result<Uint8Array<ArrayBuffer>, OpenFailure> => Ok(new Uint8Array(plain)),
      (): Result<Uint8Array<ArrayBuffer>, OpenFailure> => Err({ type: "does-not-open" }),
    )
  return opened.ok ? unpad(opened.value) : opened
}

const inflate = (bytes: Uint8Array): Promise<Result<Uint8Array<ArrayBuffer>, OpenFailure>> =>
  through(bytes, new DecompressionStream("deflate-raw")).then(
    (value): Result<Uint8Array<ArrayBuffer>, OpenFailure> => Ok(value),
    (): Result<Uint8Array<ArrayBuffer>, OpenFailure> => Err({ type: "not-inflatable" }),
  )

const parsed = (bytes: Uint8Array): Result<unknown, OpenFailure> => {
  try {
    return Ok(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)))
  } catch {
    return Err({ type: "not-json" })
  }
}

/** PLN-1's keys by the browser's WebCrypto, and secp256k1 by @noble/curves, which WebCrypto lacks. */
export const createWebCryptoKeys = (): Keys => ({
  newSecret: () => crypto.getRandomValues(new Uint8Array(32)),
  derive,
  signingKey: (secret, name) => signingKeyFrom(secret, name, 0),
  sealKey: (secret, name) => derive(secret, LABEL.seal(name)),
  locator: async (secret, name) => bytesToHex((await derive(secret, LABEL.locator(name))).subarray(0, 16)),
  address: async (secret, name) => {
    const key = await crypto.subtle.importKey("raw", await derive(secret, LABEL.address), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
    return bytesToHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(name))).subarray(0, 16))
  },
  sealJson: async (key, place, value) =>
    sealBytesWith(key, crypto.getRandomValues(new Uint8Array(NONCE_BYTES)), place, await through(encoder.encode(JSON.stringify(value)), new CompressionStream("deflate-raw"))),
  openJson: async (key, place, content) => {
    const bytes = await openBytes(key, place, content)
    if (!bytes.ok) return bytes
    const inflated = await inflate(bytes.value)
    return inflated.ok ? parsed(inflated.value) : inflated
  },
  sealBytes: (key, place, bytes) => sealBytesWith(key, crypto.getRandomValues(new Uint8Array(NONCE_BYTES)), place, bytes),
  openBytes,
  deflate: (bytes) => through(bytes, new CompressionStream("deflate-raw")),
  inflate,
  sha256: async (bytes) => bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", copied(bytes)))),
  sign: (key, draft) => {
    const unsigned = { ...draft, pubkey: key.pubkey }
    const id = eventId(unsigned)
    return { ...unsigned, id, sig: bytesToHex(schnorr.sign(hexToBytes(id), key.secret)) }
  },
})
