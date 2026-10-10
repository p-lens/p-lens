import type { BookId } from "../../core/book/book"
import type { Result } from "../../core/result/result"

/**
 * A book's tie to its line: the relay the line is on, the secret its ids and
 * its key are made from, and how far along the line this device has come.
 */
export interface SyncLink {
  readonly bookId: BookId
  readonly relayUrl: string
  readonly secret: string
  /** The last place on the line whose commit this device has taken or put there. */
  readonly cursor: number
  /**
   * When the line `cursor` counts along was begun, as its relay says. A
   * relay lets go of a line left idle, and a device makes it again: a line
   * begun at another moment is another line, however far along it this
   * device had come. None for a link made before relays said.
   */
  readonly begunAt?: string
  /**
   * The plays sent to the book's inbox that its owner has dealt with, by
   * the ids they arrived under: recorded into a book, or let go. What is
   * on the inbox and not here is still waiting.
   */
  readonly inboxHandled?: readonly string[]
}

export type LinkStoreError = { readonly type: "unavailable"; readonly detail: string }

/** Where a device keeps which of its books are synced, and how. */
export interface LinkStore {
  readonly list: () => Promise<Result<readonly SyncLink[], LinkStoreError>>
  readonly read: (bookId: BookId) => Promise<Result<SyncLink | undefined, LinkStoreError>>
  /** Let go of a book's link: the device no longer syncs it. The line itself stays for whoever else is on it. */
  readonly remove: (bookId: BookId) => Promise<Result<void, LinkStoreError>>
  readonly write: (link: SyncLink) => Promise<Result<void, LinkStoreError>>
}
