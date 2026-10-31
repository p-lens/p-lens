import type { BookId } from "../core/book/book"
import { mapErr, Ok, type Result } from "../core/result/result"
import { pairingCode } from "../core/sync/pairing"
import type { FollowStorage } from "../storage/port/follow-storage"
import type { InvitationStoreError, KeptInvitation } from "../sync/port/invitation-store"
import type { LinkStoreError } from "../sync/port/link-store"
import type { Outcome } from "./errors"
import { invitationsOf, invite, ownersLink, type InvitationPorts } from "./invitations"
import { linksProblemOf } from "./kept-links"
import { fromHistory } from "./lift"
import { withoutCopies } from "./stop-sync"
import { syncBook, type SyncPorts } from "./sync"

/** Everything making a book's line anew reaches: its syncing, the people its owner let in, and the copies of plays the owner's other devices play for it. */
export interface RenewSyncPorts {
  readonly sync: SyncPorts
  readonly invitations: InvitationPorts
  readonly follow: FollowStorage
}

const fromStore = <T>(result: Result<T, InvitationStoreError | LinkStoreError>): Outcome<T> => mapErr(result, (error) => ({ type: "sync", problem: linksProblemOf(error) }))

/** The people let into the book let in again, one after another, on the line it is on now: each by the same name and as the same, with a new code, and the old one forgotten. */
const invitedAgain = (ports: RenewSyncPorts, bookId: BookId, title: string, kept: readonly KeptInvitation[]): Promise<Outcome<void>> =>
  kept.reduce<Promise<Outcome<void>>>(async (so, invitation) => {
    const done = await so
    if (!done.ok) return done
    const made = await invite(ports.invitations, bookId, title, invitation.name, invitation.role)
    return made.ok ? fromStore(await ports.invitations.invitations.remove(invitation.id)) : made
  }, Promise.resolve(Ok(undefined)))

/**
 * Make a book's line anew, under a secret of its own, to shut out a device
 * that had the old one — one lost, sold or no longer one's own. A device
 * holds the line's secret, the same on each of its owner's devices, so no
 * device can be told from another; only a new secret leaves one behind.
 *
 * What this device wrote goes on the old line first, so a round that
 * cannot be made — the relay out of reach, a conflict to settle — changes
 * nothing. Then the book's whole history goes on a line under the new
 * secret, and whoever this device let in is let in again on it, with a new
 * code for each to be sent. The owner's other devices are moved onto the
 * new line by its code (`joinSync`); until then they, and the device left
 * behind, go on along the old line, which the relay lets go of once nobody
 * uses it. The new line's code.
 */
export const renewSync = async (ports: RenewSyncPorts, bookId: BookId, title: string): Promise<Outcome<string>> => {
  const link = await ownersLink(ports.sync.links, bookId)
  if (!link.ok) return link
  const before = await syncBook(ports.sync, bookId)
  if (!before.ok) return before
  const kept = await invitationsOf(ports.invitations, bookId)
  if (!kept.ok) return kept
  const copies = await withoutCopies(ports.follow, bookId)
  if (!copies.ok) return copies
  const unsent = fromHistory(await ports.sync.history.unsend(bookId))
  if (!unsent.ok) return unsent
  const secret = ports.sync.sealer.newSecret()
  const moved = fromStore(await ports.sync.links.write({ bookId, relayUrl: link.value.relayUrl, secret, cursor: 0 }))
  if (!moved.ok) return moved
  const after = await syncBook(ports.sync, bookId)
  if (!after.ok) return after
  const again = await invitedAgain(ports, bookId, title, kept.value)
  return again.ok ? Ok(pairingCode(secret)) : again
}
