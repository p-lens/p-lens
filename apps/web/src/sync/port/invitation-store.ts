import type { BookId } from "../../core/book/book"
import type { Result } from "../../core/result/result"
import type { InvitedRole } from "../../core/sync/invitation"

/**
 * One person a book's owner let into it, as the owner's device remembers
 * them: the grant's id on the line's relay, the name the owner gave —
 * which the relay is never told — what they may do, when they were let in,
 * and the code they were handed, so it can be handed over again.
 */
export interface KeptInvitation {
  readonly id: string
  readonly bookId: BookId
  readonly name: string
  readonly role: InvitedRole
  /** ISO 8601. */
  readonly invitedAt: string
  readonly code: string
}

/** A store out of reach, or an invitation kept in it that does not read as one. */
export type InvitationStoreError = { readonly type: "unavailable"; readonly detail: string } | { readonly type: "unreadable" }

/** Where a device keeps whom its books' owner let in. It is this device's alone: the names go nowhere. */
export interface InvitationStore {
  readonly list: (bookId: BookId) => Promise<Result<readonly KeptInvitation[], InvitationStoreError>>
  readonly write: (invitation: KeptInvitation) => Promise<Result<void, InvitationStoreError>>
  readonly remove: (id: string) => Promise<Result<void, InvitationStoreError>>
}
