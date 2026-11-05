import type { BookId, Member } from "../../core/book/book"
import { Err, Ok, type Result } from "../../core/result/result"
import { toBase64Url } from "../core/bytes"
import { changeIdOf, stateDigestOf, type Change, type ChangeId } from "../core/book/change"
import { baseUnder, headsOf } from "../core/book/graph"
import { bookPartOf } from "../core/book/roster"
import { codeIn } from "../core/book/pasted-code"
import { readInvitationCode, readMailbox, type Mailbox } from "../core/book/sharing"
import { stateOf } from "../core/book/state"
import { takenOf } from "../core/book/taking"
import { readSyncCode, readTip, type Tip } from "../core/book/wire"
import { tagValues, type NostrEvent } from "../core/event"
import { KIND } from "../core/kinds"
import type { Keys } from "../port/keys"
import type { Connection } from "../port/relay"
import type { BookLink, Destination, HeldChange, LineAccess } from "../port/line-store"
import { mailboxAt, mailboxPlace } from "./book-sharing"
import { assembled, bookLineKeysOf, deviceName, openChangeEvent, seconds, type BookLineKeys, type BookSyncPorts, type BookSyncProblem } from "./book-sync"
import { readSince } from "./line-reading"

/** How far before the earliest base a tip names the line is read (PROTOCOL.md §5.4). */
const BEFORE_BASE = 3_600

/** The tips on a line, whoever wrote them, the latest of each address. */
const tipsOf = async (keys: Keys, line: BookLineKeys, events: readonly NostrEvent[]): Promise<ReadonlyMap<string, Tip>> => {
  const opened = await Promise.all(
    events
      .filter((event) => event.kind === KIND.tip)
      .map(async (event) => {
        const d = tagValues(event, "d")[0] ?? ""
        const sealed = await keys.openJson(line.sealKey, { kind: KIND.tip, v: line.v, d, pubkey: event.pubkey }, event.content)
        return { d, tip: sealed.ok ? readTip(sealed.value) : undefined }
      }),
  )
  return opened.reduce((found, { d, tip }) => (tip === undefined || (found.get(d)?.stamp ?? -1) >= tip.stamp ? found : new Map(found).set(d, tip)), new Map<string, Tip>())
}

/** What a line's events hold: every change they carry, those cut into parts put together, and the events that are no change of their own. */
const changesOf = async (keys: Keys, line: BookLineKeys, events: readonly NostrEvent[]): Promise<{ readonly changes: readonly HeldChange[]; readonly loose: readonly NostrEvent[] }> => {
  const opened = await Promise.all(events.map(async (event) => ({ event, opened: await openChangeEvent(keys, line, event) })))
  const loose = opened.flatMap(({ event, opened: each }) => (each.type === "loose" || (each.type === "message" && each.message.type === "manifest") ? [event] : []))
  const byId = new Map(loose.map((event) => [event.id, event]))
  const whole = opened.flatMap(({ event, opened: each }) => (each.type === "message" && each.message.type === "change" ? [{ change: each.message.change, createdAt: event.created_at }] : []))
  const parted = await Promise.all(
    opened.flatMap(({ event, opened: each }) => (each.type === "message" && each.message.type === "manifest" ? [assembled(keys, line, event, each.message, byId).then((change) => (change === undefined ? [] : [{ change, createdAt: event.created_at }]))] : [])),
  )
  return { changes: [...new Map([...whole, ...parted.flat()].map(({ change, createdAt }) => [changeIdOf(change), { id: changeIdOf(change), change, createdAt }])).values()], loose }
}

/** The head a joining device takes its book from: of the changes taken, the latest written, then the lowest id. The others are merged once the line is open, as on any device. */
const headToTake = (held: ReadonlyMap<ChangeId, Change>, owner: string): ChangeId | undefined =>
  headsOf(held, takenOf(held, owner, new Set(), undefined)).toSorted((one, other) => (held.get(other)?.at ?? 0) - (held.get(one)?.at ?? 0) || (one < other ? -1 : 1))[0]

/** What a mailbox says to the person invited, signed by the owner, the latest; none where there is none yet (PROTOCOL.md §4.4). */
const mailboxOf = async (keys: Keys, connection: Connection, invitation: Uint8Array, owner: string): Promise<Result<Mailbox | undefined, BookSyncProblem>> => {
  const at = await mailboxAt(keys, invitation)
  const events = await readSince(connection, { kinds: [KIND.mailbox], authors: [owner], "#v": [at.v], "#d": [at.d] })
  if (!events.ok) return Err({ type: "unreachable" })
  const opened = await Promise.all(events.value.filter((event) => event.pubkey === owner).map(async (event) => ((sealed) => (sealed.ok ? readMailbox(sealed.value) : undefined))(await keys.openJson(at.sealKey, mailboxPlace(at, owner), event.content))))
  return Ok(opened.reduce<Mailbox | undefined>((latest, each) => (each !== undefined && (latest === undefined || each.stamp > latest.stamp) ? each : latest), undefined))
}

/** Where a code leaves a device about to join a line: who it is there, the epoch, the relay. */
type LineJoining = Omit<BookLink, "bookId" | "head" | "mark" | "device" | "stamp" | "tipAt" | "floor">

/** What joining by a code came to: a book put on this device, or a book's inbox this device now sends plays to, by the book's title. */
export type Joined = { readonly type: "book"; readonly bookId: BookId } | { readonly type: "inbox"; readonly title: string }

/** What a code joins: a book's line, or — the code a sender was handed — a book's inbox to send plays to. */
type Joining = { readonly type: "line"; readonly line: LineJoining } | { readonly type: "inbox"; readonly destination: Destination }

/** What a code says of what it joins: a sync code a line at once; an invitation code what the mailbox it names says. */
const joiningOf = async (ports: BookSyncPorts, pasted: string, connection: (relay: string) => Connection): Promise<Result<Joining, BookSyncProblem>> => {
  const code = codeIn(pasted)
  const sync = readSyncCode(code)
  if (sync !== undefined) return Ok({ type: "line", line: { access: { role: "owner", sync: toBase64Url(sync.sync) }, epoch: toBase64Url(sync.epoch), epochNumber: 0, relay: sync.relay } })
  const invited = readInvitationCode(code)
  if (invited === undefined) return Err({ type: "not-a-code" })
  const mailbox = await mailboxOf(ports.keys, connection(invited.relay), invited.invitation, invited.owner)
  if (!mailbox.ok) return mailbox
  if (mailbox.value === undefined) return Err({ type: "nothing-on-line" })
  const invitation = toBase64Url(invited.invitation)
  switch (mailbox.value.type) {
    case "removed":
      return Err({ type: "removed" })
    case "sender":
      return Ok({
        type: "inbox",
        destination: { invitation, owner: invited.owner, relay: invited.relay, title: mailbox.value.title, inbox: mailbox.value.inbox, mailboxStamp: mailbox.value.stamp, removed: false, device: deviceName(ports.keys) },
      })
    case "member": {
      const access: LineAccess = { role: mailbox.value.role, invitation, owner: invited.owner, mailboxStamp: mailbox.value.stamp }
      return Ok({ type: "line", line: { access, epoch: toBase64Url(mailbox.value.secret), epochNumber: mailbox.value.epoch, relay: invited.relay } })
    }
  }
}

/** A book's inbox kept as one this device sends plays to; one it sends to already is left as it is. */
const adoptedDestination = async (ports: BookSyncPorts, destination: Destination): Promise<Result<Joined, BookSyncProblem>> => {
  const kept = await ports.lines.destinations()
  if (!kept.ok) return Err({ type: "kept", error: kept.error })
  if (kept.value.some((each) => each.invitation === destination.invitation && !each.removed)) return Err({ type: "book-here" })
  const put = await ports.lines.putDestination(destination)
  return put.ok ? Ok({ type: "inbox", title: destination.title }) : Err({ type: "kept", error: put.error })
}

/** How the device is in the book: the owner, or in the role the owner let them in as. */
const memberAs = (me: Member, access: LineAccess): Member => (access.role === "owner" ? me : { ...me, role: access.role })

/**
 * Put a book on this device from its line (PROTOCOL.md §5.7, §5.8): by the
 * sync code one of its owner's devices shows, or by the invitation code the
 * owner handed a person, whose mailbox gives the epoch's secret and their
 * role. Every tip read, the line from the earliest base they name, the book
 * taken as the latest head of the changes taken leaves it — if hledger
 * reads it — under the id it has on the other devices, in the role the code
 * gives, and the line kept as this device's from there. A book already here
 * is left as it is.
 */
export const joinByCode = async (ports: BookSyncPorts, code: string): Promise<Result<Joined, BookSyncProblem>> => {
  const opened: { connection: Connection | undefined } = { connection: undefined }
  const connectionTo = (relay: string): Connection => (opened.connection ??= ports.relays.connect(relay))
  const startedAt = seconds(ports)
  const read = await (async (): Promise<Result<{ readonly type: "line"; readonly joining: LineJoining; readonly changes: readonly HeldChange[]; readonly loose: readonly NostrEvent[] } | Extract<Joining, { readonly type: "inbox" }>, BookSyncProblem>> => {
    const joined = await joiningOf(ports, code, connectionTo)
    if (!joined.ok) return joined
    if (joined.value.type === "inbox") return Ok(joined.value)
    const joining = joined.value.line
    const connection = connectionTo(joining.relay)
    const keys = await bookLineKeysOf(ports.keys, joining)
    const tipEvents = await readSince(connection, { kinds: [KIND.tip], "#v": [keys.v] })
    if (!tipEvents.ok) return Err({ type: "unreachable" })
    const tips = [...(await tipsOf(ports.keys, keys, tipEvents.value)).values()]
    if (tips.length === 0) return Err({ type: "nothing-on-line" })
    const since = Math.max(0, Math.min(...tips.map((tip) => tip.base.createdAt)) - BEFORE_BASE)
    const events = await readSince(connection, { kinds: [KIND.bookChange], "#v": [keys.v], since })
    if (!events.ok) return Err({ type: "unreachable" })
    const found = await changesOf(ports.keys, keys, events.value)
    return Ok({ type: "line", joining, ...found })
  })()
  opened.connection?.close()
  if (!read.ok) return read
  if (read.value.type === "inbox") return adoptedDestination(ports, read.value.destination)
  const owner = (await bookLineKeysOf(ports.keys, read.value.joining)).owner
  const held = new Map(read.value.changes.map((each) => [each.id, each.change]))
  const head = headToTake(held, owner)
  const base = head === undefined ? undefined : baseUnder(held, head)
  const bookOf = base === undefined ? undefined : held.get(base)
  if (head === undefined || bookOf?.sort !== "base") return Err({ type: "nothing-on-line" })
  const state = stateOf(held, undefined, head)
  if (!state.ok) return Err({ type: "broken", problem: state.error })
  if (stateDigestOf(state.value) !== held.get(head)?.result) return Err({ type: "broken", problem: { type: "result-mismatch", id: head } })
  const bookId = bookOf.book as BookId
  const books = await ports.session.books()
  if (!books.ok) return Err({ type: "book", error: books.error })
  if (books.value.some((book) => book.id === bookId)) return Err({ type: "book-here" })
  const link: BookLink = { ...read.value.joining, bookId, floor: { type: "joined" }, device: deviceName(ports.keys), head, mark: startedAt, stamp: 0, tipAt: 0 }
  const settled = await ports.lines.settle({ link, changes: read.value.changes, shadow: state.value })
  if (!settled.ok) return Err({ type: "kept", error: settled.error })
  const loose = await ports.lines.keepLoose(bookId, read.value.loose)
  if (!loose.ok) {
    await ports.lines.forget(bookId)
    return Err({ type: "kept", error: loose.error })
  }
  const adopted = await ports.session.adoptBook({ book: { id: bookId, members: [memberAs(ports.me, link.access)] }, files: bookPartOf(state.value) })
  if (adopted.ok) return Ok({ type: "book", bookId })
  await ports.lines.forget(bookId)
  return Err({ type: "book", error: adopted.error })
}

