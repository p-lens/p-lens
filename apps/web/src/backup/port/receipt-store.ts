import type { Receipt } from "../../core/backup/standing"
import type { Result } from "../../core/result/result"

/** A store out of reach, or a receipt kept in it that does not read as one. */
export type ReceiptStoreError = { readonly type: "unavailable"; readonly detail: string } | { readonly type: "unreadable" }

/** Where a device keeps the receipt of each book's last backup: one a book, the newest in place of the one before. */
export interface ReceiptStore {
  readonly list: () => Promise<Result<readonly Receipt[], ReceiptStoreError>>
  /** Let go of a book's receipt: the book is leaving the device, and its backups elsewhere are whoever holds them's. */
  readonly remove: (bookId: Receipt["bookId"]) => Promise<Result<void, ReceiptStoreError>>
  readonly write: (receipt: Receipt) => Promise<Result<void, ReceiptStoreError>>
}
