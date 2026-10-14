import type { Result } from "../../core/result/result"

/**
 * Somewhere this device sends plays to: another person's book, known only
 * by the invitation they handed over and what it says the book is called.
 * Nothing of the book is here — a sender is never shown it.
 */
export interface Destination {
  /** The inbox line plays are put on: what tells one destination from another. */
  readonly lineId: string
  readonly relayUrl: string
  /** The invitation as it was handed over: what opens the inbox to put a play on it. */
  readonly code: string
  readonly title: string
  /** ISO 8601. */
  readonly joinedAt: string
}

/** A store out of reach, or a destination kept in it that does not read as one. */
export type DestinationStoreError = { readonly type: "unavailable"; readonly detail: string } | { readonly type: "unreadable" }

/** Where a device keeps the books it may send plays to. */
export interface DestinationStore {
  readonly list: () => Promise<Result<readonly Destination[], DestinationStoreError>>
  readonly write: (destination: Destination) => Promise<Result<void, DestinationStoreError>>
  readonly remove: (lineId: string) => Promise<Result<void, DestinationStoreError>>
}
