import { bytesToHex } from "@noble/hashes/utils.js"

import type { BookSession } from "../../application/book-session"
import type { ApplicationError } from "../../application/errors"
import type { BookId, Member } from "../../core/book/book"
import type { IsoDate } from "../../core/calendar/calendar"
import type { BookFiles } from "../../core/journal/layout"
import { Err, Ok, type Result } from "../../core/result/result"
import { fromBase64Url, toBase64Url } from "../core/bytes"
import { canonicalJson, type Json } from "../core/book/canonical"
import { changeIdOf, readChange, stateDigestOf, type Base, type Change, type ChangeId } from "../core/book/change"
import type { StateProblem } from "../core/book/state"
import type { MemberRole } from "../core/book/roster"
import { lineMessageJson, readLineMessage, syncCodeText, type LineMessage } from "../core/book/wire"
import type { NostrEvent } from "../core/event"
import { NAMES } from "../core/keyring"
import { KIND } from "../core/kinds"
import type { Refusal } from "../core/messages"
import { piecesOf, type Place } from "../core/seal"
import type { Keys, SigningKey } from "../port/keys"
import type { BookLink, LineAccess, LineStore, LineStoreError } from "../port/line-store"
import type { Relays } from "../port/relay"
import type { RelayInformation } from "../port/relay-information"
import type { DraftStorage } from "../../storage/port/draft-storage"

/**
 * Why a book could not be put on its line, kept there, or taken from it.
 *
 * - `no-relay`: this build names no relay to begin a line on.
 * - `not-a-code`: what was read is neither a sync code nor an invitation code.
 * - `unreachable`: the relay did not answer, or the device is offline.
 * - `refused`: the relay would not keep what was sent, and why.
 * - `nothing-on-line`: the line the code names holds no book yet, or no mailbox for the invitation.
 * - `removed`: the owner took the person this device is let in as back out of the book.
 * - `not-owner`: only the owner's devices let people in or take them out.
 * - `no-member`: the person to take out is no longer in the book.
 * - `roster-unreadable`: the book's roster does not read, so nobody is let in or taken out by it.
 * - `book-here`: the book the code names is on this device already.
 * - `already-synced`: the book is on a line already.
 * - `kept`: what the device keeps of its lines could not be read or written.
 * - `book`: the book could not be read or written.
 * - `broken`: a change on the line does not come to what it says.
 * - `file-removed`: the book lost a file, which no change carries.
 * - `too-large`: a change too large even for parts: more than a seal carries of its parts' names.
 */
export type BookSyncProblem =
  | { readonly type: "no-relay" }
  | { readonly type: "not-a-code" }
  | { readonly type: "unreachable" }
  | { readonly type: "refused"; readonly refusal: Refusal }
  | { readonly type: "nothing-on-line" }
  | { readonly type: "removed" }
  | { readonly type: "not-owner" }
  | { readonly type: "no-member" }
  | { readonly type: "roster-unreadable" }
  | { readonly type: "book-here" }
  | { readonly type: "already-synced" }
  | { readonly type: "kept"; readonly error: LineStoreError }
  | { readonly type: "book"; readonly error: ApplicationError }
  | { readonly type: "broken"; readonly problem: StateProblem | { readonly type: "result-mismatch"; readonly id: ChangeId } }
  | { readonly type: "file-removed"; readonly path: string }
  | { readonly type: "too-large" }

/** What a book's line reaches: the keys, the relays and what they say of themselves, what the device keeps of its lines, the books, the plays the device keeps, who uses the device, the business day, and the relay this build begins lines on. */
export interface BookSyncPorts {
  readonly keys: Keys
  readonly relays: Relays
  readonly information: RelayInformation
  readonly lines: LineStore
  readonly session: Pick<BookSession, "books" | "stored" | "fold" | "adoptBook">
  /** The plays the device keeps, which the plays lines copy and are copied into (PROTOCOL.md §6). */
  readonly drafts: Pick<DraftStorage, "listDrafts" | "createDraft" | "deleteDraft">
  readonly me: Member
  readonly businessDay: () => IsoDate
  readonly relayUrl: string | undefined
  /** Milliseconds since the epoch. */
  readonly clock: () => number
  /** An id nothing else has, for a line of a book's activity. */
  readonly newId: () => string
}

/**
 * What a book's line is opened, sealed and signed with, drawn from its
 * secrets: the epoch's, the owner's key, and the key this device writes with
 * — the owner's on the owner's devices, an editor's `M` on theirs, none on a
 * viewer's — and on the owner's devices the vault's (PROTOCOL.md §3.1, §5.6).
 */
export interface BookLineKeys {
  readonly epoch: Uint8Array
  /** `O`, in hex. */
  readonly owner: string
  readonly signer: SigningKey | undefined
  readonly vault: Uint8Array | undefined
  readonly v: string
  readonly sealKey: Uint8Array
}

/** A link of the owner's devices: one holding the book's sync secret. */
export type OwnersLink = BookLink & { readonly access: Extract<LineAccess, { readonly role: "owner" }> }

export const isOwnersLink = (link: BookLink): link is OwnersLink => link.access.role === "owner"

/** A secret as a link keeps it, as bytes. */
export const secretOf = (text: string): Uint8Array<ArrayBuffer> => fromBase64Url(text) ?? new Uint8Array(32)

/** The keys of one of the owner's devices that are no epoch's: the owner's, and the vault's. */
export const ownersKeysOf = async (keys: Keys, sync: string): Promise<{ readonly sync: Uint8Array; readonly owner: SigningKey; readonly vault: Uint8Array }> => {
  const secret = secretOf(sync)
  return { sync: secret, owner: await keys.signingKey(secret, NAMES.owner), vault: await keys.sealKey(secret, NAMES.vault) }
}

/** The key a person let in writes with: an editor's `M`; a viewer writes nothing. */
const membersSigner = async (keys: Keys, access: Extract<LineAccess, { readonly role: MemberRole }>): Promise<SigningKey | undefined> =>
  access.role === "editor" ? keys.signingKey(secretOf(access.invitation), NAMES.member) : undefined

export const bookLineKeysOf = async (keys: Keys, link: Pick<BookLink, "access" | "epoch">): Promise<BookLineKeys> => {
  const epoch = secretOf(link.epoch)
  const [v, sealKey] = [await keys.locator(epoch, NAMES.book), await keys.sealKey(epoch, NAMES.book)]
  if (link.access.role === "owner") {
    const owners = await ownersKeysOf(keys, link.access.sync)
    return { epoch, owner: owners.owner.pubkey, signer: owners.owner, vault: owners.vault, v, sealKey }
  }
  return { epoch, owner: link.access.owner, signer: await membersSigner(keys, link.access), vault: undefined, v, sealKey }
}

/** Where a 4738 event's seal is stuck: the book's line, and whoever signed it. */
const changePlace = (keys: BookLineKeys, author: string): Place => ({ kind: KIND.bookChange, v: keys.v, d: undefined, pubkey: author })

export const seconds = (ports: Pick<BookSyncPorts, "clock">): number => Math.floor(ports.clock() / 1000)

const kept = <T>(result: Result<T, LineStoreError>): Result<T, BookSyncProblem> => (result.ok ? result : Err({ type: "kept", error: result.error }))

const fromBook = <T>(result: Result<T, ApplicationError>): Result<T, BookSyncProblem> => (result.ok ? result : Err({ type: "book", error: result.error }))

/** Seals a message for the book's line and signs it with the key given. */
const signedMessage = async (keys: Keys, line: BookLineKeys, signer: SigningKey, message: LineMessage, createdAt: number): Promise<Result<NostrEvent, "too-large">> => {
  const sealed = await keys.sealJson(line.sealKey, changePlace(line, signer.pubkey), lineMessageJson(message))
  return sealed.ok ? Ok(signedEvent(keys, line, signer, sealed.value, createdAt)) : Err("too-large")
}

/** An event of the book's line, signed with the key given, with what is sealed in it. */
const signedEvent = (keys: Keys, line: BookLineKeys, signer: SigningKey, content: string, createdAt: number): NostrEvent =>
  keys.sign(signer, { created_at: createdAt, kind: KIND.bookChange, tags: [["v", line.v]], content })

/**
 * A change as the events that carry it (PROTOCOL.md §5.5), signed by the
 * device's key: one, or where it is too large for one seal, its deflated
 * canonical JSON cut into parts and the manifest naming them, the parts first.
 */
export const eventsOfChange = async (keys: Keys, line: BookLineKeys, signer: SigningKey, change: Change, createdAt: number): Promise<Result<readonly NostrEvent[], "too-large">> => {
  const whole = await signedMessage(keys, line, signer, { type: "change", change }, createdAt)
  if (whole.ok) return Ok([whole.value])
  const deflated = await keys.deflate(new TextEncoder().encode(canonicalJson(change as unknown as Json)))
  const sealed = await Promise.all(piecesOf(deflated).map((piece) => keys.sealBytes(line.sealKey, changePlace(line, signer.pubkey), piece)))
  const parts = sealed.flatMap((piece) => (piece.ok ? [signedEvent(keys, line, signer, piece.value, createdAt)] : []))
  if (parts.length !== sealed.length) return Err("too-large")
  const manifest = await signedMessage(keys, line, signer, { type: "manifest", parts: parts.map((part) => part.id), sha256: await keys.sha256(deflated) }, createdAt)
  return manifest.ok ? Ok([...parts, manifest.value]) : manifest
}

/** What an event of the book's line brought: a change, a manifest waiting for its parts, or something that did not open as JSON, which may be a part. */
export type Opened = { readonly type: "message"; readonly message: LineMessage } | { readonly type: "loose" } | { readonly type: "none" }

/**
 * What a 4738 event brought, sealed for whoever signed it: a change its
 * writer signed, or a merge with no writer, whoever carried it
 * (PROTOCOL.md §5.1); a manifest; or something that did not open as JSON,
 * which may be a part.
 */
export const openChangeEvent = async (keys: Keys, line: BookLineKeys, event: NostrEvent): Promise<Opened> => {
  if (event.kind !== KIND.bookChange) return { type: "none" }
  const opened = await keys.openJson(line.sealKey, changePlace(line, event.pubkey), event.content)
  if (!opened.ok) return opened.error.type === "not-inflatable" || opened.error.type === "not-json" ? { type: "loose" } : { type: "none" }
  const message = readLineMessage(opened.value)
  if (message === undefined) return { type: "none" }
  return message.type === "manifest" || message.change.writer === event.pubkey || (message.change.sort === "merge" && message.change.writer === "") ? { type: "message", message } : { type: "none" }
}

/** A manifest's change put together from its parts, where every part is held, signed by whoever signed the manifest, and they come to what it says; a change whose writer did not sign it is none. */
export const assembled = async (keys: Keys, line: BookLineKeys, manifest: NostrEvent, parts: Extract<LineMessage, { type: "manifest" }>, loose: ReadonlyMap<string, NostrEvent>): Promise<Change | undefined> => {
  const events = parts.parts.map((id) => loose.get(id))
  if (events.some((event) => event === undefined || event.pubkey !== manifest.pubkey)) return undefined
  const pieces = await Promise.all(events.map((event) => keys.openBytes(line.sealKey, changePlace(line, manifest.pubkey), event?.content ?? "")))
  if (!pieces.every((piece) => piece.ok)) return undefined
  const whole = new Uint8Array(pieces.reduce((length, piece) => length + (piece.ok ? piece.value.length : 0), 0))
  pieces.reduce((offset, piece) => (piece.ok ? (whole.set(piece.value, offset), offset + piece.value.length) : offset), 0)
  if ((await keys.sha256(whole)) !== parts.sha256) return undefined
  const inflated = await keys.inflate(whole)
  if (!inflated.ok) return undefined
  try {
    const change = readChange(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(inflated.value)))
    return change !== undefined && (change.writer === manifest.pubkey || (change.sort === "merge" && change.writer === "")) ? change : undefined
  } catch {
    return undefined
  }
}

const LABEL_DIGITS = 2

/** A relay's address for a new line: followed by a label drawn at random where the relay gives lines labels (PROTOCOL.md §10). */
const addressFor = (relayUrl: string, labels: number): string =>
  labels === 0 ? relayUrl : `${relayUrl.replace(/\/+$/, "")}/${Math.floor(Math.random() * labels).toString(16).padStart(LABEL_DIGITS, "0")}`

/** 32 lowercase hex digits: a device's name on a line. */
export const deviceName = (keys: Keys): string => bytesToHex(keys.newSecret().subarray(0, 16))

/** A book's base: every file, under the book's id, the line starting with it. */
export const baseOf = (bookId: BookId, files: BookFiles, writer: string, at: number, parents: readonly ChangeId[]): Base => ({
  sort: "base",
  parents,
  writer,
  at,
  book: bookId,
  files,
  result: stateDigestOf(files),
})

/**
 * Put a book on a line of its own, on the relay this build names: fresh
 * secrets, the book whole as the line's first base, waiting in the outbox
 * for the line to be opened. A book already on one stays on it.
 */
export const startSync = async (ports: BookSyncPorts, bookId: BookId): Promise<Result<BookLink, BookSyncProblem>> => {
  if (ports.relayUrl === undefined) return Err({ type: "no-relay" })
  const links = kept(await ports.lines.links())
  if (!links.ok) return links
  if (links.value.some((link) => link.bookId === bookId)) return Err({ type: "already-synced" })
  const labels = await ports.information.labelsOf(ports.relayUrl)
  if (!labels.ok) return Err({ type: "unreachable" })
  const stored = fromBook(await ports.session.stored(bookId))
  if (!stored.ok) return stored
  const now = seconds(ports)
  const secrets = { access: { role: "owner", sync: toBase64Url(ports.keys.newSecret()) }, epoch: toBase64Url(ports.keys.newSecret()) } as const
  const [line, owners] = [await bookLineKeysOf(ports.keys, secrets), await ownersKeysOf(ports.keys, secrets.access.sync)]
  const base = baseOf(bookId, stored.value.files, owners.owner.pubkey, now, [])
  const id = changeIdOf(base)
  const link: BookLink = { bookId, ...secrets, epochNumber: 0, floor: { type: "joined" }, relay: addressFor(ports.relayUrl, labels.value), device: deviceName(ports.keys), head: id, mark: now, stamp: 0, tipAt: 0 }
  const settled = kept(await ports.lines.settle({ link, changes: [{ id, change: base, createdAt: now }], shadow: stored.value.files }))
  if (!settled.ok) return settled
  const events = await eventsOfChange(ports.keys, line, owners.owner, base, now)
  if (!events.ok) return Err({ type: "too-large" })
  const queued = kept(await ports.lines.queue(bookId, events.value))
  return queued.ok ? Ok(link) : queued
}

/** The code another of the owner's devices joins a book's line by: the sync secret and the epoch the line is now at. */
export const syncCodeOf = (link: OwnersLink): string => syncCodeText({ sync: secretOf(link.access.sync), epoch: secretOf(link.epoch), relay: link.relay })

/** Stop keeping a book on its line, on this device: the book stays as it is, and the other devices go on. */
export const stopSync = async (ports: Pick<BookSyncPorts, "lines">, bookId: BookId): Promise<Result<void, BookSyncProblem>> => kept(await ports.lines.forget(bookId))
