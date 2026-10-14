import type { BookId } from "../core/book/book"
import type { PlayDraft } from "../core/live-play/draft"
import { Err, Ok, mapErr, mapOk, type Result } from "../core/result/result"
import { readInvitation } from "../core/sync/invitation"
import { readSentDraft, type SentDraft } from "../core/sync/sent-draft"
import type { DraftStorage } from "../storage/port/draft-storage"
import type { InvitationStore } from "../sync/port/invitation-store"
import type { LinkStore, SyncLink } from "../sync/port/link-store"
import type { LineAccess, Relay } from "../sync/port/relay"
import { accessOf, type LineKeys, type Sealer } from "../sync/port/sealer"
import type { Outcome, SyncProblem } from "./errors"
import { INBOX_OPENING, ownersLink } from "./invitations"
import { fromDraft } from "./lift"
import { SENDER_MARK } from "./sending"
import { linksProblemOf } from "./kept-links"

/** Everything taking in the plays sent to a device's books reaches. */
export interface InboxPorts {
  readonly links: LinkStore
  readonly relay: Relay
  readonly sealer: Sealer
  readonly invitations: InvitationStore
  readonly drafts: DraftStorage
}

const problem = (found: SyncProblem): Outcome<never> => Err({ type: "sync", problem: found })

const fromSync = <T>(result: Result<T, SyncProblem>): Outcome<T> => mapErr(result, (found) => ({ type: "sync", problem: found }))

interface Sealed {
  readonly id: string
  readonly box: string
}

/** Everything on an inbox past a place in it, every page of it; an inbox its relay does not have holds nothing. */
const everyBox = async (relay: Relay, access: LineAccess, after: number): Promise<Outcome<readonly Sealed[]>> => {
  const page = await relay.entriesAfter(access, after)
  if (!page.ok) return page.error.type === "line-missing" ? Ok([]) : problem(page.error)
  const boxes = page.value.entries.map((entry) => ({ id: entry.commitId, box: entry.box }))
  const reached = page.value.entries.at(-1)?.seq ?? page.value.head
  return reached >= page.value.head ? Ok(boxes) : mapOk(await everyBox(relay, access, reached), (rest) => [...boxes, ...rest])
}

/** What came of the plays waiting on inboxes: how many were taken in, and how many could not be read. */
export interface Arrivals {
  readonly taken: number
  readonly unreadable: number
}

const NONE_ARRIVED: Arrivals = { taken: 0, unreadable: 0 }

const together = (left: Arrivals, right: Arrivals): Arrivals => ({ taken: left.taken + right.taken, unreadable: left.unreadable + right.unreadable })

/** What a box holds: none for the line an inbox was begun with, a sent play, or one that does not open or read as one. */
const sentIn = async (sealer: Sealer, keys: LineKeys, sealed: Sealed): Promise<{ readonly type: "opening" } | { readonly type: "sent"; readonly sent: SentDraft } | { readonly type: "unreadable" }> => {
  if (sealed.id.startsWith(INBOX_OPENING)) return { type: "opening" }
  const text = await sealer.open(keys, sealed.id, sealed.box)
  const sent = text.ok ? readSentDraft(text.value) : undefined
  return sent === undefined ? { type: "unreadable" } : { type: "sent", sent }
}

/**
 * A sent play as a play of this device's day, said for the book it was
 * sent to. Nothing is written in the book: like a play of the device's
 * own, it reaches one when it is recorded, and its parlor's pool with it.
 */
const inBook = (bookId: BookId | undefined, sent: SentDraft, sender: string | undefined): PlayDraft => ({
  ...sent.play,
  ...(bookId === undefined ? {} : { bookId }),
  received: { sender, log: sent.play.log, finished: sent.finished },
})

/** Whether a play this device received has been left as it arrived: not changed, and not recorded. Such a play is the sender's still, and a later sending of it takes its place. */
const untouched = (draft: PlayDraft): boolean => draft.received !== undefined && draft.recorded === undefined && draft.log === draft.received.log

/**
 * Take one sent play in. A play the device does not have joins the day's
 * plays. One it has, left as it arrived, gives way to the later sending.
 * One it has and has changed, or recorded, is not written over: the later
 * sending is kept beside it for the person to choose between. A play of
 * the device's own under the same id is left alone.
 */
const takenIn = async (ports: InboxPorts, bookId: BookId, sent: SentDraft, sender: string | undefined): Promise<Outcome<void>> => {
  const has = await ports.drafts.readDraft(sent.play.id)
  if (!has.ok) return fromDraft(await ports.drafts.createDraft(inBook(bookId, sent, sender)))
  const mine = has.value
  if (mine.received === undefined) return Ok(undefined)
  const arrived = inBook(mine.bookId, sent, sender)
  return fromDraft(await ports.drafts.updateDraft(untouched(mine) ? arrived : { ...mine, received: { ...mine.received, again: arrived } }, mine.log))
}

const handled = async (links: LinkStore, link: SyncLink, ids: readonly string[]): Promise<Outcome<void>> =>
  mapErr(await links.write({ ...link, inboxHandled: [...(link.inboxHandled ?? []), ...ids] }), (error) => ({ type: "sync", problem: linksProblemOf(error) }) as const)

/**
 * The plays waiting in one book's inbox taken into the day's plays, each
 * counted as dealt with: how many there were, and how many could not be
 * read — counted once, and dealt with too, since reading them again would
 * read them no better.
 */
const receivedFor = async (ports: InboxPorts, link: SyncLink): Promise<Outcome<Arrivals>> => {
  const invitations = await ports.invitations.list(link.bookId)
  const senders = (invitations.ok ? invitations.value : []).filter((kept) => kept.role === "sender")
  if (senders.length === 0) return Ok(NONE_ARRIVED)
  const keys = fromSync(await ports.sealer.inboxKeysOf(link.secret))
  if (!keys.ok) return keys
  const boxes = await everyBox(ports.relay, accessOf(link.relayUrl, keys.value), 0)
  if (!boxes.ok) return boxes
  const waiting = boxes.value.filter((sealed) => !(link.inboxHandled ?? []).includes(sealed.id))
  if (waiting.length === 0) return Ok(NONE_ARRIVED)
  const nameOf = (mark: string): string | undefined => senders.find((kept) => readInvitation(kept.code)?.token.slice(0, SENDER_MARK) === mark)?.name
  const taken = await waiting.reduce<Promise<Outcome<Arrivals>>>(async (so, sealed) => {
    const count = await so
    if (!count.ok) return count
    const held = await sentIn(ports.sealer, keys.value, sealed)
    if (held.type === "opening") return count
    if (held.type === "unreadable") return Ok(together(count.value, { taken: 0, unreadable: 1 }))
    return mapOk(await takenIn(ports, link.bookId, held.sent, nameOf(held.sent.sender)), () => together(count.value, { taken: 1, unreadable: 0 }))
  }, Promise.resolve(Ok(NONE_ARRIVED)))
  return taken.ok ? mapOk(await handled(ports.links, link, waiting.map((sealed) => sealed.id)), () => taken.value) : taken
}

/**
 * Take in every play sent to this device's books, into the day's plays,
 * each addressed to the book it was sent to: how many arrived. Only a
 * book this device owns and let senders into has an inbox to read; the
 * rest ask their relay nothing. One book's inbox that cannot be read now
 * does not keep the others waiting.
 */
export const receiveArrivals = async (ports: InboxPorts): Promise<Arrivals> => {
  const links = await ports.links.list()
  return (links.ok ? links.value : []).reduce<Promise<Arrivals>>(async (so, each) => {
    const count = await so
    const link = await ownersLink(ports.links, each.bookId)
    const received = link.ok ? await receivedFor(ports, link.value) : link
    return received.ok ? together(count, received.value) : count
  }, Promise.resolve(NONE_ARRIVED))
}

/** Take the later sending of a play in place of the one this device changed: what was done to it here is given up. */
export const takeSentAgain = async (drafts: DraftStorage, draft: PlayDraft): Promise<Outcome<void>> =>
  draft.received?.again === undefined ? Ok(undefined) : fromDraft(await drafts.updateDraft(draft.received.again, draft.log))

/** Keep the play as this device has it, and let the later sending of it go. */
export const keepOwn = async (drafts: DraftStorage, draft: PlayDraft): Promise<Outcome<void>> => {
  if (draft.received?.again === undefined) return Ok(undefined)
  const { again: _again, ...received } = draft.received
  return fromDraft(await drafts.updateDraft({ ...draft, received }, draft.log))
}
