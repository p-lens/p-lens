import { RELAY_LIMITS, type LineKeep, type SealedCommitDto } from "@p-lens/contracts/relay"

import type { Book, BookId, MemberId } from "../core/book/book"
import { previousDay, type IsoDate } from "../core/calendar/calendar"
import { bookOf, isLeftOver, isPast, type PlayDraft } from "../core/live-play/draft"
import type { DeviceId } from "../core/play-line/device"
import { playLineEntryText, readPlayLineEntry, readShownPlay, shownPlayOf, type PlayLineEntry, type ShownPlay } from "../core/play-line/entry"
import { handoversOf, standingsOf, type Followed, type LineOf, type PlayStanding, type ReadLine } from "../core/play-line/following"
import { isAheadOf, reconcile, type HeldPlay, type PlayLineAction } from "../core/play-line/reconcile"
import { hasShownOn, readOnto, showingOf, shownTextOf } from "../core/play-line/showing"
import type { PlayId } from "../core/play/play"
import { Err, Ok, mapErr, mapOk, type Result } from "../core/result/result"
import type { DraftError, DraftStorage } from "../storage/port/draft-storage"
import type { FollowStorage } from "../storage/port/follow-storage"
import type { LinkStore, SyncLink } from "../sync/port/link-store"
import { accessOf } from "../sync/port/sealer"
import type { Outcome, SyncProblem } from "./errors"
import { ownersLink } from "./invitations"
import { linksProblemOf } from "./kept-links"
import { fromDraft } from "./lift"
import { finishPlay, finishPlayInYen } from "./live-play"
import { behindAt, putAt, readLineAfter, sealedEntries, type SealedLine, type SealedLinePorts } from "./sealed-line"

/**
 * Everything keeping a person's plays in step between their own devices
 * reaches: the relay the plays' lines are on and the sealing and packing
 * of what they carry, the books' links, the plays this device holds and
 * the copies it keeps of those it does not, the name it goes by on the
 * lines, the books and who is using them, and the moment, the business
 * day and a fresh id.
 */
export interface PlayLinePorts extends SealedLinePorts {
  readonly links: LinkStore
  readonly drafts: DraftStorage
  readonly follow: FollowStorage
  readonly device: () => Promise<DeviceId>
  readonly books: () => Promise<Outcome<readonly Book[]>>
  readonly member: MemberId
  readonly now: () => string
  readonly businessDay: () => IsoDate
  readonly newId: () => string
}

/** A plays' line as this device has read it so far: everything on it up to where it was last seen to end. */
export interface KeptLine extends ReadLine {
  readonly head: number
}

/**
 * What came of bringing the device in line with its plays' lines: the
 * lines as it now has them, and what it did to the plays it keeps —
 * a play taken up or given up, a copy kept, refreshed or let go, a play
 * taken off a line.
 */
export interface Followings {
  readonly lines: readonly KeptLine[]
  readonly acted: readonly PlayLineAction[]
}

/** A play this device has open: held, to be played on, or a copy of one another device holds, to be watched. */
export type LivePlayHold = { readonly type: "held"; readonly draft: PlayDraft } | { readonly type: "followed"; readonly followed: Followed }

/** Where the device stands as it reads or writes its lines: its name on them, the business day, its own books it syncs, and the books it has. */
interface Footing {
  readonly me: DeviceId
  readonly today: IsoDate
  readonly owned: readonly SyncLink[]
  readonly books: readonly Book[]
}

/** The plays a device keeps: those it holds, each with the book of its own it is shown on, and its copies of those it does not. */
interface Kept {
  readonly held: readonly HeldPlay[]
  readonly followed: readonly Followed[]
}

/**
 * Which entries a device puts on a line: only what it says of plays it
 * deleted, or that and its plays as they now stand, and the plays it took
 * off the book to record them into another — said only beside showing
 * them, so that a play is shown on the book it went to before it is taken
 * off the one it left.
 */
type Saying = "withdrawn" | "said-and-shown"

/** How many times a line is read again and written to, having moved on under a write, before the writing is given up. */
const TRIES = 5

/**
 * What a sealed entry's room in a body comes to besides its box and its
 * id: the quotes and names around them.
 */
const ENTRY_ROOM = 32

/** What a body puts around the entries it carries: where the line is to end before them, and the names around the list. */
const BODY_ROOM = 64

/** What sealing adds to a packed entry before its box is written out as text: the nonce it is sealed under, and the tag that proves it. */
const SEALING_BYTES = 28

/** How long an id on a line is, a commit's and a device's alike: a UUIDv7, as written. */
const ID_LENGTH = 36

/** Entries put on a line at once: no more than a relay takes in one, and a body small enough to be put often. */
const BATCH = { entries: RELAY_LIMITS.entriesPerAppend, bytes: RELAY_LIMITS.smallBodyBytes } as const

const problem = (found: SyncProblem): Outcome<never> => Err({ type: "sync", problem: found })

const fromSync = <T>(result: Result<T, SyncProblem>): Outcome<T> => mapErr(result, (found) => ({ type: "sync", problem: found }))

const heldElsewhere = (playId: PlayId): Outcome<never> => Err({ type: "draft", error: { type: "held-elsewhere", playId } })

/**
 * Where the device stands, its links read first: a device that syncs no
 * book of its own as its owner has no line to read or write, and its
 * books — every file of every one — are not read for nothing.
 */
const footingOf = async (ports: PlayLinePorts): Promise<Outcome<Footing>> => {
  const listed = await ports.links.list()
  if (!listed.ok) return problem(linksProblemOf(listed.error))
  const owned = (await Promise.all(listed.value.map((link) => ownersLink(ports.links, link.bookId)))).flatMap((link) => (link.ok ? [link.value] : []))
  const books = owned.length === 0 ? Ok<readonly Book[]>([]) : await ports.books()
  if (!books.ok) return books
  return Ok({ me: await ports.device(), today: ports.businessDay(), owned, books: books.value })
}

/** Where the device stands, where it syncs a book of its own: none where it syncs none, and has nothing to read or show. */
const syncingFooting = async (ports: PlayLinePorts): Promise<Outcome<Footing | undefined>> =>
  mapOk(await footingOf(ports), (footing) => (footing.owned.length === 0 ? undefined : footing))

/** The book a play goes to, where it is one of the person's own this device syncs: none where it goes to another, so that it is shown on no line. */
const syncedBookOf = (ports: Pick<PlayLinePorts, "member">, footing: Footing, draft: PlayDraft): BookId | undefined => {
  const bookId = bookOf(draft, footing.books, ports.member)
  return footing.owned.some((link) => link.bookId === bookId) ? bookId : undefined
}

const keptOf = async (ports: PlayLinePorts, footing: Footing): Promise<Outcome<Kept>> => {
  const drafts = fromDraft(await ports.drafts.listDrafts())
  if (!drafts.ok) return drafts
  const followed = fromDraft(await ports.follow.listFollowed())
  if (!followed.ok) return followed
  return Ok({ held: drafts.value.map((draft) => ({ draft, bookId: syncedBookOf(ports, footing, draft) })), followed: followed.value })
}

const lineAt = (lines: readonly KeptLine[], at: LineOf): KeptLine => lines.find((line) => line.bookId === at.bookId && line.day === at.day) ?? { bookId: at.bookId, day: at.day, head: 0, entries: [] }

const withLine = (lines: readonly KeptLine[], line: KeptLine): readonly KeptLine[] => [...lines.filter((each) => each.bookId !== line.bookId || each.day !== line.day), line]

const onBook = (lines: readonly KeptLine[], bookId: BookId): readonly KeptLine[] => lines.filter((line) => line.bookId === bookId)

const todayOn = (footing: Footing, link: SyncLink): LineOf => ({ bookId: link.bookId, day: footing.today })

/** A play line is a business day's, made again by nobody once its day is past: the relay lets it go sooner than a book's, owner and all. */
const PLAYS_KEPT: LineKeep = "passing"

const openLine = async (ports: PlayLinePorts, link: SyncLink, day: IsoDate): Promise<Outcome<SealedLine>> =>
  mapOk(fromSync(await ports.sealer.playsKeysOf(link.secret, day)), (keys) => ({ access: accessOf(link.relayUrl, keys), keys }))

const readOn = async (ports: PlayLinePorts, line: SealedLine, kept: KeptLine): Promise<Outcome<KeptLine>> =>
  mapOk(await readLineAfter(ports, line, kept.head, readPlayLineEntry), (read) => ({ ...kept, head: read.head, entries: readOnto(kept.entries, read.entries) }))

const readKept = async (ports: PlayLinePorts, link: SyncLink, kept: KeptLine): Promise<Outcome<KeptLine>> => {
  const line = await openLine(ports, link, kept.day)
  return line.ok ? readOn(ports, line.value, kept) : line
}

/** The days in order, each once. */
const distinctDays = (days: readonly IsoDate[]): readonly IsoDate[] => [...new Set(days)].toSorted()

/**
 * The days of a book's lines read to learn what became of a play the
 * device holds: the business day and the one before it, and the play's own
 * day where it was left over from one earlier — a claim, a showing as
 * recorded or a deletion made elsewhere on that day is on no later line.
 */
const daysOfPlay = (draft: PlayDraft, today: IsoDate): readonly IsoDate[] => distinctDays([...(isLeftOver(draft, today) ? [draft.date] : []), previousDay(today), today])

/**
 * The days of a book's lines a device reads: the business day, and the
 * one before it on the first reading of the day — devices whose days turn
 * at different hours may still be on it — and while the device holds a
 * play left over from a day gone by, or keeps a copy of one last shown
 * there; and with them the day of each such play, and the day each such
 * copy was last shown on, however long ago.
 */
const daysOf = (footing: Footing, lines: readonly KeptLine[], kept: Kept, bookId: BookId): readonly IsoDate[] => {
  const firstToday = !lines.some((line) => line.bookId === bookId && line.day === footing.today)
  const heldOver = kept.held.filter((each) => each.bookId === bookId && isLeftOver(each.draft, footing.today)).map((each) => each.draft.date)
  const followedOver = kept.followed.filter((each) => each.line.bookId === bookId && each.line.day < footing.today && !isPast(each.play, footing.today)).map((each) => each.line.day)
  const before = firstToday || heldOver.length > 0 || followedOver.length > 0 ? [previousDay(footing.today)] : []
  return distinctDays([...heldOver, ...followedOver, ...before, footing.today])
}

/**
 * Which of the person's own books this device syncs a reading of the
 * lines reads: every one, or only the book of the one play being watched,
 * whose line is read the most often — a device reads only so many lines a
 * minute, and a person may sync a dozen books.
 */
export type LinesRead = { readonly type: "every-book" } | { readonly type: "book-of"; readonly playId: PlayId }

/** The books of a reading: none where the play watched is not one this device keeps a copy of. */
const booksRead = async (ports: PlayLinePorts, owned: readonly SyncLink[], read: LinesRead): Promise<readonly SyncLink[]> => {
  if (read.type === "every-book") return owned
  const copy = await ports.follow.readFollowed(read.playId)
  return copy.ok && copy.value !== undefined ? owned.filter((link) => link.bookId === copy.value?.line.bookId) : []
}

/** The lines of some books read on from where each was last read, the other books' lines kept as they were. */
const readOnBooks = async (ports: PlayLinePorts, footing: Footing, kept: Kept, lines: readonly KeptLine[], books: readonly SyncLink[]): Promise<readonly KeptLine[]> => {
  const unread = lines.filter((line) => !books.some((link) => link.bookId === line.bookId))
  const wanted = books.flatMap((link) => daysOf(footing, lines, kept, link.bookId).map((day) => ({ link, at: { bookId: link.bookId, day } })))
  const read = await Promise.all(
    wanted.map(async ({ link, at }) => {
      const before = lines.find((line) => line.bookId === at.bookId && line.day === at.day)
      const after = await readKept(ports, link, before ?? lineAt([], at))
      return after.ok ? [after.value] : before === undefined ? [] : [before]
    }),
  )
  return [...unread, ...read.flat()]
}

/** Whether the play being watched now stands as moved off its book: shown, it may be, on another book this device syncs, whose lines were not read with it. */
const movedOffWatched = (lines: readonly KeptLine[], reading: LinesRead): boolean => {
  if (reading.type !== "book-of") return false
  const standing = standingsOf(lines).get(reading.playId)
  return standing?.type === "gone" && standing.reason === "moved"
}

/**
 * Read the plays' lines of the books of the person's own this device
 * syncs — every one, or the book of the play watched — each on from where
 * it was last read. Where the play watched was moved off its book, the
 * other books are read too, so that one it went to that this device syncs
 * is found, rather than the copy let go. A line of a day no longer read is
 * let go; one that cannot be reached now, or of a book not read this time,
 * stays as it was.
 */
export const readPlayLines = async (ports: PlayLinePorts, lines: readonly KeptLine[], reading: LinesRead = { type: "every-book" }): Promise<Outcome<readonly KeptLine[]>> => {
  const syncing = await syncingFooting(ports)
  if (!syncing.ok) return syncing
  const footing = syncing.value
  if (footing === undefined) return Ok(lines)
  const kept = await keptOf(ports, footing)
  if (!kept.ok) return kept
  const books = await booksRead(ports, footing.owned, reading)
  const read = await readOnBooks(ports, footing, kept.value, lines, books)
  if (!movedOffWatched(read, reading)) return Ok(read)
  return Ok(await readOnBooks(ports, footing, kept.value, read, footing.owned.filter((link) => !books.includes(link))))
}

/** What a device does to its own store, of what its lines would have it do, as against what it says on a line. */
const isLocal = (action: PlayLineAction): boolean => action.type !== "withdraw" && action.type !== "move"

/**
 * A copy of a play recorded on a day gone by is no copy to keep: the play
 * is in its book, and its holder lets it go too. A copy kept of it is let
 * go of here, as the news that it was recorded; none is made of it anew.
 */
const pastCopiesLetGo = (actions: readonly PlayLineAction[], kept: Kept, today: IsoDate): readonly PlayLineAction[] =>
  actions.flatMap((action): readonly PlayLineAction[] => {
    if (action.type !== "put-followed" || !isPast(action.followed.play, today)) return [action]
    return kept.followed.some((each) => each.id === action.followed.id) ? [{ type: "drop-followed", playId: action.followed.id, reason: "recorded" }] : []
  })

/** What became of one thing the device was to do to its own store: done, or left for the next reading — a play given up whose log changed while it was weighed. */
type Applied = "done" | "left"

const leftWhereChanged = (result: Result<void, DraftError>): Outcome<Applied> =>
  !result.ok && result.error.type === "changed-elsewhere" ? Ok("left") : mapOk(fromDraft(result), () => "done" as const)

const applied = async (ports: PlayLinePorts, action: PlayLineAction): Promise<Outcome<Applied>> => {
  switch (action.type) {
    case "take-up":
      return mapOk(fromDraft(await ports.follow.takeUp(action.followed)), () => "done" as const)
    case "yield-up":
      return leftWhereChanged(await ports.follow.yieldUp(action.playId, action.followed, action.log))
    case "claim-back":
      return leftWhereChanged(await ports.follow.claimBack(action.playId, action.handovers, action.log))
    case "put-followed":
      return mapOk(fromDraft(await ports.follow.putFollowed(action.followed)), () => "done" as const)
    case "drop-followed":
      return mapOk(fromDraft(await ports.follow.dropFollowed(action.playId)), () => "done" as const)
    case "withdraw":
    case "move":
      return Ok("done")
  }
}

/** Everything the device was to do to its own store, in order: what it did, stopping at the first that failed. */
const appliedAll = (ports: PlayLinePorts, actions: readonly PlayLineAction[]): Promise<Outcome<readonly PlayLineAction[]>> =>
  actions.reduce<Promise<Outcome<readonly PlayLineAction[]>>>(async (before, action) => {
    const so = await before
    if (!so.ok) return so
    return mapOk(await applied(ports, action), (done) => (done === "done" ? [...so.value, action] : so.value))
  }, Promise.resolve(Ok([])))

/**
 * Keep the plays as the lines have them: take up what this device
 * claimed, give up what another claimed since, and keep each copy as it
 * was last shown. What the device keeps after it, and what it did.
 */
const followedOn = async (ports: PlayLinePorts, footing: Footing, lines: readonly KeptLine[]): Promise<Outcome<{ readonly kept: Kept; readonly acted: readonly PlayLineAction[] }>> => {
  const kept = await keptOf(ports, footing)
  if (!kept.ok) return kept
  const actions = pastCopiesLetGo(reconcile(standingsOf(lines), kept.value.held, kept.value.followed, footing.me, footing.today).filter(isLocal), kept.value, footing.today)
  if (actions.length === 0) return Ok({ kept: kept.value, acted: [] })
  const done = await appliedAll(ports, actions)
  if (!done.ok) return done
  return mapOk(await keptOf(ports, footing), (after) => ({ kept: after, acted: done.value }))
}

/**
 * What a device says on a book's line of plays it took off the book:
 * deleted since it showed them there today, or recorded into another book
 * now. Said on the business day's line, which every device following the
 * book reads, whichever day the play was last said on.
 */
const saidOn = (ports: PlayLinePorts, footing: Footing, lines: readonly KeptLine[], kept: Kept, at: LineOf, saying: Saying): readonly PlayLineEntry[] =>
  reconcile(standingsOf(onBook(lines, at.bookId)), kept.held, kept.followed, footing.me, footing.today).flatMap((action): readonly PlayLineEntry[] => {
    if (action.type === "withdraw") return [{ type: "withdrawn", by: footing.me, at: ports.now(), playId: action.playId }]
    if (action.type === "move" && saying === "said-and-shown") return [{ type: "moved", by: footing.me, at: ports.now(), playId: action.playId }]
    return []
  })

/** A play as a line's entry has it: what the device holds, read back as any device reads it from the line. */
const asOnLine = (play: ShownPlay): ShownPlay => readShownPlay(JSON.parse(JSON.stringify(play))) ?? play

/**
 * Whether a play this device holds is still to be shown on a line: the
 * book's lines know nothing of it, or it was moved off the book and is
 * back, or this device holds it and showed it otherwise, or on another
 * day — save one recorded on a day gone by, whose copies are let go, so
 * that it is shown once as it is and not again each day — or it was
 * continued here at a later handover than the lines say of. One another
 * device holds is not shown — it is given up — and one deleted is not
 * shown again.
 */
const unshown = (standing: PlayStanding | undefined, play: ShownPlay, at: LineOf, me: DeviceId): boolean => {
  if (standing === undefined) return true
  if (handoversOf(play) > standing.handovers) return true
  if (standing.type === "gone") return standing.reason === "moved"
  if (standing.by !== me) return false
  return (standing.line.day !== at.day && !isPast(play, at.day)) || standing.play === undefined || shownTextOf(play) !== shownTextOf(standing.play)
}

/**
 * Whether a play this device holds is one to show at all: one still of
 * the day's plays, or one recorded on a day gone by that the lines have
 * as this device's, or that it holds again at a later handover than they
 * say of — it is shown once more as recorded, so that its copies are let
 * go as recorded, not as deleted, once it is let go here.
 */
const showable = (draft: PlayDraft, standing: PlayStanding | undefined, footing: Footing): boolean =>
  !isPast(draft, footing.today) || (standing?.type === "held" && (standing.by === footing.me || isAheadOf(draft, standing)))

/**
 * The plays a device holds that are still to be shown on a book's line,
 * each as it is shown there: whole, or as a patch of its last showing on
 * that line.
 */
const shownOn = (ports: PlayLinePorts, footing: Footing, lines: readonly KeptLine[], kept: Kept, at: LineOf): readonly PlayLineEntry[] => {
  const standings = standingsOf(onBook(lines, at.bookId))
  return kept.held
    .filter((each) => each.bookId === at.bookId && showable(each.draft, standings.get(each.draft.id), footing))
    .map((each) => asOnLine(shownPlayOf(each.draft, at.bookId)))
    .filter((play) => unshown(standings.get(play.id), play, at, footing.me))
    .map((play) => showingOf(lineAt(lines, at).entries, footing.me, ports.now(), play))
}

const wantedOn = (ports: PlayLinePorts, footing: Footing, lines: readonly KeptLine[], kept: Kept, at: LineOf, saying: Saying): readonly PlayLineEntry[] => [
  ...saidOn(ports, footing, lines, kept, at, saying),
  ...(saying === "said-and-shown" ? shownOn(ports, footing, lines, kept, at) : []),
]

/** Whether what a device would put on a line takes a play off the book: such a line is written after every other, once the play is shown where it went. */
const takesOff = (entries: readonly PlayLineEntry[]): boolean => entries.some((entry) => entry.type === "moved")

/** The lines a device has something to put on, those that take a play off a book last. */
const linesToWrite = (ports: PlayLinePorts, footing: Footing, lines: readonly KeptLine[], kept: Kept, saying: Saying): readonly SyncLink[] => {
  const wanted = footing.owned.map((link) => ({ link, entries: wantedOn(ports, footing, lines, kept, todayOn(footing, link), saying) })).filter(({ entries }) => entries.length > 0)
  return [...wanted.filter(({ entries }) => !takesOff(entries)), ...wanted.filter(({ entries }) => takesOff(entries))].map(({ link }) => link)
}

/** How many of the sealed entries, from the first, go in one put: at least one, however large, and then as many as keep the body small. */
const batchSize = (sealed: readonly SealedCommitDto[]): number => {
  const totals = sealed.map((entry) => entry.box.length + entry.commitId.length + ENTRY_ROOM).reduce<readonly number[]>((so, size) => [...so, (so.at(-1) ?? BODY_ROOM) + size], [])
  return Math.max(1, totals.filter((total, index) => index < BATCH.entries && total <= BATCH.bytes).length)
}

/** How long a box is, written out, for a packed text of a length: sealed, and then written in base64url. */
const boxLengthOf = (packed: number): number => Math.ceil(((packed + SEALING_BYTES) * 4) / 3)

/** How a device would next show a play it holds: as a patch of its last showing on a line of the business day that has one, or whole. */
const nextShowingOf = (ports: Pick<PlayLinePorts, "now" | "businessDay">, lines: readonly KeptLine[], me: DeviceId, draft: PlayDraft): PlayLineEntry => {
  const line = lines.find((each) => each.day === ports.businessDay() && hasShownOn(each.entries, me, draft.id))
  const play = asOnLine(shownPlayOf(draft, line?.bookId ?? draft.bookId ?? ("" as BookId)))
  return showingOf(line?.entries ?? [], me, ports.now(), play)
}

/**
 * Whether showing the plays a device holds would put a body on a line
 * past what the relay takes as a small one: a play shown whole goes in a
 * body of its own once it is too large to share one, sealed and written
 * out as text — a third again larger than it packs to. A patch of a
 * reading or two is small however long the play has grown; it is the
 * whole showings, the first and every so many after, that are large. Such
 * bodies are let go less often, the relay taking few of them from one
 * address.
 */
export const isLargeShowing = async (ports: Pick<PlayLinePorts, "packer" | "now" | "businessDay" | "device">, lines: readonly KeptLine[], drafts: readonly PlayDraft[]): Promise<boolean> => {
  const me = await ports.device()
  return drafts.some((draft) => {
    const entry = nextShowingOf(ports, lines, me, draft)
    return BODY_ROOM + boxLengthOf(ports.packer.pack(playLineEntryText(entry)).length) + ID_LENGTH + ENTRY_ROOM > BATCH.bytes
  })
}

const sealedOf = (ports: PlayLinePorts, line: SealedLine, entries: readonly PlayLineEntry[]): Promise<Outcome<readonly SealedCommitDto[]>> =>
  sealedEntries(ports, line, entries.map((entry) => ({ commitId: ports.newId(), text: playLineEntryText(entry) })))

/**
 * A line with what this device just put on it, each entry as any device
 * reads it back from the line — a patch taken as the play it makes — so
 * that the next patch is written on the very text every other device has.
 */
const putOn = (kept: KeptLine, entries: readonly PlayLineEntry[], head: number): KeptLine => ({
  ...kept,
  head,
  entries: readOnto(
    kept.entries,
    entries.flatMap((entry, index) => ((read) => (read === undefined ? [] : [{ seq: kept.head + index + 1, entry: read }]))(readPlayLineEntry(playLineEntryText(entry)))),
  ),
})

/**
 * Write what this device has to say on a book's line for the business
 * day, always having read it to its end first: the line read, the plays
 * kept as it has them — given up where another device claimed them — and
 * only then what is still to be said put where the line ends. A line that
 * moved on meanwhile is read again and all of it weighed again; nothing is
 * put blind where another device's entry may have gone first.
 */
const settled = async (ports: PlayLinePorts, footing: Footing, link: SyncLink, so: Followings, saying: Saying, left: number = TRIES): Promise<Outcome<Followings>> => {
  const at = todayOn(footing, link)
  const line = await openLine(ports, link, at.day)
  if (!line.ok) return line
  const read = await readOn(ports, line.value, lineAt(so.lines, at))
  if (!read.ok) return read
  const lines = withLine(so.lines, read.value)
  const followed = await followedOn(ports, footing, lines)
  if (!followed.ok) return followed
  const acted = [...so.acted, ...followed.value.acted]
  const entries = wantedOn(ports, footing, lines, followed.value.kept, at, saying)
  if (entries.length === 0) return Ok({ lines, acted })
  const sealed = await sealedOf(ports, line.value, entries)
  if (!sealed.ok) return sealed
  const batch = batchSize(sealed.value)
  const put = await putAt(ports.relay, line.value, sealed.value.slice(0, batch), read.value.head, PLAYS_KEPT)
  const head = behindAt(put)
  if (head !== undefined) {
    if (left === 0) return problem({ type: "unsettled" })
    return settled(ports, footing, link, { lines: head < read.value.head ? withLine(lines, lineAt([], at)) : lines, acted }, saying, left - 1)
  }
  if (!put.ok) return put
  const written = { lines: withLine(lines, putOn(read.value, entries.slice(0, batch), put.value)), acted }
  return batch < entries.length ? settled(ports, footing, link, written, saying, left) : Ok(written)
}

const settledEach = (ports: PlayLinePorts, footing: Footing, links: readonly SyncLink[], so: Followings, saying: Saying): Promise<Outcome<Followings>> =>
  links.reduce<Promise<Outcome<Followings>>>(async (before, link) => ((done) => (done.ok ? settled(ports, footing, link, done.value, saying) : done))(await before), Promise.resolve(Ok(so)))

/**
 * Bring the plays this device keeps in line with the lines just read: a
 * play another device claimed is given up for the line's copy of it, and
 * how many of this device's readings never reached the line is told; a
 * copy is kept as it was last shown, and let go where the play was taken
 * off its book; a play this device claimed is taken up. A play this device
 * deleted, or now records into another book, is taken off the line it was
 * on, the line read to its end first.
 */
export const followPlays = async (ports: PlayLinePorts, lines: readonly KeptLine[]): Promise<Outcome<Followings>> => {
  const syncing = await syncingFooting(ports)
  if (!syncing.ok) return syncing
  const footing = syncing.value
  if (footing === undefined) return Ok({ lines, acted: [] })
  const followed = await followedOn(ports, footing, lines)
  if (!followed.ok) return followed
  const moving = footing.owned.some((link) => takesOff(saidOn(ports, footing, lines, followed.value.kept, todayOn(footing, link), "said-and-shown")))
  const saying: Saying = moving ? "said-and-shown" : "withdrawn"
  return settledEach(ports, footing, linesToWrite(ports, footing, lines, followed.value.kept, saying), { lines, acted: followed.value.acted }, saying)
}

/**
 * Show the plays this device holds on their books' lines for the business
 * day, as they now stand, wherever a line has them otherwise or not at
 * all: each line read to its end first, so that a play another device
 * claimed meanwhile is given up rather than shown. A play that goes to a
 * book this device does not sync as its owner's is shown nowhere.
 */
export const showHeldPlays = async (ports: PlayLinePorts, lines: readonly KeptLine[]): Promise<Outcome<Followings>> => {
  const syncing = await syncingFooting(ports)
  if (!syncing.ok) return syncing
  const footing = syncing.value
  if (footing === undefined) return Ok({ lines, acted: [] })
  const kept = await keptOf(ports, footing)
  if (!kept.ok) return kept
  return settledEach(ports, footing, linesToWrite(ports, footing, lines, kept.value, "said-and-shown"), { lines, acted: [] }, "said-and-shown")
}

/**
 * Show what is still to be shown as the page is put away — the device may
 * not come back to it — where each line was last seen to end, without
 * reading it first or trying again. Should another device have claimed a
 * play meanwhile, what this puts there is from a device that no longer
 * holds it, and every device reading the line passes over it. A play is
 * not taken off a book here: the lines are put on all at once, and one
 * shown where it went may not have got there.
 */
export const flushOnHide = async (ports: PlayLinePorts, lines: readonly KeptLine[]): Promise<void> => {
  const syncing = await syncingFooting(ports)
  const footing = syncing.ok ? syncing.value : undefined
  if (footing === undefined) return
  const kept = await keptOf(ports, footing)
  if (!kept.ok) return
  await Promise.all(
    footing.owned.map(async (link) => {
      const at = todayOn(footing, link)
      const entries = wantedOn(ports, footing, lines, kept.value, at, "said-and-shown").filter((entry) => entry.type !== "moved")
      if (entries.length === 0) return
      const line = await openLine(ports, link, at.day)
      const sealed = line.ok ? await sealedOf(ports, line.value, entries) : line
      if (line.ok && sealed.ok) await putAt(ports.relay, line.value, sealed.value.slice(0, batchSize(sealed.value)), lineAt(lines, at).head, PLAYS_KEPT)
    }),
  )
}

/** A book's lines of some days read from their start, all at once: the first that cannot be read stops it. */
const readAfresh = async (ports: PlayLinePorts, link: SyncLink, days: readonly IsoDate[]): Promise<Outcome<readonly KeptLine[]>> => {
  const read = await Promise.all(days.map((day) => readKept(ports, link, lineAt([], { bookId: link.bookId, day }))))
  return read.reduce<Outcome<readonly KeptLine[]>>((so, line) => (so.ok ? mapOk(line, (each) => [...so.value, each]) : so), Ok([]))
}

/**
 * Claim a play on its book's line for the business day: the line read to
 * its end, the copy brought up to the latest the holder showed, and the
 * claim put where the line ends — read again and weighed again should it
 * have moved on. The copy as it stood when the claim went on the line.
 */
const claimed = async (ports: PlayLinePorts, footing: Footing, link: SyncLink, copy: Followed, left: number): Promise<Outcome<{ readonly copy: Followed; readonly lines: readonly KeptLine[] }>> => {
  const lines = await readAfresh(ports, link, [...new Set([copy.line.day, footing.today])])
  if (!lines.ok) return lines
  const standing = standingsOf(lines.value).get(copy.id)
  if (standing?.type === "gone") {
    await ports.follow.dropFollowed(copy.id)
    return Err({ type: "play-gone", playId: copy.id, reason: standing.reason })
  }
  const fresh: Followed = standing?.type === "held" && standing.play !== undefined && standing.shownAt !== undefined ? { ...copy, play: standing.play, holder: standing.by, shownAt: standing.shownAt, line: standing.line } : copy
  const handovers = Math.max(standing?.handovers ?? 0, handoversOf(fresh.play))
  if (standing?.type === "held" && standing.by === footing.me) return Ok({ copy: { ...fresh, play: { ...fresh.play, handovers } }, lines: lines.value })
  const today = lineAt(lines.value, todayOn(footing, link))
  const line = await openLine(ports, link, footing.today)
  if (!line.ok) return line
  const claim: PlayLineEntry = { type: "claimed", by: footing.me, at: ports.now(), playId: copy.id, handovers: handovers + 1 }
  const sealed = await sealedOf(ports, line.value, [claim])
  if (!sealed.ok) return sealed
  const put = await putAt(ports.relay, line.value, sealed.value, today.head, PLAYS_KEPT)
  if (behindAt(put) !== undefined) return left > 0 ? claimed(ports, footing, link, fresh, left - 1) : problem({ type: "unsettled" })
  return put.ok ? Ok({ copy: { ...fresh, play: { ...fresh.play, handovers: claim.handovers } }, lines: withLine(lines.value, putOn(today, [claim], put.value)) }) : put
}

/**
 * Continue on this device a play another of the owner's devices holds:
 * claimed on its book's line, at the handover after the one the play is
 * at, then taken up as this device's own, as its holder last showed it,
 * and shown at once. The other device gives it up the next time it reads
 * the line or would write to it — or, should it never read the line the
 * claim is on, the next time it reads one this device has shown the play
 * on since. Which device claimed last is the relay's to say, so a device
 * that cannot reach it cannot claim. The play as this device now holds it.
 */
export const continueHere = async (ports: PlayLinePorts, id: PlayId): Promise<Outcome<PlayDraft>> => {
  const footing = await footingOf(ports)
  if (!footing.ok) return footing
  const copy = fromDraft(await ports.follow.readFollowed(id))
  if (!copy.ok) return copy
  if (copy.value === undefined) return fromDraft(await ports.drafts.readDraft(id))
  const link = footing.value.owned.find((each) => each.bookId === copy.value?.line.bookId)
  if (link === undefined) return problem({ type: "not-linked" })
  const claim = await claimed(ports, footing.value, link, copy.value, TRIES)
  if (!claim.ok) return claim
  const taken = fromDraft(await ports.follow.takeUp(claim.value.copy))
  if (!taken.ok) return taken
  await settled(ports, footing.value, link, { lines: claim.value.lines, acted: [] }, "said-and-shown")
  return taken
}

/**
 * Whether this device still holds a play it is about to record: its
 * book's lines read, all at once, where they can be — the play's own day's
 * with them where it was left over — and the play given up should another
 * device have claimed it meanwhile: recording it here would record what
 * that device no longer plays. A play recorded here before is held again
 * instead, where the other device took it from a showing not yet recorded.
 * A line that cannot be reached, or a play no line knows, is recorded
 * here: the device's own word stands where nothing says otherwise.
 */
export const heldBeforeFinishing = async (ports: PlayLinePorts, draft: PlayDraft): Promise<Outcome<void>> => {
  const footing = await footingOf(ports)
  if (!footing.ok) return Ok(undefined)
  const bookId = syncedBookOf(ports, footing.value, draft)
  const link = footing.value.owned.find((each) => each.bookId === bookId)
  if (link === undefined) return Ok(undefined)
  const lines = await readAfresh(ports, link, daysOfPlay(draft, footing.value.today))
  if (!lines.ok) return Ok(undefined)
  const standing = standingsOf(lines.value).get(draft.id)
  if (standing?.type !== "held" || standing.by === footing.value.me || isAheadOf(draft, standing)) return Ok(undefined)
  const followed = await followedOn(ports, footing.value, lines.value)
  if (!followed.ok) return followed
  return followed.value.acted.some((action) => action.type === "claim-back") ? Ok(undefined) : heldElsewhere(draft.id)
}

/**
 * Show a play left over from a day gone by as recorded, as soon as it is:
 * it is let go of on this device the next time the day's plays are
 * listed, and the devices following it are to let their copies go as
 * recorded rather than deleted. A play of the day is shown by the runner
 * as any write is, the person not kept waiting on the relay for it.
 */
const shownRecorded = async (ports: PlayLinePorts, draft: PlayDraft): Promise<void> => {
  if (!isLeftOver(draft, ports.businessDay())) return
  const footing = await footingOf(ports)
  if (!footing.ok) return
  const link = footing.value.owned.find((each) => each.bookId === syncedBookOf(ports, footing.value, draft))
  if (link === undefined) return
  const lines = await readAfresh(ports, link, daysOfPlay(draft, footing.value.today))
  if (lines.ok) await settled(ports, footing.value, link, { lines: lines.value, acted: [] }, "said-and-shown")
}

/**
 * The plays recorded through it, with a play claimed back where another
 * device claimed it while it was being recorded. Recording writes the
 * book first and marks the play recorded after: should the play have been
 * given up between the two, the book has it as this device's log made it,
 * so the play is claimed back and marked recorded as that log, rather than
 * left to be recorded a second time from the copy the other device holds.
 * Where it cannot be claimed back, the mark is refused as before.
 */
const claimingBack = (ports: PlayLinePorts, drafts: DraftStorage): DraftStorage => ({
  ...drafts,
  updateDraft: async (draft, previousLog) => {
    const marked = await drafts.updateDraft(draft, previousLog)
    if (marked.ok || marked.error.type !== "held-elsewhere") return marked
    const back = await continueHere(ports, draft.id)
    return back.ok ? drafts.updateDraft(draft, back.value.log) : marked
  },
})

/** A recording as it went, the play shown as recorded first where it went into the book. */
const afterRecording = async <T>(ports: PlayLinePorts, draft: PlayDraft, recorded: Outcome<T>): Promise<Outcome<T>> => {
  if (recorded.ok) await shownRecorded(ports, draft)
  return recorded
}

/** Recording a play, as the screens are given it: only while this device still holds the play. */
export interface HeldFinishing {
  readonly finishPlay: typeof finishPlay
  readonly finishPlayInYen: typeof finishPlayInYen
}

/** Recording a play, each way, with whether this device still holds it asked first. */
export const finishingHeld = (ports: PlayLinePorts): HeldFinishing => ({
  finishPlay: async (session, drafts, draft, bookId, tally, finish, at) => {
    const held = await heldBeforeFinishing(ports, draft)
    return held.ok ? afterRecording(ports, draft, await finishPlay(session, claimingBack(ports, drafts), draft, bookId, tally, finish, at)) : held
  },
  finishPlayInYen: async (session, drafts, draft, bookId, tally, finish, at, tokens) => {
    const held = await heldBeforeFinishing(ports, draft)
    return held.ok ? afterRecording(ports, draft, await finishPlayInYen(session, claimingBack(ports, drafts), draft, bookId, tally, finish, at, tokens)) : held
  },
})

/** A play this device has open, as it has it: its own, or a copy of one another device holds. */
export const loadLivePlay = async (drafts: DraftStorage, follow: FollowStorage, id: PlayId): Promise<Outcome<LivePlayHold>> => {
  const draft = await drafts.readDraft(id)
  if (draft.ok) return Ok({ type: "held", draft: draft.value })
  if (draft.error.type !== "held-elsewhere") return fromDraft(draft)
  const followed = fromDraft(await follow.readFollowed(id))
  if (!followed.ok) return followed
  return followed.value === undefined ? fromDraft(draft) : Ok({ type: "followed", followed: followed.value })
}

/** The copies of plays the owner's other devices hold that are the day's: one recorded on a day gone by is in its book, and is let go of here. */
export const loadFollowedToday = async (follow: FollowStorage, businessDay: IsoDate): Promise<Outcome<readonly Followed[]>> => {
  const found = fromDraft(await follow.listFollowed())
  if (!found.ok) return found
  await Promise.all(found.value.filter((each) => isPast(each.play, businessDay)).map((each) => follow.dropFollowed(each.id)))
  return Ok(found.value.filter((each) => !isPast(each.play, businessDay)))
}
