import type { BookId } from "../core/book/book"
import { collect, mapErr, mapOk, type Result } from "../core/result/result"
import type { HistoryPort } from "../history/port/history-port"
import type { FollowStorage } from "../storage/port/follow-storage"
import type { InvitationStore, InvitationStoreError } from "../sync/port/invitation-store"
import type { LinkStore, LinkStoreError } from "../sync/port/link-store"
import type { Outcome } from "./errors"
import { linksProblemOf } from "./kept-links"
import { fromDraft, fromHistory } from "./lift"

/** Everything a device keeps of a book's syncing: its link, which of its commits are on the line, the people it remembers letting in, and its copies of the plays the owner's other devices play for it. */
export interface StopSyncPorts {
  readonly links: LinkStore
  readonly history: HistoryPort
  readonly invitations: InvitationStore
  readonly follow: FollowStorage
}

const fromStore = <T>(result: Result<T, InvitationStoreError | LinkStoreError>): Outcome<T> => mapErr(result, (error) => ({ type: "sync", problem: linksProblemOf(error) }))

/** The people this device remembers letting into the book, forgotten: their invitations are into a line it no longer holds. */
const withoutInvitations = async (ports: StopSyncPorts, bookId: BookId): Promise<Outcome<void>> => {
  const kept = fromStore(await ports.invitations.list(bookId))
  if (!kept.ok) return kept
  const removed = await Promise.all(kept.value.map(async (invitation) => fromStore(await ports.invitations.remove(invitation.id))))
  return mapOk(collect(removed), () => undefined)
}

/** The copies of plays the owner's other devices play for the book, dropped: nothing would bring them up to date. */
export const withoutCopies = async (follow: FollowStorage, bookId: BookId): Promise<Outcome<void>> => {
  const followed = fromDraft(await follow.listFollowed())
  if (!followed.ok) return followed
  const dropped = await Promise.all(followed.value.filter((each) => each.line.bookId === bookId).map(async (each) => fromDraft(await follow.dropFollowed(each.id))))
  return mapOk(collect(dropped), () => undefined)
}

/**
 * Stop syncing a book on this device, or leave a book one was let into:
 * the book stays on the device as it stands, written to here alone from
 * then on, and nothing is asked of the relay. The line stays for whoever
 * else is on it — the owner's other devices, the people let in — and the
 * grants made on it with it; a person let in who leaves takes nothing out
 * of anyone's book. None of the book's commits counts as on a line any
 * more, so syncing it again begins a line of its own from the whole of
 * them.
 *
 * The link goes last, so a stop that ends part way leaves the book synced
 * as it was, to be stopped again.
 */
export const stopSync = async (ports: StopSyncPorts, bookId: BookId): Promise<Outcome<void>> => {
  const invitations = await withoutInvitations(ports, bookId)
  if (!invitations.ok) return invitations
  const copies = await withoutCopies(ports.follow, bookId)
  if (!copies.ok) return copies
  const unsent = fromHistory(await ports.history.unsend(bookId))
  if (!unsent.ok) return unsent
  return fromStore(await ports.links.remove(bookId))
}
