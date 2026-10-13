import { Err, Ok, type Result } from "../../core/result/result"
import type { StorageError } from "../port/book-storage"
import type { DeviceData } from "../port/device-data"
import { type Connection, completionOf, unavailable } from "./database"

/** What every key the app keeps in localStorage begins with. */
const KEPT_UNDER = "p-lens."

const keptKeys = (): readonly string[] => Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index) ?? "").filter((key) => key.startsWith(KEPT_UNDER))

/** localStorage may be absent or refuse; what it then holds was never kept in it. */
const forgetKept = (): void => {
  try {
    keptKeys().forEach((key) => localStorage.removeItem(key))
  } catch {
    return
  }
}

/**
 * The device's data in this browser: every store of the database emptied
 * in one transaction, so that it is all gone or all there, and then the
 * keys the app keeps in localStorage. The database itself stays, empty:
 * deleting it would wait on every other open copy of the app.
 */
export const createBrowserDeviceData = (connect: Connection): DeviceData => ({
  clear: async (): Promise<Result<void, StorageError>> => {
    const database = await connect()
    if (!database.ok) return database
    const stores = [...database.value.objectStoreNames]
    try {
      const transaction = database.value.transaction(stores, "readwrite")
      const done = completionOf(transaction)
      stores.forEach((store) => transaction.objectStore(store).clear())
      const emptied = await done
      if (!emptied.ok) return emptied
    } catch (cause) {
      return Err(unavailable(cause))
    }
    forgetKept()
    return Ok(undefined)
  },
})
