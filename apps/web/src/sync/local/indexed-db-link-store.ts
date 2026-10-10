import { type Result, mapErr, mapOk } from "../../core/result/result"
import { type Connection, SYNC_LINKS, completionOf, resultOf } from "../../storage/browser/database"
import type { StorageError } from "../../storage/port/book-storage"
import type { LinkStore, LinkStoreError, SyncLink } from "../port/link-store"

const fromStorage = <T>(result: Result<T, StorageError>): Result<T, LinkStoreError> =>
  mapErr(result, (error) => ({ type: "unavailable", detail: error.type === "unavailable" ? error.detail : error.type }))

/** A device's sync links, kept in the database its books are in. */
export const createIndexedDbLinkStore = (database: Connection): LinkStore => ({
  list: async () => {
    const opened = fromStorage(await database())
    if (!opened.ok) return opened
    return mapOk(fromStorage(await resultOf<SyncLink[]>(opened.value.transaction(SYNC_LINKS).objectStore(SYNC_LINKS).getAll())), (links) => links ?? [])
  },
  read: async (bookId) => {
    const opened = fromStorage(await database())
    if (!opened.ok) return opened
    return fromStorage(await resultOf<SyncLink>(opened.value.transaction(SYNC_LINKS).objectStore(SYNC_LINKS).get(bookId)))
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
