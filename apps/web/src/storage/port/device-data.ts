import type { Result } from "../../core/result/result"
import type { StorageError } from "./book-storage"

/**
 * Everything this device keeps for the app, as one thing that can be
 * emptied: its books and their history, the plays being played, what it
 * syncs and shares, its backups' receipts, the catalog and parlor list as
 * last read, the id it writes to the catalog under, and what the person
 * set. What was handed elsewhere — a backup's file, a book on another
 * device — is not the device's, and is not touched.
 */
export interface DeviceData {
  /** Empty it, all or none of what the database holds; the app is to be opened afresh afterwards, holding nothing of what was. */
  readonly clear: () => Promise<Result<void, StorageError>>
}
