import { Err, Ok, type Result } from "../../core/result/result"
import { readInvitation, type Invitation } from "../../core/sync/invitation"
import type { LineKeys, SealFailure, Sealer } from "../port/sealer"

const text = new TextEncoder()

/** Bytes as the characters `btoa` takes, a stretch at a time: a sealed journal is longer than one call may be handed. */
const binaryOf = (bytes: Uint8Array): string =>
  Array.from({ length: Math.ceil(bytes.length / 0x8000) }, (_, index) => String.fromCharCode(...bytes.subarray(index * 0x8000, (index + 1) * 0x8000))).join("")

const base64url = (bytes: Uint8Array): string => btoa(binaryOf(bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")

const bytesOf = (written: string): Uint8Array<ArrayBuffer> | undefined => {
  try {
    const plain = atob(written.replaceAll("-", "+").replaceAll("_", "/"))
    return Uint8Array.from(plain, (character) => character.charCodeAt(0))
  } catch {
    return undefined
  }
}

const joined = (head: Uint8Array, tail: Uint8Array): Uint8Array => {
  const whole = new Uint8Array(head.length + tail.length)
  whole.set(head)
  whole.set(tail, head.length)
  return whole
}

const SECRET_BYTES = 32
const KEY_BYTES = 32
const TOKEN_BYTES = 24
const IV_BYTES = 12

/** What every key and id of a line is drawn out of its secret under, so no two are alike and none gives another away. */
const SALT = text.encode("p-lens sync v1")

const drawn = (purpose: string): HkdfParams => ({ name: "HKDF", hash: "SHA-256", salt: SALT, info: text.encode(purpose) })

const named = async (secret: CryptoKey, purpose: string, bytes: number): Promise<string> => base64url(new Uint8Array(await crypto.subtle.deriveBits(drawn(purpose), secret, bytes * 8)))

const sealing = (iv: Uint8Array<ArrayBuffer>, commitId: string): AesGcmParams => ({ name: "AES-GCM", iv, additionalData: text.encode(commitId) })

/**
 * Sealing by the browser's own cryptography: a line's id, its token and its
 * AES-GCM key each drawn from the secret by HKDF, and a commit sealed under
 * a fresh nonce with its id bound in, so a box moved onto another commit
 * does not open.
 */
/** A line's secret as the root everything of the line is drawn from, or undefined where it is no secret. */
const rootOf = async (secret: string): Promise<CryptoKey | undefined> => {
  const bytes = bytesOf(secret)
  return bytes === undefined || bytes.length !== SECRET_BYTES ? undefined : crypto.subtle.importKey("raw", bytes, "HKDF", false, ["deriveBits", "deriveKey"])
}

const sealingKey = (raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> => crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"])

/** The keys an invitation hands over as they are: the line's id and the person's token as written, the sealing key from its bytes. */
const invitedKeys = async (invitation: Invitation): Promise<Result<LineKeys, SealFailure>> => {
  const raw = bytesOf(invitation.key)
  return raw === undefined || raw.length !== KEY_BYTES ? Err({ type: "bad-secret" }) : Ok({ lineId: invitation.lineId, token: invitation.token, key: await sealingKey(raw) })
}

export const createWebCryptoSealer = (): Sealer => ({
  newSecret: () => base64url(crypto.getRandomValues(new Uint8Array(SECRET_BYTES))),

  keysOf: async (secret): Promise<Result<LineKeys, SealFailure>> => {
    try {
      const invitation = readInvitation(secret)
      if (invitation !== undefined) return await invitedKeys(invitation)
      const root = await rootOf(secret)
      if (root === undefined) return Err({ type: "bad-secret" })
      const key = await crypto.subtle.deriveKey(drawn("seal"), root, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"])
      return Ok({ lineId: await named(root, "line", 16), token: await named(root, "access", 24), key })
    } catch (cause) {
      return Err({ type: "sealing-unavailable", detail: String(cause) })
    }
  },

  inboxKeysOf: async (secret) => {
    try {
      const root = await rootOf(secret)
      if (root === undefined) return Err({ type: "bad-secret" })
      const key = await crypto.subtle.deriveKey(drawn("inbox seal"), root, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"])
      return Ok({ lineId: await named(root, "inbox line", 16), token: await named(root, "inbox access", 24), key })
    } catch (cause) {
      return Err({ type: "sealing-unavailable", detail: String(cause) })
    }
  },

  huddleKeysOf: async (secret) => {
    try {
      const root = await rootOf(secret)
      if (root === undefined) return Err({ type: "bad-secret" })
      const key = await crypto.subtle.deriveKey(drawn("huddle seal"), root, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"])
      return Ok({ lineId: await named(root, "huddle line", 16), token: await named(root, "huddle access", 24), key })
    } catch (cause) {
      return Err({ type: "sealing-unavailable", detail: String(cause) })
    }
  },

  invitationOf: async (secret, role, title) => {
    try {
      const root = await rootOf(secret)
      if (root === undefined) return Err({ type: "bad-secret" })
      const token = base64url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)))
      return role === "sender"
        ? Ok({ role, lineId: await named(root, "inbox line", 16), token, key: await named(root, "inbox seal", KEY_BYTES), title })
        : Ok({ role, lineId: await named(root, "line", 16), token, key: await named(root, "seal", KEY_BYTES) })
    } catch (cause) {
      return Err({ type: "sealing-unavailable", detail: String(cause) })
    }
  },

  seal: async (keys, commitId, plain) => {
    try {
      const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
      const sealed = new Uint8Array(await crypto.subtle.encrypt(sealing(iv, commitId), keys.key, text.encode(plain)))
      return Ok(base64url(joined(iv, sealed)))
    } catch (cause) {
      return Err({ type: "sealing-unavailable", detail: String(cause) })
    }
  },

  open: async (keys, commitId, box) => {
    const bytes = bytesOf(box)
    if (bytes === undefined || bytes.length <= IV_BYTES) return Err({ type: "unreadable-box" })
    try {
      const plain = await crypto.subtle.decrypt(sealing(bytes.slice(0, IV_BYTES), commitId), keys.key, bytes.slice(IV_BYTES))
      return Ok(new TextDecoder().decode(plain))
    } catch {
      return Err({ type: "unreadable-box" })
    }
  },
})
