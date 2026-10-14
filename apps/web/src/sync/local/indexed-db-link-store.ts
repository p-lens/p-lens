import { Err, Ok, type Result, andThen, collect, mapErr } from "../../core/result/result"
import { type Connection, SYNC_LINKS, completionOf, resultOf } from "../../storage/browser/database"
import type { StorageError } from "../../storage/port/book-storage"
import type { LinkStore, LinkStoreError, SyncLink } from "../port/link-store"

const fromStorage = <T>(result: Result<T, StorageError>): Result<T, LinkStoreError> =>
  mapErr(result, (error) => ({ type: "unavailable", detail: error.type === "unavailable" ? error.detail : error.type }))

type Fields = Readonly<Record<string, unknown>>

const isFields = (value: unknown): value is Fields => typeof value === "object" && value !== null && !Array.isArray(value)

const LINK_TEXTS = ["bookId", "relayUrl", "secret"] as const

const isCursor = (value: unknown): boolean => typeof value === "number" && Number.isInteger(value) && value >= 0

const isTexts = (value: unknown): boolean => Array.isArray(value) && value.every((each) => typeof each === "string")

/** A link as the store gave it back, or that it does not read as one: what is left out of a link made before relays said is none, never anything else. */
const linkOf = (value: unknown): Result<SyncLink, LinkStoreError> =>
  isFields(value) &&
  LINK_TEXTS.every((name) => typeof value[name] === "string") &&
  isCursor(value["cursor"]) &&
  (value["begunAt"] === undefined || typeof value["begunAt"] === "string") &&
  (value["inboxHandled"] === undefined || isTexts(value["inboxHandled"]))
    ? Ok(value as unknown as SyncLink)
    : Err({ type: "unreadable" })

/** A device's sync links, kept in the database its books are in. */
export const createIndexedDbLinkStore = (database: Connection): LinkStore => ({
  list: async () => {
    const opened = fromStorage(await database())
    if (!opened.ok) return opened
    return andThen(fromStorage(await resultOf<unknown[]>(opened.value.transaction(SYNC_LINKS).objectStore(SYNC_LINKS).getAll())), (links) => collect((links ?? []).map(linkOf)))
  },
  read: async (bookId) => {
    const opened = fromStorage(await database())
    if (!opened.ok) return opened
    return andThen(fromStorage(await resultOf<unknown>(opened.value.transaction(SYNC_LINKS).objectStore(SYNC_LINKS).get(bookId))), (kept) => (kept === undefined ? Ok(undefined) : linkOf(kept)))
  },
  remove: async (bookId) => {
    const opened = fromStorage(await database())
    if (!opened.ok) return opened
    const transaction = opened.value.transaction(SYNC_LINKS, "readwrite")
    const done = completionOf(transaction)
    transaction.objectStore(SYNC_LINKS).delete(bookId)
    return fromStorage(await done)
  },
  write: async (link) => {
    const opened = fromStorage(await database())
    if (!opened.ok) return opened
    const transaction = opened.value.transaction(SYNC_LINKS, "readwrite")
    const done = completionOf(transaction)
    transaction.objectStore(SYNC_LINKS).put(link)
    return fromStorage(await done)
  },
})
