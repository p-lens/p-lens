import { Err, Ok, type Result, mapErr, mapOk } from "../../core/result/result"
import { type Connection, DESTINATIONS, completionOf, resultOf } from "../../storage/browser/database"
import type { StorageError } from "../../storage/port/book-storage"
import type { Destination, DestinationStore, DestinationStoreError } from "../port/destination-store"

const fromStorage = <T>(result: Result<T, StorageError>): Result<T, DestinationStoreError> =>
  mapErr(result, (error) => ({ type: "unavailable", detail: error.type === "unavailable" ? error.detail : error.type }))

/**
 * A transaction on the destinations, or why there is none. A database
 * without the store refuses by throwing; that is a store that cannot be
 * reached, said as any other is, and never an exception let loose on
 * whatever asked — the rail asks on every screen.
 */
const begin = (database: IDBDatabase, mode: IDBTransactionMode): Result<IDBTransaction, DestinationStoreError> => {
  try {
    return Ok(database.transaction(DESTINATIONS, mode))
  } catch (cause) {
    return Err({ type: "unavailable", detail: String(cause) })
  }
}

/** The books a device may send plays to, kept in the database its own books are in. */
export const createIndexedDbDestinationStore = (database: Connection): DestinationStore => ({
  list: async () => {
    const opened = fromStorage(await database())
    if (!opened.ok) return opened
    const transaction = begin(opened.value, "readonly")
    if (!transaction.ok) return transaction
    return mapOk(fromStorage(await resultOf<Destination[]>(transaction.value.objectStore(DESTINATIONS).getAll())), (kept) => (kept ?? []).toSorted((left, right) => left.joinedAt.localeCompare(right.joinedAt)))
  },
  write: async (destination) => {
    const opened = fromStorage(await database())
    if (!opened.ok) return opened
    const transaction = begin(opened.value, "readwrite")
    if (!transaction.ok) return transaction
    const done = completionOf(transaction.value)
    transaction.value.objectStore(DESTINATIONS).put(destination)
    return fromStorage(await done)
  },
  remove: async (lineId) => {
    const opened = fromStorage(await database())
    if (!opened.ok) return opened
    const transaction = begin(opened.value, "readwrite")
    if (!transaction.ok) return transaction
    const done = completionOf(transaction.value)
    transaction.value.objectStore(DESTINATIONS).delete(lineId)
    return fromStorage(await done)
  },
})
