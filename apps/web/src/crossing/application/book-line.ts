import type { ApplicationError } from "../../application/errors"
import { activityLineOf, withActivity } from "../../core/activity/activity"
import type { BookId } from "../../core/book/book"
import { BOOK_FILES, type BookFiles } from "../../core/journal/layout"
import { titleOfMain } from "../../core/journal/title"
import { Err, Ok, type Result } from "../../core/result/result"
import { toBase64Url } from "../core/bytes"
import { changeIdOf, stateDigestOf, type Change, type ChangeId, type Merge } from "../core/book/change"
import { ancestryOf, baseUnder, descendsFrom, headsOf, mergeBaseOf, missingOf, sinceBase } from "../core/book/graph"
import { mergeStates, type FileConflict } from "../core/book/merge"
import { bookPartOf, epochNumberOf, isEditorIn, rosterOf, rosterText, ROSTER_FILE, stateOfBook, type InvitedRole, type Roster } from "../core/book/roster"
import { productOf, readMailbox, type Mailbox } from "../core/book/sharing"
import { patchesBetween, stateOf, type Known } from "../core/book/state"
import { onFloorOf, takenOf } from "../core/book/taking"
import { readTip, tipJson, type LineMessage, type Tip } from "../core/book/wire"
import { tagValues, type NostrEvent } from "../core/event"
import { NAMES } from "../core/keyring"
import { KIND } from "../core/kinds"
import type { Refusal } from "../core/messages"
import type { Place } from "../core/seal"
import type { SigningKey } from "../port/keys"
import type { BookLink, Floor, HeldChange } from "../port/line-store"
import type { Connection, ConnectionState, Subscription } from "../port/relay"
import { accessListEvent, mailboxAt, mailboxEvent, mailboxPlace, openedEpoch, sealedEpoch, sealedVault, sharedMembersOf, type MailboxAt, type SharedMember } from "./book-sharing"
import { assembled, baseOf, bookLineKeysOf, eventsOfChange, openChangeEvent, ownersKeysOf, seconds, secretOf, type BookLineKeys, type BookSyncPorts, type BookSyncProblem } from "./book-sync"
import { holdsAt, readSince } from "./line-reading"

/** How long the relay's word that it kept an event is waited for. */
const ANSWER_WAIT_MS = 10_000

/** How long what waits in the outbox is given to go as the line is let go of (PROTOCOL.md §11). */
const CLOSING_WAIT_MS = 3_000

/** How long the outbox waits to send again after the relay said it was sent too much too fast (PROTOCOL.md §11). */
const RATE_LIMITED_WAIT_MS = 15_000

/** How long after a write the book is looked at again, so that a run of writes goes as one change. */
const AFTER_WRITING_MS = 2_000

/** How far back a catch-up reads before the mark, and a live subscription before now (PROTOCOL.md §11). */
const CATCH_UP_SLACK = 3_600
const LIVE_SLACK = 30

/** When a base is due: so many changes, or so many bytes of patches, since the last (PROTOCOL.md §5.5). */
const BASE_AFTER = { changes: 300, bytes: 1_000_000 } as const

/**
 * Two heads that would not merge, as a person is shown them: the device's
 * own and the other, the state each leaves and the one they grew from, what
 * would not merge and every other file as it did — or that what they merge
 * to is no book hledger reads.
 */
export interface BookConflict {
  readonly mine: ChangeId
  readonly theirs: ChangeId
  readonly base: BookFiles
  readonly ours: BookFiles
  readonly others: BookFiles
  readonly files: readonly FileConflict[] | "unreadable"
  readonly merged: BookFiles
}

/** Where a book's line stands, as its screens are told: what waits on a person first, then what waits on the relay. */
export type LineStanding =
  | { readonly type: "opening" }
  | { readonly type: "synced" }
  | { readonly type: "sending"; readonly waiting: number }
  | { readonly type: "unreachable" }
  | { readonly type: "refused"; readonly refusal: Refusal }
  | { readonly type: "conflict"; readonly conflict: BookConflict }
  | { readonly type: "stopped"; readonly problem: BookSyncProblem }

export interface BookLineHandlers {
  readonly onStanding: (standing: LineStanding) => void
  /** The book was made a state from the line: what was read of it is read again. */
  readonly onBookChanged: () => void
  /** The book is no longer on the device: its line is let go of. */
  readonly onGone: () => void
  /** The owner took the person this device is let in as back out: the line is let go of, and the book stays as it stood. */
  readonly onRemoved: () => void
}

/** A book's line kept open while the page is in sight. */
export interface BookLine {
  /** The book was written on this device: it is put on the line a moment later. */
  readonly wrote: () => void
  /** A person's choice where two heads would not merge, as the files it comes to; refused where the conflict has moved since it was shown. */
  readonly settle: (files: BookFiles) => Promise<Result<void, BookSyncProblem | { readonly type: "moved" }>>
  /** The people the owner let into the book, as the vault names them: none on a device not the owner's. */
  readonly members: () => Promise<readonly SharedMember[]>
  /** Let a person into the book, on one of the owner's devices (PROTOCOL.md §5.8). */
  readonly invite: (name: string, role: InvitedRole) => Promise<Result<SharedMember, BookSyncProblem>>
  /** Take a person back out of the book, the book moving to a new epoch they are not told of. */
  readonly remove: (mailbox: string) => Promise<Result<void, BookSyncProblem>>
  /** Sends what waits, for a moment at most, and stops listening: the connection is its opener's to close. */
  readonly close: () => Promise<void>
}

/** What a line holds while it is open. */
interface Line {
  link: BookLink
  keys: BookLineKeys
  tipAddress: string | undefined
  shadow: BookFiles
  readonly held: Map<ChangeId, Change>
  readonly createdAt: Map<ChangeId, number>
  readonly loose: Map<string, NostrEvent>
  readonly outbox: Map<string, NostrEvent>
  readonly tips: Map<string, Tip>
  readonly unreadable: Set<ChangeId>
  taken: ReadonlySet<ChangeId>
  conflict: BookConflict | undefined
  problem: BookSyncProblem | undefined
  refusal: Refusal | undefined
  reach: ConnectionState
  tipSent: boolean
  flushing: boolean
  closed: boolean
  /** Moved to a new epoch in a turn: the new line is caught up with once the turn is done. */
  moved: boolean
  /** When the access list was last written, in seconds: the next is written later. */
  accessAt: number
  timer: ReturnType<typeof setTimeout> | undefined
  /** The outbox sent again, after the relay said it was sent too much too fast. */
  retry: ReturnType<typeof setTimeout> | undefined
  turn: Promise<void>
  listening: Subscription | undefined
}

/** Whether a relay will never take an event it refused: a mailbox the access list does not hold, which nothing later puts on it. */
const neverTaken = (event: NostrEvent, refusal: Refusal): boolean => event.kind === KIND.mailbox && refusal.type === "restricted" && refusal.reason === "other"

const tipPlace = (keys: BookLineKeys, d: string, pubkey: string): Place => ({ kind: KIND.tip, v: keys.v, d, pubkey })

/** Where a line stands, from what it holds. */
const standingOf = (line: Line): LineStanding => {
  if (line.problem !== undefined) return { type: "stopped", problem: line.problem }
  if (line.conflict !== undefined) return { type: "conflict", conflict: line.conflict }
  if (line.refusal !== undefined) return { type: "refused", refusal: line.refusal }
  if (line.reach.type === "failing") return { type: "unreachable" }
  if (line.reach.type !== "open" || line.link.floor.type === "awaiting") return { type: "opening" }
  return line.outbox.size > 0 ? { type: "sending", waiting: line.outbox.size } : { type: "synced" }
}

type Advanced = { readonly at: Known; readonly merges: readonly HeldChange[]; readonly conflict: BookConflict | undefined }

/** How making the book a state went: kept, written under meanwhile, not read by hledger, or the line stopped. */
type Folded = { readonly type: "kept" } | { readonly type: "changed-under" } | { readonly type: "unreadable"; readonly error: ApplicationError } | { readonly type: "stopped" }

/**
 * What the book on the device came to against its head: an edit of the
 * device's own; nothing; or a book the device may not write — a viewer's,
 * put back to its head, or one whose writer the roster does not list yet,
 * left as it is until it may be written.
 */
type Own = { readonly at: Known; readonly made: readonly HeldChange[]; readonly unwritten: "put-back" | "held" | undefined }

/**
 * Keeps a book on its line (PROTOCOL.md §5): every change and tip read at once
 * and as it comes, whoever wrote it, each change taken as the roster says;
 * the book made a merge of every head that merges, three ways; whatever the
 * book became on this device written as a change of its own by a device
 * that may write it, sealed, signed, kept in the outbox until the relay
 * keeps it; and the book moved to a new epoch as the owner's devices or the
 * person's mailbox say. On the owner's devices people are let in and taken
 * out here, in turn with everything else the line does.
 */
export const openBookLine = async (ports: BookSyncPorts, link: BookLink, connection: Connection, handlers: BookLineHandlers): Promise<Result<BookLine, BookSyncProblem>> => {
  const [changes, shadow, outbox, loose] = await Promise.all([ports.lines.changes(link.bookId), ports.lines.shadow(link.bookId), ports.lines.outbox(link.bookId), ports.lines.loose(link.bookId)])
  if (!changes.ok) return Err({ type: "kept", error: changes.error })
  if (!shadow.ok) return Err({ type: "kept", error: shadow.error })
  if (!outbox.ok) return Err({ type: "kept", error: outbox.error })
  if (!loose.ok) return Err({ type: "kept", error: loose.error })
  const owners = link.access.role === "owner" ? await ownersKeysOf(ports.keys, link.access.sync) : undefined
  const mailbox: MailboxAt | undefined = link.access.role === "owner" ? undefined : await mailboxAt(ports.keys, secretOf(link.access.invitation))
  const tipAddressFor = (keys: BookLineKeys): Promise<string | undefined> => (keys.signer === undefined ? Promise.resolve(undefined) : ports.keys.address(keys.epoch, NAMES.tip(keys.signer.pubkey, link.device)))
  const keys = await bookLineKeysOf(ports.keys, link)
  const line: Line = {
    link,
    keys,
    tipAddress: await tipAddressFor(keys),
    shadow: shadow.value,
    held: new Map(changes.value.map((each) => [each.id, each.change])),
    createdAt: new Map(changes.value.map((each) => [each.id, each.createdAt])),
    loose: new Map(loose.value.map((event) => [event.id, event])),
    outbox: new Map(outbox.value.map((event) => [event.id, event])),
    tips: new Map(),
    unreadable: new Set(),
    taken: new Set(),
    conflict: undefined,
    problem: undefined,
    refusal: undefined,
    reach: connection.state(),
    tipSent: false,
    flushing: false,
    closed: false,
    moved: false,
    accessAt: 0,
    timer: undefined,
    retry: undefined,
    turn: Promise.resolve(),
    listening: undefined,
  }
  const bookId: BookId = link.bookId

  const told = (): void => handlers.onStanding(standingOf(line))

  const stop = (problem: BookSyncProblem): void => {
    line.problem = problem
    told()
  }

  /** Work done one piece at a time, so that nothing the line holds is changed by two at once. */
  const inTurn = (work: () => Promise<void>): Promise<void> => {
    line.turn = line.turn.then(() => (line.closed || line.problem !== undefined ? undefined : work())).catch(() => undefined)
    return line.turn
  }

  /** An event let go of from the outbox: sent, or never to be taken. */
  const letGo = async (event: NostrEvent): Promise<void> => {
    line.outbox.delete(event.id)
    await ports.lines.sent(bookId, [event.id])
  }

  /**
   * The outbox sent in order, as far as the relay takes it. One event
   * refused stops nothing after it but where the relay asks for time: it
   * stays to be sent again at the next flush, and the line says it was
   * refused. A mailbox refused as one the access list does not hold is let
   * go of instead (`neverTaken`), since nothing later makes the relay take
   * it; kept, it was sent again and refused for ever.
   */
  const flush = async (): Promise<void> => {
    if (line.flushing || line.reach.type !== "open") return
    line.flushing = true
    const pass: { refusal: Refusal | undefined; through: boolean } = { refusal: undefined, through: true }
    for (const event of [...line.outbox.values()]) {
      const answer = await connection.publish(event, ANSWER_WAIT_MS)
      if (!answer.ok) {
        pass.through = false
        break
      }
      if (answer.value.type === "refused" && answer.value.refusal.type === "rate-limited") {
        pass.refusal = answer.value.refusal
        flushLater()
        break
      }
      if (answer.value.type === "refused" && !neverTaken(event, answer.value.refusal)) pass.refusal = answer.value.refusal
      else await letGo(event)
    }
    if (pass.through || pass.refusal !== undefined) line.refusal = pass.refusal
    line.flushing = false
    told()
  }

  const flushLater = (): void => {
    clearTimeout(line.retry)
    line.retry = line.closed ? undefined : setTimeout(() => void flush(), RATE_LIMITED_WAIT_MS)
  }

  /** Events put in the outbox, after whatever waits there already, and sent as far as the relay takes them. */
  const queued = async (events: readonly NostrEvent[]): Promise<boolean> => {
    const kept = await ports.lines.queue(bookId, events)
    if (!kept.ok) {
      stop({ type: "kept", error: kept.error })
      return false
    }
    events.forEach((event) => line.outbox.set(event.id, event))
    await flush()
    return true
  }

  const sent = async (made: readonly HeldChange[], signer: SigningKey | undefined): Promise<void> => {
    if (signer === undefined || made.length === 0) return
    const events = (await Promise.all(made.map((each) => eventsOfChange(ports.keys, line.keys, signer, each.change, each.createdAt)))).flatMap((each) => (each.ok ? each.value : []))
    await queued(events)
  }

  /** The roster of the device's head: who may write, and the epoch. */
  const rosterHere = (): Roster | "unreadable" => rosterOf(line.shadow[ROSTER_FILE])

  /** The changes a head may be: those taken (PROTOCOL.md §5.6), on the epoch's floor where the device moved to one. */
  const usable = (): ReadonlySet<ChangeId> => {
    const trusted = new Set([...line.taken, ...ancestryOf(line.held, line.link.head)])
    line.taken = takenOf(line.held, line.keys.owner, trusted, { id: line.link.head, files: line.shadow })
    return line.link.floor.type === "at" ? onFloorOf(line.held, line.taken, line.link.floor.id) : line.taken
  }

  const tipOf = (among: ReadonlySet<ChangeId>): Tip | undefined => {
    const heads = headsOf(line.held, among)
    const base = baseUnder(line.held, line.link.head)
    const createdAt = base === undefined ? undefined : line.createdAt.get(base)
    return base === undefined || createdAt === undefined || heads.length === 0 ? undefined : { heads, base: { id: base, createdAt }, stamp: line.link.stamp + 1 }
  }

  const sendTip = async (): Promise<void> => {
    const [signer, d] = [line.keys.signer, line.tipAddress]
    const tip = signer === undefined || d === undefined || line.link.floor.type === "awaiting" ? undefined : tipOf(usable())
    if (tip === undefined || signer === undefined || d === undefined || line.reach.type !== "open") return
    const createdAt = Math.max(seconds(ports), line.link.tipAt + 1)
    const sealed = await ports.keys.sealJson(line.keys.sealKey, tipPlace(line.keys, d, signer.pubkey), tipJson(tip))
    if (!sealed.ok) return
    const event = ports.keys.sign(signer, { created_at: createdAt, kind: KIND.tip, tags: [["v", line.keys.v], ["d", d]], content: sealed.value })
    line.link = { ...line.link, stamp: tip.stamp, tipAt: createdAt }
    await ports.lines.putLink(line.link)
    const answer = await connection.publish(event, ANSWER_WAIT_MS)
    line.tipSent = answer.ok && answer.value.type === "kept"
  }

  /** The state of a change, worked from the book's own, and held to the digest the change says it leaves. */
  const stateAt = (from: Known, id: ChangeId): Result<BookFiles, BookSyncProblem> => {
    const files = stateOf(line.held, from, id)
    if (!files.ok) return Err({ type: "broken", problem: files.error })
    return stateDigestOf(files.value) === line.held.get(id)?.result ? files : Err({ type: "broken", problem: { type: "result-mismatch", id } })
  }

  const kept = (id: ChangeId, change: Change, createdAt: number): HeldChange => {
    line.held.set(id, change)
    line.createdAt.set(id, createdAt)
    return { id, change, createdAt }
  }

  /** Two heads merged three ways (PROTOCOL.md §5.3), as any device merging them would merge them; or the conflict a person is to settle. */
  const merged = (mine: Known, theirs: ChangeId): Result<{ readonly at: Known; readonly merge: HeldChange } | { readonly conflict: BookConflict }, BookSyncProblem> => {
    const others = stateAt(mine, theirs)
    if (!others.ok) return others
    const from = mergeBaseOf(line.held, mine.id, theirs)
    const base = from === undefined ? Ok({}) : stateAt(mine, from)
    if (!base.ok) return base
    const [first, second] = [mine.id, theirs].toSorted() as [ChangeId, ChangeId]
    const [firstFiles, secondFiles] = first === mine.id ? [mine.files, others.value] : [others.value, mine.files]
    const made = mergeStates(base.value, firstFiles, secondFiles)
    if (!made.ok) return Ok({ conflict: { mine: mine.id, theirs, base: base.value, ours: mine.files, others: others.value, files: made.error.files, merged: made.error.merged } })
    const patches = patchesBetween(firstFiles, made.value)
    if (!patches.ok) return Err({ type: "broken", problem: patches.error })
    const merge: Merge = { sort: "merge", parents: [first, second], writer: "", at: Math.max(line.held.get(first)?.at ?? 0, line.held.get(second)?.at ?? 0), patches: patches.value, result: stateDigestOf(made.value) }
    const id = changeIdOf(merge)
    return Ok({ at: { id, files: made.value }, merge: kept(id, merge, seconds(ports)) })
  }

  /** The device's head brought up to every head it may take: each it is behind taken, each beside it merged, and the first that will not merge set aside for a person. */
  const advanced = (from: Known, among: ReadonlySet<ChangeId>): Result<Advanced, BookSyncProblem> =>
    headsOf(line.held, among).reduce<Result<Advanced, BookSyncProblem>>((so, head) => {
      if (!so.ok || head === so.value.at.id || descendsFrom(line.held, so.value.at.id, head)) return so
      if (descendsFrom(line.held, head, so.value.at.id)) {
        const files = stateAt(so.value.at, head)
        return files.ok ? Ok({ ...so.value, at: { id: head, files: files.value } }) : files
      }
      const made = merged(so.value.at, head)
      if (!made.ok) return made
      if ("conflict" in made.value) return Ok({ ...so.value, conflict: so.value.conflict ?? made.value.conflict })
      return Ok({ at: made.value.at, merges: [...so.value.merges, made.value.merge], conflict: so.value.conflict })
    }, Ok({ at: from, merges: [], conflict: undefined }))

  /**
   * What the device's head and another's come to when hledger cannot read
   * it, as a conflict a person settles by taking one side whole: the other
   * side is the first head beside the device's own, which every device holds.
   */
  const unreadableConflict = (mine: Known, target: Known, among: ReadonlySet<ChangeId>): Result<BookConflict, BookSyncProblem> => {
    const theirs = headsOf(line.held, among).find((head) => head !== mine.id && !descendsFrom(line.held, mine.id, head)) ?? target.id
    const others = stateAt(mine, theirs)
    return others.ok ? Ok({ mine: mine.id, theirs, base: mine.files, ours: mine.files, others: others.value, files: "unreadable", merged: target.files }) : others
  }

  /** Whether this device may write a change on a state: the owner's may; an editor's while that state's roster lists them. */
  const mayWriteOn = (files: BookFiles): SigningKey | undefined => {
    const signer = line.keys.signer
    if (signer === undefined || signer.pubkey === line.keys.owner) return signer
    const roster = rosterOf(files[ROSTER_FILE])
    return roster !== "unreadable" && isEditorIn(roster, signer.pubkey) ? signer : undefined
  }

  /** The book's own writes since its head, as an edit on it: compared by digest, however the book came to differ (PROTOCOL.md §5.2). */
  const ownEdit = (book: BookFiles): Result<Own, BookSyncProblem> => {
    const head: Known = { id: line.link.head, files: line.shadow }
    const files = stateOfBook(book, line.shadow)
    if (stateDigestOf(files) === stateDigestOf(line.shadow)) return Ok({ at: head, made: [], unwritten: undefined })
    const signer = mayWriteOn(line.shadow)
    if (signer === undefined) return Ok({ at: head, made: [], unwritten: line.keys.signer === undefined ? "put-back" : "held" })
    const patches = patchesBetween(line.shadow, files)
    if (!patches.ok) return Err(patches.error.type === "file-removed" ? { type: "file-removed", path: patches.error.path } : { type: "broken", problem: patches.error })
    const now = seconds(ports)
    const edit: Change = { sort: "edit", parents: [head.id], writer: signer.pubkey, at: now, patches: patches.value, result: stateDigestOf(files) }
    const id = changeIdOf(edit)
    return Ok({ at: { id, files }, made: [kept(id, edit, now)], unwritten: undefined })
  }

  /** What the line keeps once the book is a state, and what goes out of it. */
  const settled = async (at: Known, made: readonly HeldChange[], floor: Floor = line.link.floor): Promise<boolean> => {
    const keptThere = await ports.lines.settle({ link: { ...line.link, head: at.id, floor }, changes: made, shadow: at.files })
    if (!keptThere.ok) {
      stop({ type: "kept", error: keptThere.error })
      return false
    }
    line.link = { ...line.link, head: at.id, floor }
    line.shadow = at.files
    await sent(made, line.keys.signer)
    return true
  }

  /** A new base, where one is due on an owner's device and nothing is in conflict: the book whole again, on the head, so that a device joining reads from here. */
  const baseIfDue = async (): Promise<void> => {
    const since = sinceBase(line.held, line.link.head)
    if (owners === undefined || line.conflict !== undefined || (since.changes < BASE_AFTER.changes && since.bytes < BASE_AFTER.bytes)) return
    await newBase(owners.owner)
  }

  const newBase = async (owner: SigningKey): Promise<void> => {
    const now = seconds(ports)
    const base = baseOf(bookId, line.shadow, owner.pubkey, now, [line.link.head])
    const id = changeIdOf(base)
    await settled({ id, files: line.shadow }, [kept(id, base, now)])
  }

  /**
   * A new base, where the relay no longer holds the one the head is on — it
   * was emptied, or the line moved to another — on an owner's device with
   * nothing waiting to be sent and nothing in conflict: what a device joining
   * reads from is there again (PROTOCOL.md §5.4).
   */
  const baseIfLost = async (): Promise<void> => {
    const base = baseUnder(line.held, line.link.head)
    const createdAt = base === undefined ? undefined : line.createdAt.get(base)
    if (owners === undefined || createdAt === undefined || line.outbox.size > 0 || line.conflict !== undefined || line.link.floor.type === "awaiting") return
    const held = await holdsAt(connection, { kinds: [KIND.bookChange], "#v": [line.keys.v] }, createdAt)
    if (!held.ok || held.value) return
    await inTurn(async () => {
      if (line.conflict === undefined && line.outbox.size === 0 && baseUnder(line.held, line.link.head) === base) await newBase(owners.owner)
    })
  }

  /**
   * The book made a state the line's changes come to, if hledger reads it and
   * nothing was written under it meanwhile: the line keeps that state, and
   * the changes that came to it go out, only once the book holds it.
   */
  const folded = async (book: BookFiles, at: Known, made: readonly HeldChange[], floor: Floor): Promise<Folded> => {
    const outcome: { value: "kept" | "changed-under" | "stopped" } = { value: "stopped" }
    const done = await ports.session.fold(bookId, async (now) => {
      if (stateDigestOf(now.files) !== stateDigestOf(book)) {
        outcome.value = "changed-under"
        return Ok(undefined)
      }
      return Ok({
        files: bookPartOf(at.files),
        settle: async () => {
          outcome.value = (await settled(at, made, floor)) ? "kept" : "stopped"
          return Ok(undefined)
        },
      })
    })
    if (!done.ok && done.error.type === "journal-rejected") return { type: "unreadable", error: done.error }
    if (!done.ok) {
      stop({ type: "book", error: done.error })
      return { type: "stopped" }
    }
    return { type: outcome.value }
  }

  /** The base read off the new line that an epoch begins at: the owner's, taken, its roster at the device's epoch, the earliest made. */
  const floorOf = (): ChangeId | undefined =>
    [...usable()]
      .filter((id) => ((change) => change?.sort === "base" && ((roster) => roster !== "unreadable" && epochNumberOf(roster) === line.link.epochNumber)(rosterOf(change.files[ROSTER_FILE])))(line.held.get(id)))
      .toSorted((one, other) => (line.createdAt.get(one) ?? 0) - (line.createdAt.get(other) ?? 0) || (one < other ? -1 : 1))[0]

  /**
   * The book carried onto a new epoch's floor (PROTOCOL.md §5.8): the device's
   * book and the floor merged from where they parted, what the book has
   * that the floor lacks written as an edit on the floor by a device that
   * may write it, and the book made that state; a conflict put to a person,
   * whose choice is written on the floor.
   */
  const rebased = async (book: BookFiles): Promise<void> => {
    const floor = floorOf()
    if (floor === undefined) return told()
    const head: Known = { id: line.link.head, files: line.shadow }
    const [others, from] = [stateAt(head, floor), mergeBaseOf(line.held, line.link.head, floor)]
    if (!others.ok) return stop(others.error)
    const base = from === undefined ? Ok({}) : stateAt(head, from)
    if (!base.ok) return stop(base.error)
    const ours = stateOfBook(book, line.shadow)
    const made = mergeStates(base.value, others.value, ours)
    if (!made.ok) {
      line.conflict = { mine: line.link.head, theirs: floor, base: base.value, ours, others: others.value, files: made.error.files, merged: made.error.merged }
      return told()
    }
    line.conflict = undefined
    const edit = onFloor(floor, others.value, made.value)
    if (!edit.ok) return stop(edit.error)
    const outcome = await folded(book, edit.value.at, edit.value.made, { type: "at", id: floor })
    if (outcome.type === "changed-under") return reconcileLater(0)
    if (outcome.type === "unreadable") return stop({ type: "book", error: outcome.error })
    if (outcome.type === "kept") handlers.onBookChanged()
    told()
  }

  /** What is carried onto a floor: an edit on it where there is anything to carry and this device may write it, or the floor itself. */
  const onFloor = (floor: ChangeId, floorFiles: BookFiles, files: BookFiles): Result<{ readonly at: Known; readonly made: readonly HeldChange[] }, BookSyncProblem> => {
    const signer = mayWriteOn(floorFiles)
    if (stateDigestOf(files) === stateDigestOf(floorFiles) || signer === undefined) return Ok({ at: { id: floor, files: floorFiles }, made: [] })
    const patches = patchesBetween(floorFiles, files)
    if (!patches.ok) return Err(patches.error.type === "file-removed" ? { type: "file-removed", path: patches.error.path } : { type: "broken", problem: patches.error })
    const now = seconds(ports)
    const edit: Change = { sort: "edit", parents: [floor], writer: signer.pubkey, at: now, patches: patches.value, result: stateDigestOf(files) }
    const id = changeIdOf(edit)
    return Ok({ at: { id, files }, made: [kept(id, edit, now)] })
  }

  /** On the owner's devices: the epoch the head's roster names, moved to where it is not the one the device is at. */
  const ownersEpoch = async (): Promise<void> => {
    const roster = rosterHere()
    if (owners === undefined || roster === "unreadable" || roster.epoch === undefined) return
    const secret = await openedEpoch(ports.keys, owners.vault, owners.owner.pubkey, roster)
    if (secret === undefined) return
    if (toBase64Url(secret) !== line.link.epoch) return moveTo(secret, roster.epoch.n, { type: "awaiting" }, true)
    if (line.link.epochNumber !== roster.epoch.n) {
      line.link = { ...line.link, epochNumber: roster.epoch.n }
      await ports.lines.putLink(line.link)
    }
  }

  const reconcile = (): Promise<void> =>
    inTurn(async () => {
      const stored = await ports.session.stored(bookId)
      if (!stored.ok) return stored.error.type === "storage" && stored.error.error.type === "book-missing" ? handlers.onGone() : stop({ type: "book", error: stored.error })
      if (line.link.floor.type === "awaiting") return rebased(stored.value.files)
      const among = usable()
      const own = ownEdit(stored.value.files)
      if (!own.ok) return stop(own.error)
      if (own.value.unwritten === "held") return told()
      const ahead = advanced(own.value.at, among)
      if (!ahead.ok) return stop(ahead.error)
      const target = ahead.value.at
      const unreadable = line.unreadable.has(target.id) ? unreadableConflict(own.value.at, target, among) : undefined
      if (unreadable !== undefined && !unreadable.ok) return stop(unreadable.error)
      line.conflict = ahead.value.conflict ?? unreadable?.value
      if ((target.id === own.value.at.id && own.value.unwritten === undefined) || unreadable !== undefined) {
        if (own.value.made.length > 0 && !(await settled(own.value.at, own.value.made))) return
        await ownersEpoch()
        return told()
      }
      const outcome = await folded(stored.value.files, target, [...own.value.made, ...ahead.value.merges], line.link.floor)
      if (outcome.type === "unreadable") {
        line.unreadable.add(target.id)
        return reconcileLater(0)
      }
      if (outcome.type === "changed-under") return reconcileLater(0)
      if (outcome.type === "stopped") return
      handlers.onBookChanged()
      await ownersEpoch()
      await baseIfDue()
      told()
    })

  /** After a turn that moved the book to a new epoch: the new line caught up with. */
  const afterTurn = (): Promise<void> => {
    if (!line.moved) return Promise.resolve()
    line.moved = false
    return catchUp()
  }

  const reconcileLater = (delay: number): void => {
    clearTimeout(line.timer)
    line.timer = setTimeout(() => void reconcile().then(afterTurn).then(() => (line.tipSent ? undefined : sendTip())), delay)
  }

  /** A change taken off the line, once: what the roster lets be taken is worked out as the book is reconciled. */
  const taken = async (change: Change, createdAt: number): Promise<void> => {
    const id = changeIdOf(change)
    if (line.held.has(id)) return
    const received = await ports.lines.receive(bookId, [kept(id, change, createdAt)])
    if (!received.ok) return stop({ type: "kept", error: received.error })
    line.tipSent = false
    reconcileLater(0)
  }

  /** Every manifest held whose parts are all held, put together and taken; the parts and the manifest let go of after. */
  const assembleLoose = async (): Promise<void> => {
    const manifests = (await Promise.all([...line.loose.values()].map(async (event) => ({ event, opened: await openChangeEvent(ports.keys, line.keys, event) })))).flatMap(({ event, opened }) =>
      opened.type === "message" && opened.message.type === "manifest" ? [{ event, manifest: opened.message }] : [],
    )
    for (const { event, manifest } of manifests) {
      const change = await assembled(ports.keys, line.keys, event, manifest, line.loose)
      if (change === undefined) continue
      await taken(change, event.created_at)
      const used = [event.id, ...manifest.parts]
      used.forEach((id) => line.loose.delete(id))
      await ports.lines.dropLoose(bookId, used)
    }
  }

  const keptLoose = async (event: NostrEvent): Promise<void> => {
    if (line.loose.has(event.id)) return
    line.loose.set(event.id, event)
    const keptThere = await ports.lines.keepLoose(bookId, [event])
    if (!keptThere.ok) return stop({ type: "kept", error: keptThere.error })
    await assembleLoose()
  }

  const onMessage = async (event: NostrEvent, message: LineMessage): Promise<void> => (message.type === "change" ? taken(message.change, event.created_at) : keptLoose(event))

  const onTip = async (event: NostrEvent): Promise<void> => {
    const d = tagValues(event, "d")[0]
    if (d === undefined || tagValues(event, "v")[0] !== line.keys.v) return
    const opened = await ports.keys.openJson(line.keys.sealKey, tipPlace(line.keys, d, event.pubkey), event.content)
    const tip = opened.ok ? readTip(opened.value) : undefined
    if (tip === undefined || (line.tips.get(d)?.stamp ?? -1) >= tip.stamp) return
    line.tips.set(d, tip)
  }

  const onEvent = async (event: NostrEvent): Promise<void> => {
    if (event.kind === KIND.tip) return onTip(event)
    const opened = await openChangeEvent(ports.keys, line.keys, event)
    if (opened.type === "message") return onMessage(event, opened.message)
    if (opened.type === "loose") return keptLoose(event)
  }

  /** The book's line listened to as it is written, from a moment ago: the epoch's line, listened to again when the book moves to another. */
  const listen = (): void => {
    line.listening?.close()
    line.listening = connection.subscribe(() => [{ kinds: [KIND.bookChange, KIND.tip], "#v": [line.keys.v], since: seconds(ports) - LIVE_SLACK }], { onEvent: (event) => void onEvent(event) })
  }

  /**
   * The book moved to another epoch (PROTOCOL.md §5.8): its secret kept, the
   * line's keys drawn again, what waited for the old line let go of — unless
   * the device moving it still owes the old line its last change — and the
   * new line listened to, caught up with once the turn is done.
   */
  const moveTo = async (secret: Uint8Array, n: number, floor: Floor, dropStale: boolean): Promise<void> => {
    const oldLine = line.keys.v
    line.link = { ...line.link, epoch: toBase64Url(secret), epochNumber: n, floor }
    await ports.lines.putLink(line.link)
    line.keys = await bookLineKeysOf(ports.keys, line.link)
    line.tipAddress = await tipAddressFor(line.keys)
    const stale = dropStale ? [...line.outbox.values()].filter((event) => (event.kind === KIND.bookChange || event.kind === KIND.tip) && tagValues(event, "v")[0] === oldLine).map((event) => event.id) : []
    stale.forEach((id) => line.outbox.delete(id))
    if (stale.length > 0) await ports.lines.sent(bookId, stale)
    line.tips.clear()
    line.tipSent = false
    line.conflict = undefined
    line.moved = true
    listen()
  }

  /** What the person's mailbox says, the latest kept: taken out, the line let go of; a new epoch, the book moved to it. */
  const onMailbox = async (said: Mailbox): Promise<void> => {
    const access = line.link.access
    if (access.role === "owner" || said.type === "sender" || said.stamp <= access.mailboxStamp) return
    line.link = { ...line.link, access: { ...access, mailboxStamp: said.stamp } }
    await ports.lines.putLink(line.link)
    if (said.type === "removed") {
      line.closed = true
      return handlers.onRemoved()
    }
    if (toBase64Url(said.secret) !== line.link.epoch) await moveTo(said.secret, said.epoch, { type: "awaiting" }, true)
  }

  const openMailbox = async (event: NostrEvent): Promise<Mailbox | undefined> => {
    if (mailbox === undefined || event.kind !== KIND.mailbox || event.pubkey !== line.keys.owner) return undefined
    const opened = await ports.keys.openJson(mailbox.sealKey, mailboxPlace(mailbox, line.keys.owner), event.content)
    return opened.ok ? readMailbox(opened.value) : undefined
  }

  const mailboxFilter = (at: MailboxAt) => ({ kinds: [KIND.mailbox], authors: [line.keys.owner], "#v": [at.v], "#d": [at.d] })

  /** Whether a change the device ought to hold is not held: a parent, or a head another device names. */
  const lacking = (): boolean => missingOf(line.held).length > 0 || [...line.tips.values()].some((tip) => tip.heads.some((head) => !line.held.has(head)))

  /**
   * The person's mailbox first, where the device is let in; then every tip,
   * then the line since the mark, then — where a change is lacking — the line
   * again from the earliest base a tip names (PROTOCOL.md §5.4, §11).
   */
  const catchUp = async (): Promise<void> => {
    const startedAt = seconds(ports)
    if (mailbox !== undefined) {
      const said = await readSince(connection, mailboxFilter(mailbox))
      if (!said.ok) return
      const opened = (await Promise.all(said.value.map(openMailbox))).filter((each): each is Mailbox => each !== undefined)
      const latest = opened.reduce<Mailbox | undefined>((found, each) => (found === undefined || each.stamp > found.stamp ? each : found), undefined)
      if (latest !== undefined) await inTurn(() => onMailbox(latest))
      if (line.closed) return
    }
    line.moved = false
    const v = line.keys.v
    const tips = await readSince(connection, { kinds: [KIND.tip], "#v": [v] })
    if (!tips.ok) return
    await Promise.all(tips.value.map(onTip))
    const since = await readSince(connection, { kinds: [KIND.bookChange], "#v": [v], since: Math.max(0, line.link.mark - CATCH_UP_SLACK) })
    if (!since.ok) return
    for (const event of since.value.toSorted((one, other) => one.created_at - other.created_at)) await onEvent(event)
    if (lacking()) {
      const earliest = Math.min(...[...line.tips.values()].map((tip) => tip.base.createdAt))
      const again = Number.isFinite(earliest) ? await readSince(connection, { kinds: [KIND.bookChange], "#v": [v], since: Math.max(0, earliest - CATCH_UP_SLACK) }) : Ok([])
      if (again.ok) for (const event of again.value.toSorted((one, other) => one.created_at - other.created_at)) await onEvent(event)
    }
    line.link = { ...line.link, mark: startedAt }
    await ports.lines.putLink(line.link)
    await reconcile()
    if (line.moved) return afterTurn()
    await flush()
    await baseIfLost()
    await sendTip()
  }

  const stopHearing = connection.onState((state) => {
    const was = line.reach.type
    line.reach = state
    told()
    if (state.type === "open" && was !== "open") void catchUp()
  })
  listen()
  const mailboxListening =
    mailbox === undefined
      ? undefined
      : connection.subscribe(() => [{ ...mailboxFilter(mailbox), since: seconds(ports) - LIVE_SLACK }], {
          onEvent: (event) =>
            void openMailbox(event).then((said) => (said === undefined ? undefined : inTurn(() => onMailbox(said)).then(afterTurn))),
        })
  if (connection.state().type === "open") void catchUp()
  reconcileLater(0)
  told()

  /** A person's choice written: as a merge of the two heads, or, where the device is carrying its book onto a new epoch's floor, as an edit on the floor. */
  const settle = async (files: BookFiles): Promise<Result<void, BookSyncProblem | { readonly type: "moved" }>> => {
    const conflict = line.conflict
    const signer = line.keys.signer
    if (conflict === undefined || conflict.mine !== line.link.head || signer === undefined) return Err({ type: "moved" })
    const result: { value: Result<void, BookSyncProblem | { readonly type: "moved" }> } = { value: Err({ type: "moved" }) }
    await inTurn(async () => {
      const stored = await ports.session.stored(bookId)
      if (!stored.ok || stateDigestOf(stored.value.files) !== stateDigestOf(bookPartOf(conflict.ours)) || line.link.head !== conflict.mine) return
      const now = seconds(ports)
      const paths = conflict.files === "unreadable" ? Object.keys(files).filter((path) => files[path] !== conflict.ours[path]) : conflict.files.map((each) => each.path)
      const toldOf = patchesBetween(bookPartOf(conflict.ours), bookPartOf(files))
      const settledLine = activityLineOf(ports.newId(), { at: new Date(ports.clock()).toISOString(), author: ports.me.id, intent: { type: "conflict-settled", paths }, files: toldOf.ok ? toldOf.value : [] })
      const chosen = withActivity(files, [], settledLine)
      const rebasing = line.link.floor.type === "awaiting"
      const [first, second] = [conflict.mine, conflict.theirs].toSorted() as [ChangeId, ChangeId]
      const under = rebasing ? conflict.others : first === conflict.mine ? conflict.ours : conflict.others
      const patches = patchesBetween(under, chosen)
      if (!patches.ok) {
        result.value = Err({ type: "file-removed", path: patches.error.type === "file-removed" ? patches.error.path : "" })
        return
      }
      const change: Change = rebasing
        ? { sort: "edit", parents: [conflict.theirs], writer: signer.pubkey, at: now, patches: patches.value, result: stateDigestOf(chosen) }
        : { sort: "merge", parents: [first, second], writer: signer.pubkey, at: now, patches: patches.value, result: stateDigestOf(chosen) }
      const id = changeIdOf(change)
      const floor: Floor = rebasing ? { type: "at", id: conflict.theirs } : line.link.floor
      const outcome = await folded(stored.value.files, { id, files: chosen }, [kept(id, change, now)], floor)
      if (outcome.type === "unreadable") {
        result.value = Err({ type: "book", error: outcome.error })
        return
      }
      if (outcome.type !== "kept") return
      line.conflict = undefined
      line.unreadable.clear()
      result.value = Ok(undefined)
      handlers.onBookChanged()
      told()
    })
    if (result.value.ok) reconcileLater(0)
    return result.value
  }

  /** An edit of the owner's on the head, the roster made the one given. */
  const rosterEdit = (owner: SigningKey, roster: Roster): Result<{ readonly at: Known; readonly made: HeldChange }, BookSyncProblem> => {
    const files = { ...line.shadow, [ROSTER_FILE]: rosterText(roster) }
    const patches = patchesBetween(line.shadow, files)
    if (!patches.ok) return Err({ type: "broken", problem: patches.error })
    const now = seconds(ports)
    const edit: Change = { sort: "edit", parents: [line.link.head], writer: owner.pubkey, at: now, patches: patches.value, result: stateDigestOf(files) }
    const id = changeIdOf(edit)
    return Ok({ at: { id, files }, made: kept(id, edit, now) })
  }

  /** When the access list is written: later than the last, never twice in a second (PROTOCOL.md §3.4). */
  const accessTime = (): number => {
    line.accessAt = Math.max(seconds(ports), line.accessAt + 1)
    return line.accessAt
  }

  /** Work of the owner's in turn, with what it gives back; refused on a device not the owner's, or on a roster that does not read. */
  const ownersWork = async <T>(work: (owner: NonNullable<typeof owners>, roster: Roster) => Promise<Result<T, BookSyncProblem>>): Promise<Result<T, BookSyncProblem>> => {
    const result: { value: Result<T, BookSyncProblem> } = { value: Err({ type: "unreachable" }) }
    if (owners === undefined) return Err({ type: "not-owner" })
    await inTurn(async () => {
      const roster = rosterHere()
      result.value = roster === "unreadable" ? Err({ type: "roster-unreadable" }) : await work(owners, roster)
    })
    if (line.problem !== undefined && result.value.ok) return Err(line.problem)
    await afterTurn()
    if (result.value.ok) reconcileLater(0)
    return result.value
  }

  /** The key a person invited signs with: an editor's `M`, a sender's `X`; a viewer signs nothing (PROTOCOL.md §4.2). */
  const invitedKey = async (role: InvitedRole, invitation: Uint8Array): Promise<string | undefined> => {
    switch (role) {
      case "editor":
        return (await ports.keys.signingKey(invitation, NAMES.member)).pubkey
      case "sender":
        return (await ports.keys.signingKey(invitation, NAMES.sender)).pubkey
      case "viewer":
        return undefined
    }
  }

  /** What a person's mailbox says as they are invited: the epoch to one let in, the book's title and inbox to a sender (PROTOCOL.md §4.4). */
  const invitedMailbox = async (owner: NonNullable<typeof owners>, role: InvitedRole, stamp: number): Promise<Mailbox> =>
    role === "sender"
      ? { type: "sender", title: titleOfMain(line.shadow[BOOK_FILES.main] ?? "") ?? "", inbox: await ports.keys.locator(owner.sync, NAMES.inbox), stamp }
      : { type: "member", role, epoch: line.link.epochNumber, secret: line.keys.epoch, stamp }

  const invite = (name: string, role: InvitedRole): Promise<Result<SharedMember, BookSyncProblem>> =>
    ownersWork(async (owner, roster) => {
      const invitation = ports.keys.newSecret()
      const at = await mailboxAt(ports.keys, invitation)
      const vault = await sealedVault(ports.keys, owner.vault, owner.owner.pubkey, at.v, name, invitation)
      if (vault === undefined) return Err({ type: "too-large" })
      const next: Roster = { ...roster, members: [...roster.members, { mailbox: at.v, role, pubkey: await invitedKey(role, invitation), vault }] }
      const edit = rosterEdit(owner.owner, next)
      if (!edit.ok) return edit
      if (!(await settled(edit.value.at, [edit.value.made]))) return Err({ type: "unreachable" })
      const now = accessTime()
      const said = await mailboxEvent(ports.keys, owner.owner, invitation, await invitedMailbox(owner, role, now), now)
      if (said === undefined || !(await queued([await accessListEvent(ports.keys, owner.sync, owner.owner, productOf(role), next, now), said]))) return Err({ type: "unreachable" })
      const member = (await sharedMembersOf(ports.keys, owner.vault, owner.owner.pubkey, line.link.relay, next)).find((each) => each.mailbox === at.v)
      return member === undefined ? Err({ type: "roster-unreadable" }) : Ok(member)
    })

  /**
   * A sender taken out: the roster without them, their mailbox saying so
   * while the access list of senders still holds them, so that a capped or
   * gated relay takes it, and the access list as it then stands. A sender holds nothing of
   * the book to move it away from; what they send after is dropped, as their
   * key is in the roster no longer (PROTOCOL.md §7).
   */
  const removeSender = async (owner: NonNullable<typeof owners>, roster: Roster, gone: SharedMember): Promise<Result<void, BookSyncProblem>> => {
    const next: Roster = { ...roster, members: roster.members.filter((member) => member.mailbox !== gone.mailbox) }
    const edit = rosterEdit(owner.owner, next)
    if (!edit.ok) return edit
    if (!(await settled(edit.value.at, [edit.value.made]))) return Err({ type: "unreachable" })
    const at = accessTime()
    const said = await mailboxEvent(ports.keys, owner.owner, gone.invitation, { type: "removed", role: "sender", stamp: at }, at)
    if (said === undefined) return Err({ type: "too-large" })
    return (await queued([said, await accessListEvent(ports.keys, owner.sync, owner.owner, "sending", next, at)])) ? Ok(undefined) : Err({ type: "unreachable" })
  }

  const remove = (mailboxOfMember: string): Promise<Result<void, BookSyncProblem>> =>
    ownersWork(async (owner, roster) => {
      const shared = await sharedMembersOf(ports.keys, owner.vault, owner.owner.pubkey, line.link.relay, roster)
      const gone = shared.find((member) => member.mailbox === mailboxOfMember)
      if (gone === undefined) return Err({ type: "no-member" })
      if (gone.role === "sender") return removeSender(owner, roster, gone)
      const secret = ports.keys.newSecret()
      const n = epochNumberOf(roster) + 1
      const sealed = await sealedEpoch(ports.keys, owner.vault, owner.owner.pubkey, secret)
      if (sealed === undefined) return Err({ type: "too-large" })
      const next: Roster = { epoch: { n, secret: sealed }, members: roster.members.filter((member) => member.mailbox !== mailboxOfMember) }
      const edit = rosterEdit(owner.owner, next)
      if (!edit.ok) return edit
      if (!(await settled(edit.value.at, [edit.value.made]))) return Err({ type: "unreachable" })
      await moveTo(secret, n, line.link.floor, false)
      const now = seconds(ports)
      const base = baseOf(bookId, edit.value.at.files, owner.owner.pubkey, now, [edit.value.at.id])
      const id = changeIdOf(base)
      if (!(await settled({ id, files: edit.value.at.files }, [kept(id, base, now)], { type: "at", id }))) return Err({ type: "unreachable" })
      const at = accessTime()
      const staying = shared.flatMap((member) => (member.mailbox !== mailboxOfMember && member.role !== "sender" ? [{ ...member, role: member.role }] : []))
      const told = await mailboxEvent(ports.keys, owner.owner, gone.invitation, { type: "removed", role: gone.role, stamp: at }, at)
      const said = await Promise.all(staying.map((member) => mailboxEvent(ports.keys, owner.owner, member.invitation, { type: "member", role: member.role, epoch: n, secret, stamp: at }, at)))
      const mailboxes = said.filter((event): event is NostrEvent => event !== undefined)
      if (told === undefined || mailboxes.length !== said.length) return Err({ type: "too-large" })
      return (await queued([told, await accessListEvent(ports.keys, owner.sync, owner.owner, "sharing", next, at), ...mailboxes])) ? Ok(undefined) : Err({ type: "unreachable" })
    })

  const members = async (): Promise<readonly SharedMember[]> => {
    const roster = rosterHere()
    return owners === undefined || roster === "unreadable" ? [] : sharedMembersOf(ports.keys, owners.vault, owners.owner.pubkey, line.link.relay, roster)
  }

  return Ok({
    wrote: () => reconcileLater(AFTER_WRITING_MS),
    settle,
    members,
    invite,
    remove,
    close: async () => {
      line.closed = true
      clearTimeout(line.timer)
      clearTimeout(line.retry)
      await Promise.race([flush(), new Promise((resolve) => setTimeout(resolve, CLOSING_WAIT_MS))])
      line.listening?.close()
      mailboxListening?.close()
      stopHearing()
    },
  })
}

