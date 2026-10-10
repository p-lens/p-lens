import type { BookId, MemberId, TitledBook } from "../core/book/book"
import { memberCan } from "../core/book/book"
import type { IsoDate } from "../core/calendar/calendar"
import { bookOf, headOf, isPast, withCheckpoints, withLog, type PlayDraft } from "../core/live-play/draft"
import { exchangeRateOf, poolOf, type PlayTerms } from "../core/parlor/terms"
import type { PlayId, PlayRecord, TalliedPlay } from "../core/play/play"
import type { Checkpoint } from "../core/play-log/checkpoint"
import { withEnd, type End } from "../core/play-log/end"
import { withHead } from "../core/play-log/head"
import { Err, Ok, mapOk } from "../core/result/result"
import type { CommitId } from "../history/port/history-port"
import type { DraftStorage } from "../storage/port/draft-storage"
import type { BookSession } from "./book-session"
import type { Outcome } from "./errors"
import { fromDraft } from "./lift"
import { openPool } from "./parlors"
import { loadRecordingContext, recordPlay, recordTalliedPlay, type RecordingContext } from "./record-play"
import { revisePlay, reviseTalliedPlay } from "./revise-play"

export const loadDrafts = async (drafts: DraftStorage): Promise<Outcome<readonly PlayDraft[]>> =>
  mapOk(fromDraft(await drafts.listDrafts()), (found) => found.toSorted((left, right) => right.startedAt.localeCompare(left.startedAt)))

export const loadDraft = async (drafts: DraftStorage, id: PlayId): Promise<Outcome<PlayDraft>> => fromDraft(await drafts.readDraft(id))

export const startPlay = async (drafts: DraftStorage, draft: PlayDraft): Promise<Outcome<PlayDraft>> =>
  mapOk(fromDraft(await drafts.createDraft(draft)), () => draft)

/**
 * Add checkpoints to a play in progress. Written against the log as it was
 * read, so a line another tab wrote meanwhile is reported, not overwritten.
 */
export const addCheckpoints = async (
  drafts: DraftStorage,
  draft: PlayDraft,
  checkpoints: readonly Checkpoint[],
): Promise<Outcome<PlayDraft>> => {
  const next = withCheckpoints(draft, checkpoints)
  return mapOk(fromDraft(await drafts.updateDraft(next, draft.log)), () => next)
}

/**
 * Put a play in progress's log in place of the one it has: a reading set
 * right or taken away, and every line after it made again. A draft is work
 * in hand on this device, so its log may be rewritten; the book has what
 * the play came to when it was last recorded, and is given the rest by
 * recording it again. Written against the log
 * as it was read, like any other change.
 */
export const reviseCheckpoints = async (drafts: DraftStorage, draft: PlayDraft, checkpoints: readonly Checkpoint[]): Promise<Outcome<PlayDraft>> => {
  const next = withLog(draft, checkpoints)
  return mapOk(fromDraft(await drafts.updateDraft(next, draft.log)), () => next)
}

/**
 * Say a play is played on other terms than it was started with: the corner
 * was another one, or its board was misread. Only the play changes — it is
 * still the device's, and no book has heard of its terms — and everything
 * counted from its readings is counted anew on them.
 */
export const changeTerms = async (drafts: DraftStorage, draft: PlayDraft, terms: PlayTerms): Promise<Outcome<PlayDraft>> => {
  const next: PlayDraft = { ...draft, venue: draft.venue.type === "parlor" ? { ...draft.venue, terms } : { type: "none", terms } }
  return mapOk(fromDraft(await drafts.updateDraft(next, draft.log)), () => next)
}

/**
 * Give up a play in progress: its draft is let go of, readings and all,
 * and nothing of it reaches a book. Only ever because a person asked.
 */
export const abandonPlay = async (drafts: DraftStorage, id: PlayId): Promise<Outcome<void>> => fromDraft(await drafts.deleteDraft(id))

/**
 * Keep a play among the day's once the book has it, marked as recorded with
 * how it was said to have ended: its log is still to be set right, and the
 * book's entry made again from it. A refused record leaves the play as it
 * was.
 */
const keptRecorded = async (drafts: DraftStorage, draft: PlayDraft, bookId: BookId, end: End, at: string, recorded: Outcome<CommitId>): Promise<Outcome<CommitId>> => {
  if (!recorded.ok) return recorded
  const kept = fromDraft(await drafts.updateDraft({ ...draft, bookId, recorded: { at, end } }, draft.log))
  return kept.ok ? Ok(recorded.value) : kept
}

/** A play the book already has, written again in place of what it has; where the book has it no longer — it was taken out there — written as new. */
const again = async (revise: () => Promise<Outcome<CommitId>>, record: () => Promise<Outcome<CommitId>>): Promise<Outcome<CommitId>> => {
  const revised = await revise()
  return !revised.ok && revised.error.type === "play-missing" ? record() : revised
}

/**
 * What recording a play that was followed live starts from: the play, the
 * book it goes into — the one said for it, or else the book in use — the
 * books it may go into instead, and what that book knows.
 */
export interface Finishing {
  readonly draft: PlayDraft
  readonly bookId: BookId
  readonly books: readonly TitledBook[]
  readonly context: RecordingContext
}

/** A play about to be recorded, with the book it goes into. A member who may write no book has nowhere to record it. */
export const loadFinishing = async (session: BookSession, drafts: DraftStorage, id: PlayId, member: MemberId): Promise<Outcome<Finishing>> => {
  const draft = await loadDraft(drafts, id)
  if (!draft.ok) return draft
  const books = await session.books()
  if (!books.ok) return books
  const bookId = bookOf(draft.value, books.value, member)
  if (bookId === undefined) return Err({ type: "forbidden", capability: "write" })
  return mapOk(await loadRecordingContext(session, bookId, member), (context) => ({
    draft: draft.value,
    bookId,
    books: books.value.filter((book) => memberCan(book, member, "write")),
    context,
  }))
}

/**
 * Say which book a play is to be recorded into, in place of the one it
 * would go into unasked. Nothing is written in either book: the play is
 * still the device's. One already recorded stays where it is.
 */
export const chooseBook = async (drafts: DraftStorage, draft: PlayDraft, bookId: BookId): Promise<Outcome<PlayDraft>> => {
  if (draft.recorded !== undefined || draft.bookId === bookId) return Ok(draft)
  const chosen: PlayDraft = { ...draft, bookId }
  return mapOk(fromDraft(await drafts.updateDraft(chosen, draft.log)), () => chosen)
}

/**
 * Record a finished play into a book, its log — ended as the person gave,
 * and headed by what the play was — beside the entry. This is when the book first hears of the play: its
 * parlor's pool is opened there, with the rate of the day it is recorded
 * on, and then the entry is written. Recorded before, its entry and its
 * log in the book are replaced by what the play now comes to: a reading
 * set right after the fact reaches the book by recording again.
 */
export const finishPlay = async (session: BookSession, drafts: DraftStorage, draft: PlayDraft, bookId: BookId, record: PlayRecord, end: End, at: string): Promise<Outcome<CommitId>> => {
  if (draft.venue.type === "parlor") {
    const { parlor, terms } = draft.venue
    const opened = await openPool(session, bookId, { identity: parlor.identity, parlorName: parlor.name, pool: poolOf(draft.gameKind, terms), rate: exchangeRateOf(terms), date: record.date })
    if (!opened.ok) return opened
  }
  const log = withHead(withEnd(draft.log, end, draft.gameKind), headOf(draft, record))
  const write = (): Promise<Outcome<CommitId>> => recordPlay(session, bookId, record, log)
  return keptRecorded(drafts, draft, bookId, end, at, draft.recorded === undefined ? await write() : await again(() => revisePlay(session, bookId, record, log), write))
}

/** Record a finished play with no parlor by its result in yen, as `finishPlay` records one at a parlor: its log beside the entry, and both replaced where the book already has the play. */
export const finishTalliedPlay = async (session: BookSession, drafts: DraftStorage, draft: PlayDraft, bookId: BookId, play: TalliedPlay, end: End, at: string): Promise<Outcome<CommitId>> => {
  const log = withHead(withEnd(draft.log, end, draft.gameKind), headOf(draft, play))
  const write = (): Promise<Outcome<CommitId>> => recordTalliedPlay(session, bookId, play, log)
  return keptRecorded(drafts, draft, bookId, end, at, draft.recorded === undefined ? await write() : await again(() => reviseTalliedPlay(session, bookId, play, log), write))
}

/**
 * The day's plays, newest begun first: every play on the device still to be
 * recorded, however long ago it began, and those recorded this business
 * day. A play recorded on a day before this one is in its book and is let
 * go of here, which is when a play's draft ends.
 */
export const loadTodaysPlays = async (drafts: DraftStorage, businessDay: IsoDate): Promise<Outcome<readonly PlayDraft[]>> => {
  const found = await loadDrafts(drafts)
  if (!found.ok) return found
  await Promise.all(found.value.filter((draft) => isPast(draft, businessDay)).map((draft) => drafts.deleteDraft(draft.id)))
  return Ok(found.value.filter((draft) => !isPast(draft, businessDay)))
}
