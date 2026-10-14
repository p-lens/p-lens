import type { BookId, MemberId, ListedBook } from "../core/book/book"
import { memberCan } from "../core/book/book"
import type { IsoDate } from "../core/calendar/calendar"
import { bookOf, headOf, isPast, withCabinetNumber, withCheckpoints, withLog, withMachine, type MachineChange, type PlayDraft } from "../core/live-play/draft"
import { exchangeRateOf, poolOf, type PlayTerms } from "../core/parlor/terms"
import type { TokenTally, YenTally } from "../core/tally/tally"
import type { PlayId } from "../core/play/play"
import type { Checkpoint } from "../core/play-log/checkpoint"
import { withFinish, type Finish } from "../core/play-log/finish"
import { withHead } from "../core/play-log/head"
import { Err, Ok, mapOk } from "../core/result/result"
import type { CommitId } from "../history/port/history-port"
import type { DraftStorage } from "../storage/port/draft-storage"
import type { BookSession } from "./book-session"
import type { Outcome } from "./errors"
import { fromDraft } from "./lift"
import { openPool } from "./parlors"
import { loadRecordingContext, recordTokenTally, recordYenTally, type RecordingContext } from "./record-tally"
import { reviseTokenTally, reviseYenTally } from "./revise-tally"

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
 * Say anew which cabinet a play is at and, where it was begun on the wrong
 * one, which machine it is on: only the play changes — it is still the
 * device's — and everything weighed from its readings is weighed anew by
 * the machine it now names. Written against the log as it was read.
 */
export const changeCabinet = async (drafts: DraftStorage, draft: PlayDraft, change: { readonly cabinetNumber: string | undefined; readonly machine: MachineChange | undefined }): Promise<Outcome<PlayDraft>> => {
  const numbered = withCabinetNumber(draft, change.cabinetNumber)
  const next = change.machine === undefined ? numbered : withMachine(numbered, change.machine)
  return mapOk(fromDraft(await drafts.updateDraft(next, draft.log)), () => next)
}

/**
 * Give up a play in progress: its draft is let go of, readings and all,
 * and nothing of it reaches a book. Only ever because a person asked.
 */
export const abandonPlay = async (drafts: DraftStorage, id: PlayId): Promise<Outcome<void>> => fromDraft(await drafts.deleteDraft(id))

/**
 * Keep a play among the day's once the book has it, marked as recorded with
 * how it was said to have finished: its log is still to be set right, and the
 * book's entry made again from it. A refused record leaves the play as it
 * was.
 */
const keptRecorded = async (drafts: DraftStorage, draft: PlayDraft, bookId: BookId, finish: Finish, at: string, recorded: Outcome<CommitId>): Promise<Outcome<CommitId>> => {
  if (!recorded.ok) return recorded
  const kept = fromDraft(await drafts.updateDraft({ ...draft, bookId, recorded: { at, finish } }, draft.log))
  return kept.ok ? Ok(recorded.value) : kept
}

/** A play the book already has, written again in place of what it has; where the book has it no longer — it was taken out there — written as new. */
const again = async (revise: () => Promise<Outcome<CommitId>>, record: () => Promise<Outcome<CommitId>>): Promise<Outcome<CommitId>> => {
  const revised = await revise()
  return !revised.ok && revised.error.type === "tally-missing" ? record() : revised
}

/**
 * What recording a play that was followed live starts from: the play, the
 * book it goes into — the one said for it, or else the book in use — the
 * books it may go into instead, and what that book knows.
 */
export interface Finishing {
  readonly draft: PlayDraft
  readonly bookId: BookId
  readonly books: readonly ListedBook[]
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
 * Record a finished play into a book as a tally in tokens, its log —
 * finished as the person gave, and headed by what the play was — beside the
 * tally's entry. This is when the book first hears of the play: the pool
 * of the parlor the tally names — where it was started, or one chosen as it
 * is recorded of a play started at none — is opened there on the play's
 * terms, with the rate of the day it is recorded on, and then the entry is
 * written. Its savings are drawn on whatever they hold. Recorded before, its entry and its
 * log in the book are replaced by what the play now comes to: a reading
 * set right after the fact reaches the book by recording again.
 */
export const finishPlay = async (session: BookSession, drafts: DraftStorage, draft: PlayDraft, bookId: BookId, tally: TokenTally, finish: Finish, at: string): Promise<Outcome<CommitId>> => {
  const terms = draft.venue.terms
  if (terms !== undefined) {
    const opened = await openPool(session, bookId, { identity: tally.parlor.identity, parlorName: tally.parlor.name, pool: poolOf(draft.gameKind, terms), rate: exchangeRateOf(terms), date: tally.date })
    if (!opened.ok) return opened
  }
  const log = withHead(withFinish(draft.log, finish, draft.gameKind), headOf(draft, tally))
  const write = (): Promise<Outcome<CommitId>> => recordTokenTally(session, bookId, tally, log)
  return keptRecorded(drafts, draft, bookId, finish, at, draft.recorded === undefined ? await write() : await again(() => reviseTokenTally(session, bookId, tally, log), write))
}

/** Record a finished play with no parlor as a tally in yen, as `finishPlay` records one at a parlor in tokens: its log beside the tally's entry, and both replaced where the book already has the tally. */
export const finishPlayInYen = async (session: BookSession, drafts: DraftStorage, draft: PlayDraft, bookId: BookId, tally: YenTally, finish: Finish, at: string): Promise<Outcome<CommitId>> => {
  const log = withHead(withFinish(draft.log, finish, draft.gameKind), headOf(draft, tally))
  const write = (): Promise<Outcome<CommitId>> => recordYenTally(session, bookId, tally, log)
  return keptRecorded(drafts, draft, bookId, finish, at, draft.recorded === undefined ? await write() : await again(() => reviseYenTally(session, bookId, tally, log), write))
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
