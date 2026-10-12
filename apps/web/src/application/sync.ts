import { RELAY_LIMITS, type LineEntryDto, type SealedCommitDto } from "@p-lens/contracts/relay"

import type { BookId, Member } from "../core/book/book"
import { fileChangesBetween, patchesOf, type JournalChange } from "../core/change/journal-change"
import { patchBetween } from "../core/change/patch"
import type { BookFiles } from "../core/journal/layout"
import { Err, Ok, type Result, collect, mapErr, mapOk } from "../core/result/result"
import { changeOfText, changeText } from "../core/sync/codec"
import { contestedIn, mergeOutline, type MergePart, settledText, type Side } from "../core/sync/merge"
import { readInvitation } from "../core/sync/invitation"
import { pairingCode, readPairingCode, roleBy } from "../core/sync/pairing"
import { lineFilesOf, rebased, received } from "../core/sync/rebase"
import type { Commit, CommitId, HistoryPort } from "../history/port/history-port"
import type { DestinationStore } from "../sync/port/destination-store"
import type { LinkStore, LinkStoreError, SyncLink } from "../sync/port/link-store"
import type { LineAccess, Relay } from "../sync/port/relay"
import { accessOf, type LineKeys, type Sealer } from "../sync/port/sealer"
import type { BookSession } from "./book-session"
import type { Outcome, SyncProblem } from "./errors"
import { fromHistory } from "./lift"

/** Everything syncing a book reaches: the book and its history, its link, the relay, the sealing, and who and when for what is made here. */
export interface SyncPorts {
  readonly session: BookSession
  readonly history: HistoryPort
  readonly links: LinkStore
  readonly relay: Relay
  readonly sealer: Sealer
  /** Whoever uses this device, as a book joined here names its owner. */
  readonly me: Member
  readonly now: () => string
  readonly newCommitId: () => string
}

const problem = (found: SyncProblem): Outcome<never> => Err({ type: "sync", problem: found })

const fromSync = <T>(result: Result<T, SyncProblem>): Outcome<T> => mapErr(result, (found) => ({ type: "sync", problem: found }))

const fromLinks = <T>(result: Result<T, LinkStoreError>): Outcome<T> => mapErr(result, (error) => ({ type: "sync", problem: { type: "links", detail: error.detail } }))

/** A line as a device holds it open: where it is, and the key to its commits. */
interface Line {
  readonly access: LineAccess
  readonly keys: LineKeys
}

const lineOf = async (sealer: Sealer, relayUrl: string, secret: string): Promise<Outcome<Line>> =>
  mapOk(fromSync(await sealer.keysOf(secret)), (keys) => ({ access: accessOf(relayUrl, keys), keys }))

const opened = async (sealer: Sealer, keys: LineKeys, entry: LineEntryDto): Promise<Outcome<Commit>> => {
  const text = fromSync(await sealer.open(keys, entry.commitId, entry.box))
  if (!text.ok) return text
  return mapOk(fromSync(changeOfText(text.value)), (change) => ({ id: entry.commitId as CommitId, change }))
}

const sealed = async (sealer: Sealer, keys: LineKeys, commit: Commit): Promise<Outcome<SealedCommitDto>> =>
  mapOk(fromSync(await sealer.seal(keys, commit.id, changeText(commit.change))), (box) => ({ commitId: commit.id, box }))

/**
 * What a line holds past a place in it, opened, where it ends and when it
 * was begun: every page of it. A line that is not there — never begun, or
 * let go by its relay — is an empty one, begun at no moment.
 */
interface Pulled {
  readonly commits: readonly Commit[]
  readonly head: number
  readonly begunAt: string | undefined
}

const pulled = async (ports: SyncPorts, line: Line, after: number): Promise<Outcome<Pulled>> => {
  const page = await ports.relay.entriesAfter(line.access, after)
  if (!page.ok) return page.error.type === "line-missing" ? Ok({ commits: [], head: 0, begunAt: undefined }) : problem(page.error)
  const commits = collect(await Promise.all(page.value.entries.map((entry) => opened(ports.sealer, line.keys, entry))))
  if (!commits.ok) return commits
  const reached = page.value.entries.at(-1)?.seq ?? page.value.head
  if (reached >= page.value.head) return Ok({ commits: commits.value, head: page.value.head, begunAt: page.value.begunAt })
  return mapOk(await pulled(ports, line, reached), (rest) => ({ commits: [...commits.value, ...rest.commits], head: rest.head, begunAt: page.value.begunAt }))
}

/** Where a book stands against what was just taken from its line. */
interface Standing {
  /** The line's files as this device last had them, before what was taken. */
  readonly was: BookFiles
  /** The line's files with what was taken made on them. */
  readonly theirs: BookFiles
  /** The book's unsent commits that the line does not already have, oldest first. */
  readonly mine: readonly Commit[]
}

/**
 * Work out where a book stands: its unsent commits taken back to find the
 * line as it was, then the line's new commits made. An unsent commit the
 * line turns out to have already — sent, its answer lost — is the line's
 * now, and what came after it here is made again from where it left the files.
 */
const standingOf = async (ports: SyncPorts, bookId: BookId, files: BookFiles, taken: Pulled): Promise<Outcome<Standing>> => {
  const unsent = fromHistory(await ports.history.unsent(bookId))
  if (!unsent.ok) return unsent
  const arrived = taken.commits.map((commit) => commit.id)
  const line = fromSync(lineFilesOf(files, unsent.value))
  if (!line.ok) return line
  const theirs = fromSync(received(line.value, taken.commits))
  if (!theirs.ok) return theirs
  const was = fromSync(received(line.value, unsent.value.filter((commit) => arrived.includes(commit.id))))
  return mapOk(was, (found) => ({ was: found, theirs: theirs.value, mine: unsent.value.filter((commit) => !arrived.includes(commit.id)) }))
}

/** A link moved to a place on its line, with when that line was begun where the relay said. */
const alongLine = (link: SyncLink, cursor: number, begunAt: string | undefined): SyncLink => {
  const { begunAt: _was, ...rest } = link
  return begunAt === undefined ? { ...rest, cursor } : { ...rest, cursor, begunAt }
}

/**
 * Whether the line a device finds is not the one it had come along: it is
 * gone though the device had been along it, it ends before where the device
 * had come to, or it was begun at another moment. Its relay let go of it,
 * and perhaps another device has made it again since.
 */
const isAnotherLine = (link: SyncLink, taken: Pulled): boolean =>
  link.cursor > 0 && (taken.begunAt === undefined || taken.head < link.cursor || (link.begunAt !== undefined && link.begunAt !== taken.begunAt))

/**
 * Meet a line from its start: none of the book's commits counted as on it,
 * so the round that follows takes what the line has — a commit it already
 * holds being the line's, as one sent whose answer was lost is — and puts
 * the rest on it, or all of them where the line is gone.
 */
const fromItsStart = async (ports: SyncPorts, link: SyncLink): Promise<Outcome<void>> => {
  const unsent = fromHistory(await ports.history.unsend(link.bookId))
  return unsent.ok ? fromLinks(await ports.links.write(alongLine(link, 0, undefined))) : unsent
}

const taking = (ports: SyncPorts, link: SyncLink, taken: Pulled, rebasedCommits: readonly Commit[]) => async (): Promise<Outcome<void>> => {
  const kept = fromHistory(await ports.history.reconcile(link.bookId, taken.commits, rebasedCommits))
  return kept.ok ? fromLinks(await ports.links.write(alongLine(link, taken.head, taken.begunAt))) : kept
}

/**
 * Take a line's new commits into a book: its unsent commits set aside, the
 * line's made in their place, the unsent ones made again on top, and the
 * files that leaves kept — if hledger reads them — with the history to match.
 */
const takeIn = (ports: SyncPorts, link: SyncLink, taken: Pulled): Promise<Outcome<void>> =>
  ports.session.fold(link.bookId, async (stored) => {
    const standing = await standingOf(ports, link.bookId, stored.files, taken)
    if (!standing.ok) return standing
    const made = fromSync(rebased(standing.value.was, standing.value.theirs, standing.value.mine, "stop"))
    return mapOk(made, (remade) => ({ files: remade.files, settle: taking(ports, link, taken, remade.commits) }))
  })

/** How a round of syncing went: the commits taken from the line, and those put on it. */
export interface Synced {
  readonly received: number
  readonly sent: number
}

/** How many times a device catches up with a line that moved under it before it gives the round up. */
const ROUNDS = 5

const round = async (ports: SyncPorts, line: Line, bookId: BookId, so: Synced, left: number): Promise<Outcome<Synced>> => {
  const link = fromLinks(await ports.links.read(bookId))
  if (!link.ok) return link
  if (link.value === undefined) return problem({ type: "not-linked" })
  const taken = await pulled(ports, line, link.value.cursor)
  if (!taken.ok) return taken
  const role = roleBy(link.value.secret)
  if (role !== "owner" && taken.value.begunAt === undefined) return problem({ type: "line-missing" })
  if (isAnotherLine(link.value, taken.value)) {
    const met = await fromItsStart(ports, link.value)
    return met.ok ? round(ports, line, bookId, so, left) : met
  }
  const folded = taken.value.commits.length === 0 ? Ok(undefined) : await takeIn(ports, link.value, taken.value)
  if (!folded.ok) return folded
  const counted = { received: so.received + taken.value.commits.length, sent: so.sent }
  if (role === "viewer") return Ok(counted)
  const unsent = fromHistory(await ports.history.unsent(bookId))
  if (!unsent.ok) return unsent
  if (unsent.value.length === 0) return Ok(counted)
  const sending = unsent.value.slice(0, RELAY_LIMITS.entriesPerAppend)
  const boxes = collect(await Promise.all(sending.map((commit) => sealed(ports.sealer, line.keys, commit))))
  if (!boxes.ok) return boxes
  const appended = await ports.relay.append(line.access, taken.value.head, boxes.value)
  if (!appended.ok) {
    if (appended.error.type !== "behind") return problem(appended.error)
    return left > 0 ? round(ports, line, bookId, counted, left - 1) : problem({ type: "unsettled" })
  }
  const marked = fromHistory(await ports.history.sent(bookId, sending.map((commit) => commit.id)))
  if (!marked.ok) return marked
  const advanced = fromLinks(await ports.links.write(alongLine(link.value, appended.value.head, appended.value.begunAt)))
  if (!advanced.ok) return advanced
  const sent = { received: counted.received, sent: counted.sent + sending.length }
  return sending.length < unsent.value.length ? round(ports, line, bookId, sent, left) : Ok(sent)
}

/**
 * Bring a book and its line together: what the line has that the book has
 * not is taken in, then what the book has that the line has not is sealed
 * and put on it, as many at a time as a relay takes. A line that moved
 * meanwhile is caught up with and tried again; a line its relay let go of
 * is made again from the book's whole history, and one another device made
 * again is met from its start.
 *
 * A device that was let in by an invitation does less. One that may only
 * read takes in and puts nothing on the line. And neither kind makes a line
 * again where it is gone: a line is made by its first commits under the
 * token they came with, and one made by an invitation's token would be
 * that person's, its owner shut out — so it waits for the owner's device.
 */
export const syncBook = async (ports: SyncPorts, bookId: BookId): Promise<Outcome<Synced>> => {
  const link = fromLinks(await ports.links.read(bookId))
  if (!link.ok) return link
  if (link.value === undefined) return problem({ type: "not-linked" })
  const line = await lineOf(ports.sealer, link.value.relayUrl, link.value.secret)
  return line.ok ? round(ports, line.value, bookId, { received: 0, sent: 0 }, ROUNDS) : line
}

/** The commit a book's line starts with when the book is older than its history: everything it held before its first commit kept. */
const baseline = (ports: SyncPorts, bookId: BookId, files: BookFiles): Commit => ({
  id: ports.newCommitId() as CommitId,
  change: {
    bookId,
    author: ports.me.id,
    at: ports.now(),
    intent: { type: "book-created" },
    files: Object.keys(files)
      .toSorted()
      .map((path) => patchBetween(path, undefined, files[path] ?? "")),
  } satisfies JournalChange,
})

/**
 * Make a book's history one a line can start from: commits that, made in
 * order from nothing, leave the book's files. A book older than its history
 * is given a first commit holding what it had before any was kept.
 */
const grounded = (ports: SyncPorts, bookId: BookId): Promise<Outcome<void>> =>
  ports.session.read(bookId, async (_journal, stored) => {
    const unsent = fromHistory(await ports.history.unsent(bookId))
    if (!unsent.ok) return unsent
    const before = fromSync(lineFilesOf(stored.files, unsent.value))
    if (!before.ok) return before
    if (Object.keys(before.value).length === 0) return Ok(undefined)
    return fromHistory(await ports.history.reconcile(bookId, [], [baseline(ports, bookId, before.value), ...unsent.value]))
  })

/**
 * Start syncing a book through a relay, or say again how: the pairing code
 * its other devices join with. The book's commits go to the line the first
 * time it is synced.
 */
export const startSync = async (ports: SyncPorts, bookId: BookId, relayUrl: string | undefined): Promise<Outcome<string>> => {
  const link = fromLinks(await ports.links.read(bookId))
  if (!link.ok) return link
  if (link.value !== undefined) return Ok(pairingCode(link.value.secret))
  if (relayUrl === undefined) return problem({ type: "no-relay" })
  const ready = await grounded(ports, bookId)
  if (!ready.ok) return ready
  const made: SyncLink = { bookId, relayUrl, secret: ports.sealer.newSecret(), cursor: 0 }
  return mapOk(fromLinks(await ports.links.write(made)), () => pairingCode(made.secret))
}

/**
 * Join a book from its pairing code, on the relay this build names — the
 * code is the line's secret and names none: its line read whole, its
 * commits made in order from nothing, and the book they leave put on this device, synced
 * from then on. By the line's secret the book is this person's own on one
 * more of their devices; by an invitation it is someone else's, and the
 * person is to it what the invitation says, an editor or a viewer.
 */
export const joinSync = async (ports: SyncPorts, code: string, relayUrl: string | undefined): Promise<Outcome<BookId>> => {
  const secret = fromSync(readPairingCode(code))
  if (!secret.ok) return secret
  const role = roleBy(secret.value)
  if (role === "sender") return problem({ type: "not-a-pairing-code" })
  if (relayUrl === undefined) return problem({ type: "no-relay" })
  const line = await lineOf(ports.sealer, relayUrl, secret.value)
  if (!line.ok) return line
  const taken = await pulled(ports, line.value, 0)
  if (!taken.ok) return taken
  const bookId = taken.value.commits[0]?.change.bookId
  if (bookId === undefined) return problem({ type: "nothing-to-join" })
  const books = await ports.session.books()
  if (!books.ok) return books
  if (books.value.some((book) => book.id === bookId)) return problem({ type: "book-here", bookId })
  const files = fromSync(received({}, taken.value.commits))
  if (!files.ok) return files
  const adopted = await ports.session.adoptBook({ book: { id: bookId, members: [{ ...ports.me, role }] }, files: files.value })
  if (!adopted.ok) return adopted
  const kept = fromHistory(await ports.history.reconcile(bookId, taken.value.commits, []))
  if (!kept.ok) return kept
  const linked = fromLinks(await ports.links.write(alongLine({ bookId, relayUrl, secret: secret.value, cursor: 0 }, taken.value.head, taken.value.begunAt)))
  return mapOk(linked, () => bookId)
}

/**
 * What a code is for: a book's own secret, which puts it on another of its
 * owner's devices, or an invitation, which lets someone else in. The two
 * are typed into different places, and each place says so of the other's.
 */
export const kindOfCode = (code: string): "own" | "invitation" => (readInvitation(code) === undefined ? "own" : "invitation")

/** What a code put on a device: a book, joined; or somewhere to send plays to, by what its book is called. */
export type Joined = { readonly type: "book"; readonly bookId: BookId } | { readonly type: "destination"; readonly title: string }

/**
 * Take in whatever a code is: the secret of one's own book or an
 * invitation into someone else's joins that book, as `joinSync` does; an
 * invitation to send is kept as a destination, and puts no book on the
 * device — a sender is shown none.
 */
export const joinByCode = async (ports: SyncPorts & { readonly destinations: DestinationStore }, code: string, relayUrl: string | undefined): Promise<Outcome<Joined>> => {
  const invitation = readInvitation(code)
  if (invitation?.role !== "sender") return mapOk(await joinSync(ports, code, relayUrl), (bookId): Joined => ({ type: "book", bookId }))
  if (relayUrl === undefined) return problem({ type: "no-relay" })
  const title = invitation.title ?? ""
  const kept = await ports.destinations.write({ lineId: invitation.lineId, relayUrl, code: code.trim(), title, joinedAt: ports.now() })
  return kept.ok ? Ok({ type: "destination", title }) : problem({ type: "links", detail: kept.error.detail })
}

/** The books synced from this device. */
export const syncedBooks = async (links: LinkStore): Promise<Outcome<readonly BookId[]>> => mapOk(fromLinks(await links.list()), (found) => found.map((link) => link.bookId))

const together = (left: Synced, right: Synced): Synced => ({ received: left.received + right.received, sent: left.sent + right.sent })

/** Sync every book this device syncs, one after another, stopping at the first that cannot be. */
export const syncAll = async (ports: SyncPorts): Promise<Outcome<Synced>> => {
  const books = await syncedBooks(ports.links)
  if (!books.ok) return books
  return books.value.reduce<Promise<Outcome<Synced>>>(
    async (so, bookId) => {
      const done = await so
      return done.ok ? mapOk(await syncBook(ports, bookId), (synced) => together(done.value, synced)) : done
    },
    Promise.resolve(Ok({ received: 0, sent: 0 })),
  )
}

/** One file both this device and the line changed in the same places, laid out for a choice. */
export interface FileConflict {
  readonly path: string
  readonly parts: readonly MergePart[]
}

/**
 * A book whose round stopped at a conflict: the files to choose in, and the
 * place on the line the choice is made against. No file listed means the
 * commits only crossed on the way and the books come together with nothing
 * to choose.
 */
export interface Conflict {
  readonly bookId: BookId
  readonly head: number
  readonly files: readonly FileConflict[]
}

/** The sides picked for a file's contested stretches, in order, by its path. */
export type Picks = Readonly<Record<string, readonly Side[]>>

const pathsOf = (...files: readonly BookFiles[]): readonly string[] => [...new Set(files.flatMap((each) => Object.keys(each)))].toSorted()

const contestedFiles = (standing: Standing, files: BookFiles): readonly FileConflict[] =>
  pathsOf(files, standing.theirs)
    .map((path) => ({ path, parts: mergeOutline(standing.was[path] ?? "", files[path] ?? "", standing.theirs[path] ?? "") }))
    .filter((file) => contestedIn(file.parts) > 0)

/** A synced book and its line, opened: what every look at a conflict starts from. */
const lookingAt = async (ports: SyncPorts, bookId: BookId): Promise<Outcome<{ readonly link: SyncLink; readonly taken: Pulled }>> => {
  const read = fromLinks(await ports.links.read(bookId))
  if (!read.ok) return read
  const link = read.value
  if (link === undefined) return problem({ type: "not-linked" })
  const line = await lineOf(ports.sealer, link.relayUrl, link.secret)
  if (!line.ok) return line
  return mapOk(await pulled(ports, line.value, link.cursor), (taken) => ({ link, taken }))
}

/** The conflict a book's round would stop at, if it would: nothing is changed by looking. */
export const conflictOf = async (ports: SyncPorts, bookId: BookId): Promise<Outcome<Conflict | undefined>> => {
  const looked = await lookingAt(ports, bookId)
  if (!looked.ok) return looked
  return ports.session.read(bookId, async (_journal, stored) => {
    const standing = await standingOf(ports, bookId, stored.files, looked.value.taken)
    if (!standing.ok) return standing
    const made = rebased(standing.value.was, standing.value.theirs, standing.value.mine, "stop")
    if (made.ok) return Ok(undefined)
    if (made.error.type !== "conflict") return problem(made.error)
    return Ok({ bookId, head: looked.value.taken.head, files: contestedFiles(standing.value, stored.files) })
  })
}

/** The first of this device's synced books whose round would stop at a conflict. */
export const firstConflict = async (ports: SyncPorts): Promise<Outcome<Conflict | undefined>> => {
  const books = await syncedBooks(ports.links)
  if (!books.ok) return books
  return books.value.reduce<Promise<Outcome<Conflict | undefined>>>(
    async (so, bookId) => {
      const found = await so
      return !found.ok || found.value !== undefined ? found : conflictOf(ports, bookId)
    },
    Promise.resolve(Ok(undefined)),
  )
}

/** The commit that records what a person chose: from where the line's stood everywhere, to the sides picked. */
const settling = (ports: SyncPorts, bookId: BookId, from: BookFiles, to: BookFiles): readonly Commit[] => {
  const changes = fileChangesBetween(from, to)
  if (changes.length === 0) return []
  return [
    {
      id: ports.newCommitId() as CommitId,
      change: { bookId, author: ports.me.id, at: ports.now(), intent: { type: "conflict-settled", paths: changes.map((change) => change.path) }, files: patchesOf(changes) },
    },
  ]
}

/**
 * Settle a conflict by the sides a person picked. The line's commits are
 * taken in; this device's unsent commits are made again on them, the line's
 * standing wherever the two rewrote the same lines; and one more commit puts
 * the picked sides in place. The files that leaves are kept if hledger reads
 * them. A line or a book that has moved since the conflict was shown is
 * looked at again rather than settled blind.
 */
export const settleConflict = async (ports: SyncPorts, conflict: Conflict, picks: Picks): Promise<Outcome<void>> => {
  const looked = await lookingAt(ports, conflict.bookId)
  if (!looked.ok) return looked
  if (looked.value.taken.head !== conflict.head) return problem({ type: "unsettled" })
  return ports.session.fold(conflict.bookId, async (stored) => {
    const standing = await standingOf(ports, conflict.bookId, stored.files, looked.value.taken)
    if (!standing.ok) return standing
    const yielded = fromSync(rebased(standing.value.was, standing.value.theirs, standing.value.mine, "yield"))
    if (!yielded.ok) return yielded
    const contested = contestedFiles(standing.value, stored.files)
    if (contested.some((file) => contestedIn(file.parts) !== (picks[file.path]?.length ?? 0))) return problem({ type: "unsettled" })
    const files: BookFiles = { ...yielded.value.files, ...Object.fromEntries(contested.map((file) => [file.path, settledText(file.parts, picks[file.path] ?? [])])) }
    const commits = [...yielded.value.commits, ...settling(ports, conflict.bookId, yielded.value.files, files)]
    return Ok({ files, settle: taking(ports, looked.value.link, looked.value.taken, commits) })
  })
}
