import type { Result } from "../../core/result/result"
import type { Draft, NostrEvent } from "../core/event"
import type { PadFailure, Place, UnpadFailure } from "../core/seal"

/** A secp256k1 key pair an author signs with: the secret never leaves the device. */
export type SigningKey = { readonly secret: Uint8Array; readonly pubkey: string }

export type OpenFailure =
  | { readonly type: "not-base64" }
  | { readonly type: "unknown-version" }
  | { readonly type: "does-not-open" }
  | UnpadFailure
  | { readonly type: "not-inflatable" }
  | { readonly type: "not-json" }

/**
 * Everything PLN-1 derives from a secret, seals and signs (PROTOCOL.md §3):
 * the one place the device's cryptography is reached.
 */
export interface Keys {
  /** 32 random bytes: a new secret. */
  readonly newSecret: () => Uint8Array<ArrayBuffer>
  readonly derive: (secret: Uint8Array, info: string | Uint8Array) => Promise<Uint8Array<ArrayBuffer>>
  readonly signingKey: (secret: Uint8Array, name: string) => Promise<SigningKey>
  readonly sealKey: (secret: Uint8Array, name: string) => Promise<Uint8Array<ArrayBuffer>>
  /** A line's `v`. */
  readonly locator: (secret: Uint8Array, name: string) => Promise<string>
  /** An addressable event's `d`. */
  readonly address: (secret: Uint8Array, name: string) => Promise<string>
  /** A value sealed as JSON, deflated, with a nonce drawn at random. */
  readonly sealJson: (key: Uint8Array, place: Place, value: unknown) => Promise<Result<string, PadFailure>>
  readonly openJson: (key: Uint8Array, place: Place, content: string) => Promise<Result<unknown, OpenFailure>>
  /** Bytes sealed as they are, not deflated: a part of something deflated whole (PROTOCOL.md §5.5). */
  readonly sealBytes: (key: Uint8Array, place: Place, bytes: Uint8Array) => Promise<Result<string, PadFailure>>
  readonly openBytes: (key: Uint8Array, place: Place, content: string) => Promise<Result<Uint8Array<ArrayBuffer>, OpenFailure>>
  /** Raw DEFLATE, as a seal's JSON is deflated. */
  readonly deflate: (bytes: Uint8Array) => Promise<Uint8Array<ArrayBuffer>>
  readonly inflate: (bytes: Uint8Array) => Promise<Result<Uint8Array<ArrayBuffer>, OpenFailure>>
  /** The SHA-256 of bytes, in lowercase hex. */
  readonly sha256: (bytes: Uint8Array) => Promise<string>
  readonly sign: (key: SigningKey, draft: Omit<Draft, "pubkey">) => NostrEvent
}
