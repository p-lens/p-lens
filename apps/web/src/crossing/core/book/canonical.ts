import { sha256 } from "@noble/hashes/sha2.js"
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js"

/** A value as JSON carries it: what a change, a state or a tip is made of. */
export type Json = string | number | boolean | null | readonly Json[] | { readonly [key: string]: Json }

/**
 * A value as canonical JSON (RFC 8785) for what PLN-1 hashes: keys in order
 * of their UTF-16 code units, no white space. Every number in what is hashed
 * is a safe integer, which JSON writes the one way.
 */
export const canonicalJson = (value: Json): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (typeof value === "object" && value !== null)
    return `{${Object.keys(value)
      .toSorted()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as { readonly [key: string]: Json })[key] ?? null)}`)
      .join(",")}}`
  return JSON.stringify(value)
}

/** The SHA-256 of a value's canonical JSON, in lowercase hex. */
export const digestOf = (value: Json): string => bytesToHex(sha256(utf8ToBytes(canonicalJson(value))))
