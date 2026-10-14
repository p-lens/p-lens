import type { DestinationStoreError } from "../sync/port/destination-store"
import type { InvitationStoreError } from "../sync/port/invitation-store"
import type { LinkStoreError } from "../sync/port/link-store"
import type { SyncProblem } from "./errors"

/** What a store of a device's links, destinations or invitations failing comes to: out of reach, or holding one that no longer reads. */
export const linksProblemOf = (error: LinkStoreError | DestinationStoreError | InvitationStoreError): SyncProblem =>
  error.type === "unreadable" ? { type: "links-unreadable" } : { type: "links", detail: error.detail }
