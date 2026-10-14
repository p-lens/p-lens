import { bookInUse, memberCan, type Book, type BookId, type MemberId } from "../book/book"
import type * as Pachinko from "../pachinko"
import type { IsoDate } from "../calendar/calendar"
import type { MachineBonus } from "../catalog/catalog"
import type * as Pachislot from "../pachislot"
import type { Parlor } from "../parlor/parlor"
import { tokenValueOf, type PlayTerms } from "../parlor/terms"
import type { Sender, TallyHead } from "../tally/tally"
import type { PlayGameKind, PlayId } from "../play/play"
import type { Checkpoint } from "../play-log/checkpoint"
import type { Finish } from "../play-log/finish"
import type { PlayLogHead } from "../play-log/head"
import { appendCheckpoint } from "../play-log/checkpoint"

/**
 * A play still being played: work in hand on this device, not yet part of any
 * book, and nothing of it is written in one until it is recorded. Which book
 * it goes into is said only then, and its parlor's pool is opened there as
 * it is written — or it has no parlor, and is recorded by its totals in yen
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
   * said to have finished. A recorded play stays among the day's plays, its
   * log still to be set right and the book's entry made again from it.
   */
  readonly recorded?: { readonly at: string; readonly finish: Finish }
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
  /** The invitation it came by, by its id, which stays the sender's whatever they are called; none where the device does not remember it, and none on a play received before it was kept. */
  readonly senderId?: string
  /** The log as it arrived. */
  readonly log: string
  /** How the sender said the play finished, where they had recorded it before sending. */
  readonly finished: Finish | undefined
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
export const headOf = (draft: PlayDraft, entry: TallyHead & { readonly parlor: Parlor | undefined }): PlayLogHead => ({
  playId: entry.id,
  gameKind: entry.gameKind,
  date: entry.date,
  startedAt: draft.startedAt,
  parlor: entry.parlor === undefined ? undefined : { name: entry.parlor.name, identity: entry.parlor.identity },
  terms: draft.venue.terms,
  machine: entry.machine,
  cabinetNumber: entry.cabinetNumber,
  formulaId: draft.pachinko?.id ?? draft.pachislot?.formula.id,
  prior: draft.pachislot === undefined ? undefined : priorSaid(draft.pachislot.prior),
})

/** The parlor a play is at, if it is at one. */
export const parlorOf = (draft: PlayDraft): Parlor | undefined => (draft.venue.type === "parlor" ? draft.venue.parlor : undefined)

/** Yen a token of the play is worth by its terms, when it has terms. */
export const tokenValueOfDraft = (draft: PlayDraft): number | undefined =>
  draft.venue.terms === undefined ? undefined : tokenValueOf(draft.venue.terms)

/** A play's prior as its log's head says it: which one, never its shares. */
const priorSaid = (prior: Pachislot.Weighing["prior"]): NonNullable<PlayLogHead["prior"]> => {
  if (prior.type === "even") return { type: "even" }
  return prior.type === "stock" ? { type: "stock", key: prior.key } : { type: "distribution", id: prior.id }
}

/** The draft with more lines at the end of its log. */
export const withCheckpoints = (draft: PlayDraft, checkpoints: readonly Checkpoint[]): PlayDraft => ({
  ...draft,
  log: checkpoints.reduce(appendCheckpoint, draft.log),
})

/** The draft with its log made of these checkpoints and no others: a reading set right or taken away. */
export const withLog = (draft: PlayDraft, checkpoints: readonly Checkpoint[]): PlayDraft => ({ ...draft, log: checkpoints.reduce(appendCheckpoint, "") })

/**
 * The machine a play is said anew to be on, with what it is weighed by: a
 * person finds the readings unlike what they feel at the cabinet, and sees
 * that the play was begun on another model of the same name. `readings`
 * is the play's log as that machine reads it — its game says how — and is
 * none where the log does not read, which is then left as it is.
 */
export type MachineChange = (
  | { readonly type: "pachinko"; readonly name: string; readonly formula: Pachinko.FormulaSnapshot; readonly bonuses: readonly MachineBonus[] }
  | { readonly type: "pachislot"; readonly name: string; readonly weighing: Pachislot.Weighing }
) & { readonly readings: readonly Checkpoint[] | undefined }

/** The draft on another machine, its log as that machine reads it. */
export const withMachine = (draft: PlayDraft, machine: MachineChange): PlayDraft => {
  const read = machine.readings === undefined ? draft : withLog(draft, machine.readings)
  return machine.type === "pachinko" ? { ...read, machine: machine.name, pachinko: machine.formula, bonuses: machine.bonuses } : { ...read, machine: machine.name, pachislot: machine.weighing }
}

/** The draft at a cabinet of another number, or of none. */
export const withCabinetNumber = (draft: PlayDraft, cabinetNumber: string | undefined): PlayDraft => ({ ...draft, cabinetNumber })

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

/** Who sent a play, as its tally keeps them: none for a play of the device's own, or one whose invitation the device does not remember. */
export const senderOf = (draft: PlayDraft): Sender | undefined =>
  draft.received?.senderId === undefined ? undefined : { id: draft.received.senderId, name: draft.received.sender ?? "" }

/** Whether a play is this device's own and waits to be sent to an inbox: never sent there, or changed since it was. A play someone sent here is not sent on. */
export const awaitsSending = (draft: PlayDraft, lineId: string): boolean => draft.received === undefined && !isSentAsItStands(draft, lineId)

/** How a play stands with an inbox: never sent there, sent as it now is, or sent and changed since. */
export type Delivery = "unsent" | "sent" | "changed"

export const deliveryOf = (draft: PlayDraft, lineId: string): Delivery =>
  isSentAsItStands(draft, lineId) ? "sent" : draft.sent?.some((sending) => sending.lineId === lineId) === true ? "changed" : "unsent"

/**
 * The operations of a play made after it was said to have finished: what was
 * changed once the play was over. For a play someone sent, the finish is the
 * one its sender gave and the changes theirs, whatever the receiver does
 * with it since.
 */
export const afterItFinished = (draft: PlayDraft): readonly Operation[] => {
  const finished = draft.received === undefined ? draft.recorded?.finish.at : draft.received.finished?.at
  return finished === undefined ? [] : (draft.history ?? []).filter((operation) => operation.at > finished)
}
