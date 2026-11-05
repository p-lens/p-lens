import type { BookId } from "../../core/book/book"
import type { IsoDate } from "../../core/calendar/calendar"
import type { BookFiles } from "../../core/journal/layout"
import type { PlayDraft } from "../../core/live-play/draft"
import type { PlayId } from "../../core/play/play"
import type { Result } from "../../core/result/result"
import type { Change, ChangeId } from "../core/book/change"
import type { MemberRole } from "../core/book/roster"
import type { NostrEvent } from "../core/event"
import type { CopyOf, Ending } from "../core/plays"

/**
 * Who a device is on a book's line: one of the owner's devices, by the
 * book's sync secret `S`; or the device of a person the owner let in, by
 * their invitation's secret `m`, with the owner's key, and the latest
 * stamp their mailbox was read at (PROTOCOL.md §4.2, §4.4).
 */
export type LineAccess =
  | { readonly role: "owner"; readonly sync: string }
  | { readonly role: MemberRole; readonly invitation: string; readonly owner: string; readonly mailboxStamp: number }

/**
 * Where a device stands in its book's epochs (PROTOCOL.md §5.8): on the
 * epoch it joined, every change it holds being of it; moved to a new epoch,
 * waiting for a base read off the new line; or on that base, the floor every
 * head is to be made on.
 */
export type Floor = { readonly type: "joined" } | { readonly type: "awaiting" } | { readonly type: "at"; readonly id: ChangeId }

/**
 * A book this device keeps on a line (PROTOCOL.md §5): who it is there, the
 * epoch's secret and number, where the line is, the device's own name on
 * it, the head its book is the state of, and how far it has read.
 */
export interface BookLink {
  readonly bookId: BookId
  readonly access: LineAccess
  /** The epoch secret `E_n`, base64url. */
  readonly epoch: string
  /** `n`: 0 for the epoch a line begins on. */
  readonly epochNumber: number
  readonly floor: Floor
  /** The relay's address, its label included. */
  readonly relay: string
  /** 32 lowercase hex digits: this device on the line, for its tip's address. */
  readonly device: string
  /** The change whose state the device's book was last made, or found, to be. */
  readonly head: ChangeId
  /** Seconds: everything made on the line before it, less an hour, has been read. */
  readonly mark: number
  /** The stamp of the device's latest tip. */
  readonly stamp: number
  /** When the device's latest tip was made, in seconds: the next is made later. */
  readonly tipAt: number
}

/** A change as the device holds it: under its id, with when the event that brought it was made. */
export interface HeldChange {
  readonly id: ChangeId
  readonly change: Change
  /** Seconds: its event's `created_at`. */
  readonly createdAt: number
}

/** What a reconciliation keeps at once, or none of it: the changes it made, the state its book now is, and the link pointing there. */
export interface Settled {
  readonly link: BookLink
  readonly changes: readonly HeldChange[]
  readonly shadow: BookFiles
}

/**
 * A play this device holds on a book's plays line (PROTOCOL.md §6): at which
 * generation, what it last wrote of it, and what waits for the relay. Ended,
 * it has left the line, and is kept so that it is not put back by mistake.
 */
export interface HeldPlay {
  readonly type: "held"
  readonly bookId: BookId
  readonly playId: PlayId
  /** The play's business day: the line it is on. */
  readonly day: IsoDate
  readonly gen: number
  /** Taking the play over from another device: written, and not yet kept by the relay. */
  readonly taking: boolean
  /** The stamp of the latest head written. */
  readonly stamp: number
  /** Seconds: when the latest event at each address was said to be made, by its `d`. */
  readonly times: { readonly [d: string]: number }
  /** What the latest head said, hashed, so that one saying the same is not written again. */
  readonly said: string | undefined
  /** The hashes of the pieces written, by their index. */
  readonly pieces: readonly string[]
  /** Whether the play was recorded as it was last written: a recorded play goes from its line with its day. */
  readonly recorded: boolean
  readonly ended: Ending | undefined
  /** Signed events waiting for the relay's word that it kept them, oldest first. */
  readonly waiting: readonly NostrEvent[]
}

/**
 * A play another of the owner's devices holds, as this device last had it:
 * whose it is, the play, and when its copy was made. Yielded by this device,
 * it keeps the log the device had, until the holder's copy shows what of it
 * was lost.
 */
export interface FollowedPlay {
  readonly type: "followed"
  readonly bookId: BookId
  readonly playId: PlayId
  readonly day: IsoDate
  readonly holder: CopyOf
  readonly play: PlayDraft
  /** Milliseconds: when the copy shown was made. */
  readonly shownAt: number
  readonly yielded: string | undefined
}

export type KeptPlay = HeldPlay | FollowedPlay

/**
 * A book this device sends plays to (PROTOCOL.md §7), by the invitation its
 * owner handed the person: the owner's key, the relay, the book's title and
 * inbox as the mailbox last said them, the mailbox's latest stamp, and
 * whether the owner took the person out. Nothing of the book is on the
 * device.
 */
export interface Destination {
  /** The invitation's secret `m`, base64url: what the destination is known by. */
  readonly invitation: string
  readonly owner: string
  readonly relay: string
  readonly title: string
  /** The inbox's `v`. */
  readonly inbox: string
  readonly mailboxStamp: number
  readonly removed: boolean
  /** 32 lowercase hex digits: this device, as the plays it sends name it. */
  readonly device: string
}

/**
 * A play this device sends to a book's inbox (PROTOCOL.md §7): which, its
 * business day, what was last written of it, and what waits for the relay.
 * Ended, its head says it was given up or no longer sent, and it is kept
 * until that goes.
 */
export interface SentPlay {
  readonly playId: PlayId
  /** The destination's invitation, as `Destination.invitation`. */
  readonly invitation: string
  readonly day: IsoDate
  /** The stamp of the latest head written. */
  readonly stamp: number
  /** Seconds: when the latest event at each address was said to be made, by its `d`. */
  readonly times: { readonly [d: string]: number }
  /** What the latest head said, hashed, so that one saying the same is not written again. */
  readonly said: string | undefined
  /** The hashes of the pieces written, by their index. */
  readonly pieces: readonly string[]
  readonly ended: boolean
  /** Signed events waiting for the relay's word that it kept them, oldest first. */
  readonly waiting: readonly NostrEvent[]
}

export type LineStoreError = { readonly type: "unavailable"; readonly detail: string } | { readonly type: "unreadable" }

/**
 * What the device keeps of the lines its books are on, apart from the books
 * themselves: never on the path of anything a person does alone, and
 * forgotten whole without the book being touched.
 */
export interface LineStore {
  readonly links: () => Promise<Result<readonly BookLink[], LineStoreError>>
  /** A link kept as it now is: how far its line was read, its latest tip. */
  readonly putLink: (link: BookLink) => Promise<Result<void, LineStoreError>>
  readonly changes: (bookId: BookId) => Promise<Result<readonly HeldChange[], LineStoreError>>
  /** The state of the link's head: what the book was last made, or found, to be. */
  readonly shadow: (bookId: BookId) => Promise<Result<BookFiles, LineStoreError>>
  /** Changes read off the line, kept as they come, before anything is made of them. */
  readonly receive: (bookId: BookId, changes: readonly HeldChange[]) => Promise<Result<void, LineStoreError>>
  readonly settle: (settled: Settled) => Promise<Result<void, LineStoreError>>
  /** Signed events waiting for the relay's word that it kept them. */
  readonly outbox: (bookId: BookId) => Promise<Result<readonly NostrEvent[], LineStoreError>>
  readonly queue: (bookId: BookId, events: readonly NostrEvent[]) => Promise<Result<void, LineStoreError>>
  readonly sent: (bookId: BookId, ids: readonly string[]) => Promise<Result<void, LineStoreError>>
  /** Events that did not open as JSON, waiting for a manifest to name them as its parts. */
  readonly loose: (bookId: BookId) => Promise<Result<readonly NostrEvent[], LineStoreError>>
  readonly keepLoose: (bookId: BookId, events: readonly NostrEvent[]) => Promise<Result<void, LineStoreError>>
  readonly dropLoose: (bookId: BookId, ids: readonly string[]) => Promise<Result<void, LineStoreError>>
  /** Every play the device keeps on any book's line, held or followed. */
  readonly plays: () => Promise<Result<readonly KeptPlay[], LineStoreError>>
  readonly putPlay: (play: KeptPlay) => Promise<Result<void, LineStoreError>>
  readonly dropPlay: (bookId: BookId, playId: PlayId) => Promise<Result<void, LineStoreError>>
  /** Everything of a book's line, its link and its plays with it: the book stays as it is. */
  readonly forget: (bookId: BookId) => Promise<Result<void, LineStoreError>>
  /** The books this device sends plays to. */
  readonly destinations: () => Promise<Result<readonly Destination[], LineStoreError>>
  readonly putDestination: (destination: Destination) => Promise<Result<void, LineStoreError>>
  /** A destination let go of, with every play sent to it. */
  readonly forgetDestination: (invitation: string) => Promise<Result<void, LineStoreError>>
  /** Every play this device sends, to any book. */
  readonly sentPlays: () => Promise<Result<readonly SentPlay[], LineStoreError>>
  readonly putSentPlay: (play: SentPlay) => Promise<Result<void, LineStoreError>>
  readonly dropSentPlay: (playId: PlayId) => Promise<Result<void, LineStoreError>>
}
