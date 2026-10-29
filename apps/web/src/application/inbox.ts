import type { BookId } from "../core/book/book"
import type { PlayDraft, Receipt } from "../core/live-play/draft"
import { Err, Ok, mapErr, mapOk, type Result } from "../core/result/result"
import { readInvitation } from "../core/sync/invitation"
import { readSentDraft, type SentDraft } from "../core/sync/sent-draft"
import type { ShownPlay } from "../core/play-line/entry"
import type { DraftStorage } from "../storage/port/draft-storage"
import type { FollowStorage } from "../storage/port/follow-storage"
import type { InvitationStore, KeptInvitation } from "../sync/port/invitation-store"
import type { LinkStore, SyncLink } from "../sync/port/link-store"
import type { LineAccess, Relay } from "../sync/port/relay"
import { accessOf, type LineKeys, type Sealer } from "../sync/port/sealer"
import type { ApplicationError, Outcome, SyncProblem } from "./errors"
import type { SyncFailure } from "./sync"
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
  readonly follow: FollowStorage
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

/** What a look at every inbox came to: the plays that arrived, and each book whose inbox could not be read now, for the round to say. */
export interface Received {
  readonly arrivals: Arrivals
  readonly failures: readonly SyncFailure[]
}

/** Whether a book has no inbox for this device to read: one it does not own, or does not sync from here. */
const isNoInbox = (error: ApplicationError): boolean => error.type === "sync" && (error.problem.type === "not-linked" || error.problem.type === "not-permitted")

/**
 * What became of one sending: taken in; found already in its play, here
 * or on the device of the owner's that holds it, and so dealt with as it
 * is; or left on the inbox until this device holds its play again.
 */
type Taking = "taken" | "had" | "deferred"

/** What a book's inbox has come to so far: how many arrived, and the ids of the sendings dealt with. */
interface Handling {
  readonly arrivals: Arrivals
  readonly handled: readonly string[]
}

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
const inBook = (bookId: BookId | undefined, sent: SentDraft, sender: KeptInvitation | undefined): PlayDraft => ({
  ...sent.play,
  ...(bookId === undefined ? {} : { bookId }),
  received: { sender: sender?.name, ...(sender === undefined ? {} : { senderId: sender.id }), log: sent.play.log, finished: sent.finished },
})

/** Whether a play this device received has been left as it arrived: not changed, and not recorded. Such a play is the sender's still, and a later sending of it takes its place. */
const untouched = (draft: PlayDraft): boolean => draft.received !== undefined && draft.recorded === undefined && draft.log === draft.received.log

/** Whether a play arrived as a sending: with its log, finished as it said. */
const arrivedAs = (receipt: Receipt | undefined, sent: SentDraft): boolean => receipt !== undefined && receipt.log === sent.play.log && JSON.stringify(receipt.finished) === JSON.stringify(sent.finished)

/** Whether a play already has a sending in it: arrived as it, or kept beside it as a later sending to choose. */
const hasSending = (play: PlayDraft | ShownPlay, sent: SentDraft): boolean => arrivedAs(play.received, sent) || arrivedAs(play.received?.again?.received, sent)

/** A sending of a play another of the owner's devices holds: had where that device took it in already, as this device's copy shows; else waiting. */
const heldElsewhere = async (ports: InboxPorts, sent: SentDraft): Promise<Outcome<Taking>> =>
  mapOk(fromDraft(await ports.follow.readFollowed(sent.play.id)), (copy) => (copy !== undefined && hasSending(copy.play, sent) ? "had" : "deferred"))

/**
 * Take one sent play in. A play the device does not have joins the day's
 * plays. One it has, left as it arrived, gives way to the later sending.
 * One it has and has changed, or recorded, is not written over: the later
 * sending is kept beside it for the person to choose between. A play of
 * the device's own under the same id is left alone, and so is one that
 * has the sending in it already — a device that held it took it in. One
 * another of the owner's devices holds, which this device only keeps a
 * copy of, is had where the copy shows the holder took the sending in;
 * otherwise it is left waiting on the inbox: the holder takes it in, and
 * so does this device once it holds the play again — taking it in here
 * would make the play held twice.
 */
const takenIn = async (ports: InboxPorts, bookId: BookId, sent: SentDraft, sender: KeptInvitation | undefined): Promise<Outcome<Taking>> => {
  const has = await ports.drafts.readDraft(sent.play.id)
  if (!has.ok && has.error.type === "held-elsewhere") return heldElsewhere(ports, sent)
  if (!has.ok) return mapOk(fromDraft(await ports.drafts.createDraft(inBook(bookId, sent, sender))), () => "taken" as const)
  const mine = has.value
  if (mine.received === undefined) return Ok("taken")
  if (hasSending(mine, sent)) return Ok("had")
  const arrived = inBook(mine.bookId, sent, sender)
  return mapOk(fromDraft(await ports.drafts.updateDraft(untouched(mine) ? arrived : { ...mine, received: { ...mine.received, again: arrived } }, mine.log)), () => "taken" as const)
}

const handled = async (links: LinkStore, link: SyncLink, ids: readonly string[]): Promise<Outcome<void>> =>
  mapErr(await links.write({ ...link, inboxHandled: [...(link.inboxHandled ?? []), ...ids] }), (error) => ({ type: "sync", problem: linksProblemOf(error) }) as const)

/**
 * The plays waiting in one book's inbox taken into the day's plays, each
 * counted as dealt with: how many there were, and how many could not be
 * read — counted once, and dealt with too, since reading them again would
 * read them no better. A play another of the owner's devices holds is not
 * dealt with here, and waits.
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
  const senderOf = (mark: string): KeptInvitation | undefined => senders.find((kept) => readInvitation(kept.code)?.token.slice(0, SENDER_MARK) === mark)
  const taken = await waiting.reduce<Promise<Outcome<Handling>>>(async (so, sealed) => {
    const count = await so
    if (!count.ok) return count
    const dealt = (arrived: Arrivals): Handling => ({ arrivals: together(count.value.arrivals, arrived), handled: [...count.value.handled, sealed.id] })
    const held = await sentIn(ports.sealer, keys.value, sealed)
    if (held.type === "opening") return Ok(dealt(NONE_ARRIVED))
    if (held.type === "unreadable") return Ok(dealt({ taken: 0, unreadable: 1 }))
    return mapOk(await takenIn(ports, link.bookId, held.sent, senderOf(held.sent.sender)), (taking) => {
      if (taking === "deferred") return count.value
      return dealt(taking === "taken" ? { taken: 1, unreadable: 0 } : NONE_ARRIVED)
    })
  }, Promise.resolve(Ok({ arrivals: NONE_ARRIVED, handled: [] })))
  return taken.ok ? mapOk(await handled(ports.links, link, taken.value.handled), () => taken.value.arrivals) : taken
}

/**
 * Take in every play sent to this device's books, into the day's plays,
 * each addressed to the book it was sent to: how many arrived. Only a
 * book this device owns and let senders into has an inbox to read; the
 * rest ask their relay nothing. One book's inbox that cannot be read now
 * does not keep the others waiting.
 */
export const receiveArrivals = async (ports: InboxPorts): Promise<Received> => {
  const links = await ports.links.list()
  if (!links.ok) return { arrivals: NONE_ARRIVED, failures: [{ bookId: undefined, error: { type: "sync", problem: linksProblemOf(links.error) } }] }
  return links.value.reduce<Promise<Received>>(async (so, each) => {
    const count = await so
    const link = await ownersLink(ports.links, each.bookId)
    const received = link.ok ? await receivedFor(ports, link.value) : link
    if (received.ok) return { arrivals: together(count.arrivals, received.value), failures: count.failures }
    return isNoInbox(received.error) ? count : { arrivals: count.arrivals, failures: [...count.failures, { bookId: each.bookId, error: received.error }] }
  }, Promise.resolve({ arrivals: NONE_ARRIVED, failures: [] }))
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
