import { fromBase64Url, toBase64Url } from "../bytes"
import { readChange, type Change, type ChangeId } from "./change"

/** What a 4738 event's seal holds (PROTOCOL.md §5.5): a change, or the list of the parts a change too large for one seal was cut into. */
export type LineMessage =
  | { readonly type: "change"; readonly change: Change }
  | { readonly type: "manifest"; readonly parts: readonly string[]; readonly sha256: string }

const HEX64 = /^[0-9a-f]{64}$/

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value)

/** A message as it is sealed. */
export const lineMessageJson = (message: LineMessage): unknown => (message.type === "change" ? { change: message.change } : { parts: message.parts, sha256: message.sha256 })

/** What a 4738's seal held, read, or none where it is neither a change nor a manifest. */
export const readLineMessage = (value: unknown): LineMessage | undefined => {
  if (!isRecord(value)) return undefined
  const keys = Object.keys(value)
  if (keys.length === 1 && keys[0] === "change") return ((change) => (change === undefined ? undefined : { type: "change", change }))(readChange(value["change"]))
  const [parts, sha256] = [value["parts"], value["sha256"]]
  return keys.length === 2 && Array.isArray(parts) && parts.length > 0 && parts.every((part) => typeof part === "string" && HEX64.test(part)) && typeof sha256 === "string" && HEX64.test(sha256)
    ? { type: "manifest", parts, sha256 }
    : undefined
}

/** One device's heads of a line, as its 34738 says them (PROTOCOL.md §5.4). */
export interface Tip {
  readonly heads: readonly ChangeId[]
  /** The latest base under the heads, and when its event was made. */
  readonly base: { readonly id: ChangeId; readonly createdAt: number }
  /** Rising with each of the device's tips, so that an older one is never taken for its latest. */
  readonly stamp: number
}

export const tipJson = (tip: Tip): unknown => ({ heads: tip.heads, base: { id: tip.base.id, created_at: tip.base.createdAt }, stamp: tip.stamp })

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0

export const readTip = (value: unknown): Tip | undefined => {
  if (!isRecord(value) || !isRecord(value["base"])) return undefined
  const [heads, base, stamp] = [value["heads"], value["base"], value["stamp"]]
  const [id, createdAt] = [base["id"], base["created_at"]]
  return Array.isArray(heads) && heads.length > 0 && heads.every((head) => typeof head === "string" && HEX64.test(head)) && typeof id === "string" && HEX64.test(id) && isCount(createdAt) && isCount(stamp)
    ? { heads: heads as readonly ChangeId[], base: { id: id as ChangeId, createdAt }, stamp }
    : undefined
}

/** What a sync code carries (PROTOCOL.md §5.7): the book's sync secret, its epoch's, and the relay's address with its label. */
export interface SyncCode {
  readonly sync: Uint8Array
  readonly epoch: Uint8Array
  readonly relay: string
}

const PREFIX = "p-lens-sync:1:"

const SECRET_BYTES = 32

export const syncCodeText = (code: SyncCode): string => `${PREFIX}${toBase64Url(code.sync)}:${toBase64Url(code.epoch)}:${code.relay}`

/** A sync code read, or none where what was read is no sync code: its secrets whole, its relay a WebSocket's address. */
export const readSyncCode = (text: string): SyncCode | undefined => {
  const trimmed = text.trim()
  if (!trimmed.startsWith(PREFIX)) return undefined
  const [sync, epoch, ...relay] = trimmed.slice(PREFIX.length).split(":")
  const [syncBytes, epochBytes] = [fromBase64Url(sync ?? ""), fromBase64Url(epoch ?? "")]
  const address = relay.join(":")
  return syncBytes?.length === SECRET_BYTES && epochBytes?.length === SECRET_BYTES && /^wss?:\/\/[^\s]+$/.test(address) ? { sync: syncBytes, epoch: epochBytes, relay: address } : undefined
}
