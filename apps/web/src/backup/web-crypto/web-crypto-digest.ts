import { Err, Ok } from "../../core/result/result"
import type { Digest } from "../port/digest"

const encoder = new TextEncoder()

const hexOf = (bytes: Uint8Array): string => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")

/** Fingerprints by the browser's own SHA-256, written as hex. */
export const createWebCryptoDigest = (): Digest => async (text) => {
  try {
    return Ok(hexOf(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text)))))
  } catch (cause) {
    return Err({ type: "digest-unavailable", detail: String(cause) })
  }
}
