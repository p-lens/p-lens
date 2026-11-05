import { describe, expect, test } from "bun:test"
import { parseIsoDate } from "../../src/core/calendar/calendar"
import { createWebCryptoKeys, sealBytesWith } from "../../src/crossing/browser/web-crypto-keys"
import { isSignedEvent } from "../../src/crossing/core/event"
import { NAMES } from "../../src/crossing/core/keyring"
import { MOST_UNPADDED, pad, paddedLength, piecesOf, unpad } from "../../src/crossing/core/seal"
import vectors from "./fixtures/pln-1.json"

/**
 * PLN-1's test vectors, as p-lens-relay's reference implementation works
 * them out (`reference/vectors/pln-1.json`): whatever this device derives and
 * seals, every other implementation must too.
 */
const keys = createWebCryptoKeys()
const hex = (text: string): Uint8Array<ArrayBuffer> => Uint8Array.from(text.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16))
const hexOf = (bytes: Uint8Array): string => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")

const sync = hex(vectors.inputs.sync)
const epoch = hex(vectors.inputs.epoch)
const invitation = hex(vectors.inputs.invitation)
const huddle = hex(vectors.inputs.huddle)
const device = hex(vectors.inputs.device)
const parsedDay = parseIsoDate(vectors.inputs.day)
if (!parsedDay.ok) throw new Error("the vectors' day is a date")
const day = parsedDay.value

describe("what a device derives, against PLN-1's vectors", () => {
  test("derives", async () => {
    expect(hexOf(await keys.derive(sync, "owner"))).toBe(vectors.derive.output)
  })

  test("signing keys", async () => {
    expect((await keys.signingKey(sync, NAMES.owner)).pubkey).toBe(vectors.keys.owner.pubkey)
    expect(hexOf((await keys.signingKey(sync, NAMES.owner)).secret)).toBe(vectors.keys.owner.secret)
    expect((await keys.signingKey(invitation, NAMES.member)).pubkey).toBe(vectors.keys.member.pubkey)
    expect((await keys.signingKey(invitation, NAMES.sender)).pubkey).toBe(vectors.keys.sender.pubkey)
    const root = await keys.derive(huddle, new Uint8Array([...new TextEncoder().encode("device:"), ...device]))
    expect(hexOf(root)).toBe(vectors.keys.participant.root)
    expect((await keys.signingKey(root, NAMES.participant(day))).pubkey).toBe(vectors.keys.participant.pubkey)
  })

  test("seal keys", async () => {
    expect(hexOf(await keys.sealKey(sync, NAMES.vault))).toBe(vectors.sealKeys.vault)
    expect(hexOf(await keys.sealKey(epoch, NAMES.book))).toBe(vectors.sealKeys.book)
    expect(hexOf(await keys.sealKey(sync, NAMES.plays(day)))).toBe(vectors.sealKeys.plays)
    expect(hexOf(await keys.sealKey(invitation, NAMES.mailbox))).toBe(vectors.sealKeys.mailbox)
    expect(hexOf(await keys.sealKey(invitation, NAMES.inbox))).toBe(vectors.sealKeys.inbox)
    expect(hexOf(await keys.sealKey(huddle, NAMES.huddle(day)))).toBe(vectors.sealKeys.huddle)
  })

  test("lines", async () => {
    expect(await keys.locator(epoch, NAMES.book)).toBe(vectors.lines.book)
    expect(await keys.locator(sync, NAMES.plays(day))).toBe(vectors.lines.plays)
    expect(await keys.locator(sync, NAMES.inbox)).toBe(vectors.lines.inbox)
    expect(await keys.locator(sync, NAMES.access)).toBe(vectors.lines.access)
    expect(await keys.locator(invitation, NAMES.mailbox)).toBe(vectors.lines.mailbox)
    expect(await keys.locator(huddle, NAMES.huddle(day))).toBe(vectors.lines.huddle)
  })

  test("addresses", async () => {
    expect(await keys.address(epoch, NAMES.tip(vectors.keys.owner.pubkey, vectors.inputs.device.slice(0, 32)))).toBe(vectors.addresses.tip)
    expect(await keys.address(sync, NAMES.sharing)).toBe(vectors.addresses.sharing)
    expect(await keys.address(sync, NAMES.sending)).toBe(vectors.addresses.sending)
    expect(await keys.address(invitation, NAMES.mailbox)).toBe(vectors.addresses.mailbox)
    expect(await keys.address(sync, NAMES.copy(vectors.inputs.playId, 1, "device"))).toBe(vectors.addresses.copy)
    expect(await keys.address(invitation, NAMES.sentPlay(vectors.inputs.playId))).toBe(vectors.addresses.sent)
  })

  test("padded lengths", () => {
    vectors.paddedLengths.forEach(({ length, padded }) => expect(paddedLength(length)).toBe(padded))
  })

  test("a seal, and opens it", async () => {
    const sealed = await sealBytesWith(hex(vectors.seal.key), hex(vectors.seal.nonce), vectors.seal.place, hex(vectors.seal.compressed))
    expect(sealed).toEqual({ ok: true, value: vectors.seal.content })
    expect(await keys.openJson(hex(vectors.seal.key), vectors.seal.place, vectors.seal.content)).toEqual({ ok: true, value: vectors.inputs.sealed })
  })
})

describe("a seal", () => {
  const key = hex(vectors.seal.key)
  const place = vectors.seal.place

  test("made here opens here", async () => {
    const sealed = await keys.sealJson(key, place, { tokens: 1_234 })
    expect(sealed.ok && (await keys.openJson(key, place, sealed.value))).toEqual({ ok: true, value: { tokens: 1_234 } })
  })

  test.each([
    ["another kind", { kind: 34_741 }],
    ["another line", { v: "0".repeat(32) }],
    ["another address", { d: "0".repeat(32) }],
    ["another author", { pubkey: vectors.keys.member.pubkey }],
  ])("does not open moved to %s", async (_, change) => {
    expect(await keys.openJson(key, { ...place, ...change }, vectors.seal.content)).toEqual({ ok: false, error: { type: "does-not-open" } })
  })

  test("refuses what is not one", async () => {
    expect(await keys.openJson(key, place, "パチンコ")).toEqual({ ok: false, error: { type: "not-base64" } })
    expect(await keys.openJson(key, place, btoa("\u0002".repeat(64)))).toEqual({ ok: false, error: { type: "unknown-version" } })
  })
})

describe("padding", () => {
  test("goes back to what was padded, and refuses nothing and too much", () => {
    const bytes = new TextEncoder().encode("x".repeat(300))
    const padded = pad(bytes)
    expect(padded.ok && unpad(padded.value)).toEqual({ ok: true, value: bytes })
    expect(pad(new Uint8Array(0))).toEqual({ ok: false, error: { type: "empty" } })
    expect(pad(new Uint8Array(MOST_UNPADDED + 1))).toEqual({ ok: false, error: { type: "too-large", length: MOST_UNPADDED + 1 } })
  })

  test("cuts what is too large into pieces a seal carries", () => {
    const pieces = piecesOf(new Uint8Array(MOST_UNPADDED * 2 + 5))
    expect(pieces.map((piece) => piece.length)).toEqual([MOST_UNPADDED, MOST_UNPADDED, 5])
  })
})

describe("signing", () => {
  test("makes an event any relay and any device takes as its author's", async () => {
    const author = await keys.signingKey(sync, NAMES.owner)
    const event = keys.sign(author, { created_at: 1_000, kind: 4738, tags: [["v", "0".repeat(32)]], content: "x" })
    expect(event.pubkey).toBe(vectors.keys.owner.pubkey)
    expect(isSignedEvent(event)).toBe(true)
    expect(isSignedEvent({ ...event, content: "y" })).toBe(false)
    expect(isSignedEvent({ ...event, sig: "0".repeat(128) })).toBe(false)
  })
})
