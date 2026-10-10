import { bookInUse, memberCan, type Book, type BookId, type MemberId } from "../book/book"
import type * as Pachinko from "../pachinko"
import type { IsoDate } from "../calendar/calendar"
import type { MachineBonus } from "../catalog/catalog"
import type * as Pachislot from "../pachislot"
import type { Parlor } from "../parlor/parlor"
import { tokenValueOf, type PlayTerms } from "../parlor/terms"
import type { PlayGameKind, PlayHead, PlayId } from "../play/play"
import type { Checkpoint } from "../play-log/checkpoint"
import type { End } from "../play-log/end"
import type { PlayLogHead } from "../play-log/head"
import { appendCheckpoint } from "../play-log/checkpoint"

/**
 * A play still being played: work in hand on this device, not yet part of any
 * book, and nothing of it is written in one until it is recorded. Which book
 * it goes into is said only then, and its parlor's pool is opened there as
 * it is written — or it has no parlor, and is recorded by its result in yen
 * alone. It becomes the book's entry and its play log only when it is recorded.
 *
 * `log` is the play log's JSONL text itself, so what is recorded is exactly
 * what was kept.
 */
export interface PlayDraft {
  readonly id: PlayId
  /**
   * The book said for the play: the one chosen as it is recorded, the one
   * it was sent to, and, once recorded, the one that has it. Absent until
   * one is said — a play is started with none.
   */
  readonly bookId?: BookId
  readonly date: IsoDate
  readonly venue: PlayVenue
  readonly gameKind: PlayGameKind
  readonly machine: string
  /**
   * What a pachinko play from the catalog is weighed by: its formula, as it
   * was when the play began. None for a machine typed in by name, or for a
   * pachislot play, which keeps its own in `pachislot`.
   */
  readonly pachinko: Pachinko.FormulaSnapshot | undefined
  /**
   * The bonuses a pachinko play's machine lists, as they were when the play
   * began: what a jackpot is chosen from, offline, whatever happens to the
   * catalog meanwhile. Absent from drafts kept before machines listed any.
   */
  readonly bonuses?: readonly MachineBonus[]
  /**
   * What a pachislot play from the catalog is weighed by: its formula and its
   * prior, as they were when it began. Absent for a machine typed in by name,
   * and from drafts kept before pachislot formulas were.
   */
  readonly pachislot?: Pachislot.Weighing
  readonly cabinetNumber: string | undefined
  /** When the play began, as an ISO 8601 timestamp. */
  readonly startedAt: string
  readonly log: string
  /**
   * Everything done to the play's log since it began, oldest first and only
   * ever added to: each change of it, with the lines it took away and those
   * it put in. It goes wherever the play is sent, and is shown to whoever
   * receives it, never on the device that keeps it.
   */
  readonly history?: readonly Operation[]
  /**
   * The book has the play: when it was last recorded there, and how it was
   * said to have ended. A recorded play stays among the day's plays, its
   * log still to be set right and the book's entry made again from it.
   */
  readonly recorded?: { readonly at: string; readonly end: End }
  /** Where the play was sent, each with the log as it then was: a play sent and changed since is told from one sent as it stands. */
  readonly sent?: readonly Sending[]
  /** The play was sent to this device by someone else: who, as the owner named them, and the log as it arrived — a play not touched since is one a later sending may replace. */
  readonly received?: Receipt
}

/** One change to a play's log: when, and its lines before and after. */
export interface Operation {
  /** ISO 8601. */
  readonly at: string
  readonly removed: readonly string[]
  readonly added: readonly string[]
}

/** A play as it was put on someone's inbox. */
export interface Sending {
  readonly lineId: string
  readonly at: string
  readonly log: string
}

/** How a play came to this device from someone else's. */
export interface Receipt {
  /** Who sent it, by the name the book's owner gave them; none where the device does not remember the token it came by. */
  readonly sender: string | undefined
  /** The log as it arrived. */
  readonly log: string
  /** How the sender said the play ended, where they had recorded it before sending. */
  readonly ended: End | undefined
  /**
   * The same play, sent again after this device had changed the one it
   * had: kept beside it until the person chooses between them, since
   * neither is written over the other unasked.
   */
  readonly again?: PlayDraft
}

/**
 * Where a play is: a parlor, on the terms of the corner played — which make
 * its pool and value its tokens — or no parlor, with terms only if they were
 * given, for the theoretical value alone.
 */
export type PlayVenue =
  | { readonly type: "parlor"; readonly parlor: Parlor; readonly terms: PlayTerms }
  | { readonly type: "none"; readonly terms: PlayTerms | undefined }

/**
 * The book a play is recorded into: the one said for it, where this member
 * may still write it, or else the book in use. None where the member may
 * write no book.
 */
export const bookOf = (draft: PlayDraft, books: readonly Book[], member: MemberId): BookId | undefined =>
  books.some((book) => book.id === draft.bookId && memberCan(book, member, "write")) ? draft.bookId : bookInUse(books, member)

/**
 * The head a play's log is given as it is recorded: the play as its entry
 * in the book says it — its day, machine, cabinet and parlor, which the
 * recording screen may have set right — with what only the play knows:
 * when it began, its corner's terms, and what it was weighed by.
 */
export const headOf = (draft: PlayDraft, entry: PlayHead & { readonly parlor: Parlor | undefined }): PlayLogHead => ({
  playId: entry.id,
  gameKind: entry.gameKind,
  date: entry.date,
  startedAt: draft.startedAt,
  parlor: entry.parlor === undefined ? undefined : { name: entry.parlor.name, identity: entry.parlor.identity },
  terms: draft.venue.terms,
  machine: entry.machine,
  cabinetNumber: entry.cabinetNumber,
  formulaId: draft.pachinko?.id ?? draft.pachislot?.formula.id,
  prior: draft.pachislot === undefined ? undefined : draft.pachislot.prior.type === "even" ? { type: "even" } : { type: "distribution", id: draft.pachislot.prior.id },
})

/** The parlor a play is at, if it is at one. */
export const parlorOf = (draft: PlayDraft): Parlor | undefined => (draft.venue.type === "parlor" ? draft.venue.parlor : undefined)

/** Yen a token of the play is worth by its terms, when it has terms. */
export const tokenValueOfDraft = (draft: PlayDraft): number | undefined =>
  draft.venue.terms === undefined ? undefined : tokenValueOf(draft.venue.terms)

/** The draft with more lines at the end of its log. */
export const withCheckpoints = (draft: PlayDraft, checkpoints: readonly Checkpoint[]): PlayDraft => ({
  ...draft,
  log: checkpoints.reduce(appendCheckpoint, draft.log),
})

/** The draft with its log made of these checkpoints and no others: a reading set right or taken away. */
export const withLog = (draft: PlayDraft, checkpoints: readonly Checkpoint[]): PlayDraft => ({ ...draft, log: checkpoints.reduce(appendCheckpoint, "") })

const linesOf = (log: string): readonly string[] => log.split("\n").filter((line) => line.trim() !== "")

/** How close in time two changes of one line must be to count as one: a count tapped up and up is one change, not twenty. */
const ONE_CHANGE_WITHIN = 120_000

/** Whether an operation is a further change of the one line the last operation left: the same reading, still being set. */
const continues = (last: Operation, next: Operation): boolean =>
  last.added.length === 1 && next.removed.length === 1 && next.added.length === 1 && last.added[0] === next.removed[0] && Date.parse(next.at) - Date.parse(last.at) < ONE_CHANGE_WITHIN

/**
 * A draft with a change of its log written into its history: the lines the
 * change took away and those it put in. A log that reads as it did is no
 * change. A line changed again straight after it was changed is still the
 * one change, from what it first was to what it now is.
 */
export const withOperation = (draft: PlayDraft, previousLog: string, at: string): PlayDraft => {
  const [before, after] = [linesOf(previousLog), linesOf(draft.log)]
  const operation: Operation = { at, removed: before.filter((line) => !after.includes(line)), added: after.filter((line) => !before.includes(line)) }
  if (operation.removed.length === 0 && operation.added.length === 0) return draft
  const history = draft.history ?? []
  const last = history.at(-1)
  return last !== undefined && continues(last, operation)
    ? { ...draft, history: [...history.slice(0, -1), { at, removed: last.removed, added: operation.added }] }
    : { ...draft, history: [...history, operation] }
}

/** Whether a play still to be recorded began on a business day before this one: left over, and to be said so. */
export const isLeftOver = (draft: PlayDraft, businessDay: IsoDate): boolean => draft.recorded === undefined && draft.date < businessDay

/** Whether a play is done with on this device: recorded, on a business day before this one. It is in its book, and leaves the day's list. */
export const isPast = (draft: PlayDraft, businessDay: IsoDate): boolean => draft.recorded !== undefined && draft.date < businessDay

/** Whether a play was sent to an inbox as it now stands: sent, and not changed since. */
export const isSentAsItStands = (draft: PlayDraft, lineId: string): boolean => draft.sent?.findLast((sending) => sending.lineId === lineId)?.log === draft.log

/**
 * The operations of a play made after it was said to have ended: what was
 * changed once the play was over. For a play someone sent, the end is the
 * one its sender gave and the changes theirs, whatever the receiver does
 * with it since.
 */
export const afterItEnded = (draft: PlayDraft): readonly Operation[] => {
  const ended = draft.received === undefined ? draft.recorded?.end.at : draft.received.ended?.at
  return ended === undefined ? [] : (draft.history ?? []).filter((operation) => operation.at > ended)
}
