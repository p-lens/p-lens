import type { NewGrantDto } from "@p-lens/contracts/relay"

import type { BookId } from "../core/book/book"
import { Err, Ok, mapErr, mapOk, type Result } from "../core/result/result"
import { invitationCode, readInvitation, type InvitedRole } from "../core/sync/invitation"
import type { InvitationStore, InvitationStoreError, KeptInvitation } from "../sync/port/invitation-store"
import type { LinkStore, SyncLink } from "../sync/port/link-store"
import type { LineAccess, Relay } from "../sync/port/relay"
import { accessOf, type LineKeys, type Sealer } from "../sync/port/sealer"
import type { Outcome, SyncProblem } from "./errors"
import { linksProblemOf } from "./kept-links"

/** Everything letting people into a book reaches: its link to its line, the relay the line is on, the sealing, where the owner's device remembers them, and the moment and a fresh id for a grant. */
export interface InvitationPorts {
  readonly links: LinkStore
  readonly relay: Relay
  readonly sealer: Sealer
  readonly invitations: InvitationStore
  readonly now: () => string
  readonly newId: () => string
}

const problem = (found: SyncProblem): Outcome<never> => Err({ type: "sync", problem: found })

const fromSync = <T>(result: Result<T, SyncProblem>): Outcome<T> => mapErr(result, (found) => ({ type: "sync", problem: found }))

const fromStore = <T>(result: Result<T, InvitationStoreError>): Outcome<T> => mapErr(result, (error) => ({ type: "sync", problem: linksProblemOf(error) }))

/**
 * The link a book's owner lets people in by: one whose device holds the
 * line's secret. A book not synced has no line to let anyone into, and a
 * device that was itself let in holds an invitation, which makes no others.
 */
export const ownersLink = async (links: LinkStore, bookId: BookId): Promise<Outcome<SyncLink>> => {
  const link = await links.read(bookId)
  if (!link.ok) return problem(linksProblemOf(link.error))
  if (link.value === undefined) return problem({ type: "not-linked" })
  return readInvitation(link.value.secret) === undefined ? Ok(link.value) : problem({ type: "not-permitted" })
}

/** A line as its owner's device opens it: where it is, and its keys. */
interface Opened {
  readonly access: LineAccess
  readonly keys: LineKeys
}

/** The line a role is let into, opened by the owner: the book's inbox for a sender, the book's own for anyone else. */
const lineFor = async (ports: Pick<InvitationPorts, "sealer">, link: SyncLink, role: InvitedRole): Promise<Outcome<Opened>> =>
  mapOk(fromSync(await (role === "sender" ? ports.sealer.inboxKeysOf(link.secret) : ports.sealer.keysOf(link.secret))), (keys) => ({ access: accessOf(link.relayUrl, keys), keys }))

/**
 * Tell a line's relay of a grant. A book's inbox is on its relay only once
 * something was put there, and a relay grants nobody into a line it does
 * not have: so where the inbox is not there, it is begun — with one sealed
 * line that says nothing — and the grant made again.
 */
/** What the line an inbox is begun with goes by, ahead of its own id: it says nothing, and is no play sent. */
export const INBOX_OPENING = "inbox-opened-"

const granted = async (ports: InvitationPorts, line: Opened, role: InvitedRole, grant: NewGrantDto): Promise<Outcome<void>> => {
  const made = await ports.relay.grant(line.access, grant)
  if (made.ok) return Ok(undefined)
  if (made.error.type !== "line-missing" || role !== "sender") return problem(made.error)
  const opening = `${INBOX_OPENING}${ports.newId()}`
  const box = fromSync(await ports.sealer.seal(line.keys, opening, ""))
  if (!box.ok) return box
  const begun = await ports.relay.append(line.access, 0, [{ commitId: opening, box: box.value }])
  if (!begun.ok && begun.error.type !== "behind") return problem(begun.error)
  return mapOk(fromSync(await ports.relay.grant(line.access, grant)), () => undefined)
}

/** Whom this device's owner has let into a book, oldest first, as the device remembers them. */
export const invitationsOf = async (ports: Pick<InvitationPorts, "invitations">, bookId: BookId): Promise<Outcome<readonly KeptInvitation[]>> => fromStore(await ports.invitations.list(bookId))

/**
 * Let a person into a book: a token of their own made, the relay told of
 * it and of what it may do, and the person remembered on this device under
 * the name given, with the code to hand them. The relay is told first: a
 * code that opened nothing would be worse than none. The book's line must
 * be on its relay already, which its first sync sees to. A sender's
 * invitation carries the book's title, since a sender never sees the book.
 */
export const invite = async (ports: InvitationPorts, bookId: BookId, title: string, name: string, role: InvitedRole): Promise<Outcome<KeptInvitation>> => {
  const link = await ownersLink(ports.links, bookId)
  if (!link.ok) return link
  const line = await lineFor(ports, link.value, role)
  if (!line.ok) return line
  const invitation = fromSync(await ports.sealer.invitationOf(link.value.secret, role, title))
  if (!invitation.ok) return invitation
  const kept: KeptInvitation = { id: ports.newId(), bookId, name: name.trim(), role, invitedAt: ports.now(), code: invitationCode(invitation.value) }
  const told = await granted(ports, line.value, role, { id: kept.id, token: invitation.value.token, role })
  if (!told.ok) return told
  return mapOk(fromStore(await ports.invitations.write(kept)), () => kept)
}

/**
 * Take a person back out of a book: their grant deleted on the relay, so
 * their code opens nothing from then on, and the device's memory of them
 * let go. What they already took stays with them; nothing reaches them
 * after. A grant the relay no longer has is as good as taken away.
 */
export const uninvite = async (ports: InvitationPorts, invitation: KeptInvitation): Promise<Outcome<void>> => {
  const link = await ownersLink(ports.links, invitation.bookId)
  if (!link.ok) return link
  const line = await lineFor(ports, link.value, invitation.role)
  if (!line.ok) return line
  const revoked = await ports.relay.revoke(line.value.access, invitation.id)
  return revoked.ok || revoked.error.type === "line-missing" ? fromStore(await ports.invitations.remove(invitation.id)) : problem(revoked.error)
}

const grantOf = (kept: KeptInvitation): NewGrantDto | undefined => {
  const invitation = readInvitation(kept.code)
  return invitation === undefined ? undefined : { id: kept.id, token: invitation.token, role: kept.role }
}

/** The grants of one line put back where its relay lacks them: what the relay has is asked, and each person the device remembers and the relay does not is granted again. */
const restoredOn = async (ports: InvitationPorts, link: SyncLink, role: InvitedRole, kept: readonly KeptInvitation[]): Promise<Outcome<void>> => {
  if (kept.length === 0) return Ok(undefined)
  const line = await lineFor(ports, link, role)
  if (!line.ok) return line
  const known = await ports.relay.grants(line.value.access)
  if (!known.ok && known.error.type !== "line-missing") return problem(known.error)
  if (!known.ok && role !== "sender") return Ok(undefined)
  const here = known.ok ? known.value.map((grant) => grant.id) : []
  return kept
    .map(grantOf)
    .filter((grant): grant is NewGrantDto => grant !== undefined && !here.includes(grant.id))
    .reduce<Promise<Outcome<void>>>(async (so, grant) => ((done) => (done.ok ? granted(ports, line.value, role, grant) : done))(await so), Promise.resolve(Ok(undefined)))
}

/**
 * Put back the grants a relay has lost. A relay lets go of a line nobody
 * used for a while, its grants with it; the owner's device makes the line
 * again, and everyone it remembers letting in would be shut out of it. So
 * the owner's device says again whom it let in, wherever the relay no
 * longer knows. A book this device does not own, or let nobody into, asks
 * the relay nothing.
 */
export const restoreGrants = async (ports: InvitationPorts, bookId: BookId): Promise<Outcome<void>> => {
  const kept = fromStore(await ports.invitations.list(bookId))
  if (!kept.ok) return kept
  if (kept.value.length === 0) return Ok(undefined)
  const link = await ownersLink(ports.links, bookId)
  if (!link.ok) return link.error.type === "sync" && (link.error.problem.type === "not-linked" || link.error.problem.type === "not-permitted") ? Ok(undefined) : link
  const toBook = await restoredOn(ports, link.value, "editor", kept.value.filter((each) => each.role !== "sender"))
  return toBook.ok ? restoredOn(ports, link.value, "sender", kept.value.filter((each) => each.role === "sender")) : toBook
}

/**
 * Put back the grants of every book this device syncs, one book after
 * another, stopping at nothing: a book whose relay cannot be asked now is
 * asked again the next time, and the others are not kept waiting for it.
 * A device does this once each time the app is opened, after its first
 * round that goes through: by then a line its relay let go of has been
 * made again, and those let into it would otherwise stay shut out.
 */
export const restoreEveryGrant = async (ports: InvitationPorts): Promise<void> => {
  const links = await ports.links.list()
  await (links.ok ? links.value : []).reduce<Promise<unknown>>(async (so, link) => {
    await so
    return restoreGrants(ports, link.bookId)
  }, Promise.resolve())
}
