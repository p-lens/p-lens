import { type Result, mapErr, mapOk } from "../../core/result/result"
import { type Connection, DESTINATIONS, completionOf, resultOf } from "../../storage/browser/database"
import type { StorageError } from "../../storage/port/book-storage"
import type { Destination, DestinationStore, DestinationStoreError } from "../port/destination-store"

const fromStorage = <T>(result: Result<T, StorageError>): Result<T, DestinationStoreError> =>
  mapErr(result, (error) => ({ type: "unavailable", detail: error.type === "unavailable" ? error.detail : error.type }))

/** The books a device may send plays to, kept in the database its own books are in. */
export const createIndexedDbDestinationStore = (database: Connection): DestinationStore => ({
  list: async () => {
    const opened = fromStorage(await database())
    if (!opened.ok) return opened
    return mapOk(fromStorage(await resultOf<Destination[]>(opened.value.transaction(DESTINATIONS).objectStore(DESTINATIONS).getAll())), (kept) => (kept ?? []).toSorted((left, right) => left.joinedAt.localeCompare(right.joinedAt)))
  },
  write: async (destination) => {
    const opened = fromStorage(await database())
    if (!opened.ok) return opened
    const transaction = opened.value.transaction(DESTINATIONS, "readwrite")
    const done = completionOf(transaction)
    transaction.objectStore(DESTINATIONS).put(destination)
    return fromStorage(await done)
  },
  remove: async (lineId) => {
    const opened = fromStorage(await database())
    if (!opened.ok) return opened
    const transaction = opened.value.transaction(DESTINATIONS, "readwrite")
    const done = completionOf(transaction)
    transaction.objectStore(DESTINATIONS).delete(lineId)
    return fromStorage(await done)
  },
})
