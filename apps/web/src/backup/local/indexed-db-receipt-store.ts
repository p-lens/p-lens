import type { Receipt } from "../../core/backup/standing"
import { type Result, mapErr, mapOk } from "../../core/result/result"
import { BACKUP_RECEIPTS, type Connection, completionOf, resultOf } from "../../storage/browser/database"
import type { StorageError } from "../../storage/port/book-storage"
import type { ReceiptStore, ReceiptStoreError } from "../port/receipt-store"

const fromStorage = <T>(result: Result<T, StorageError>): Result<T, ReceiptStoreError> =>
  mapErr(result, (error) => ({ type: "unavailable", detail: error.type === "unavailable" ? error.detail : error.type }))

/** A device's backup receipts, kept in the database its books are in. */
export const createIndexedDbReceiptStore = (database: Connection): ReceiptStore => ({
  list: async () => {
    const opened = fromStorage(await database())
    if (!opened.ok) return opened
    return mapOk(fromStorage(await resultOf<Receipt[]>(opened.value.transaction(BACKUP_RECEIPTS).objectStore(BACKUP_RECEIPTS).getAll())), (receipts) => receipts ?? [])
  },
  remove: async (bookId) => {
    const opened = fromStorage(await database())
    if (!opened.ok) return opened
    const transaction = opened.value.transaction(BACKUP_RECEIPTS, "readwrite")
    const done = completionOf(transaction)
    transaction.objectStore(BACKUP_RECEIPTS).delete(bookId)
    return fromStorage(await done)
  },
  write: async (receipt) => {
    const opened = fromStorage(await database())
    if (!opened.ok) return opened
    const transaction = opened.value.transaction(BACKUP_RECEIPTS, "readwrite")
    const done = completionOf(transaction)
    transaction.objectStore(BACKUP_RECEIPTS).put(receipt)
    return fromStorage(await done)
  },
})
