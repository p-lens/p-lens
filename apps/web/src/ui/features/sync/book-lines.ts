import { createSignal, type Accessor } from "solid-js"

import type { BookId } from "../../../core/book/book"
import type { PlayId } from "../../../core/play/play"
import { Err, type Result } from "../../../core/result/result"
import type { BookLine, Connection, Destination, FollowedPlay, InboxLine, LineStanding, PlaysLine, ReceivedPlay, SendingLine, SendingProblem, SentPlay, TakeOverProblem } from "../../../crossing"

/** A book's lines as the runner keeps them open: the book's, and on the owner's devices its plays' and its inbox, over one connection to the book's relay. */
export interface OpenLine {
  readonly book: BookLine
  readonly plays: PlaysLine | undefined
  readonly inbox: InboxLine | undefined
  readonly connection: Connection
}

/** A book's inbox this device sends plays to, as the runner keeps it open, over a connection of its own. */
export interface OpenSending {
  readonly line: SendingLine
  readonly connection: Connection
}

/** A play sent to one of this device's books, with the book it came to. */
export type Arrived = ReceivedPlay & { readonly bookId: BookId }

/**
 * What the page has of the lines its books are on, kept for as long as the
 * page is open rather than as long as one screen is: the lines are kept open
 * wherever the app is (`BookSyncRunner`), the screen that syncs books reads
 * how each stands, and the screens of the day's plays read the plays the
 * owner's other devices hold, those sent to the owner's books, and where
 * this device sends its own.
 *
 * - `standings`: how each book's line stands, by the book.
 * - `linked`: counts the times a book or a destination was put on a line or
 *   taken off one, so that the runner opens or lets go of lines as it is told.
 * - `followed`: every play another of the owner's devices holds, as this
 *   device last had it.
 * - `arrived`: every play sent to a book this device is the owner's of.
 * - `destinations`: the books this device sends plays to, and `sent` the
 *   plays it sends there.
 * - `held.lines`: each book's lines the runner keeps open, by its book;
 *   `held.sendings` each destination's, by its invitation.
 * - `opened`: counts the times a book's lines were opened or let go of, so
 *   that a screen reaching into `held.lines` reads them again.
 */
export interface BookLines {
  readonly standings: Accessor<ReadonlyMap<BookId, LineStanding>>
  readonly setStanding: (bookId: BookId, standing: LineStanding | undefined) => void
  readonly linked: Accessor<number>
  readonly relinked: () => void
  readonly followed: Accessor<readonly FollowedPlay[]>
  readonly setFollowed: (bookId: BookId, plays: readonly FollowedPlay[]) => void
  readonly arrived: Accessor<readonly Arrived[]>
  readonly setArrived: (bookId: BookId, plays: readonly ReceivedPlay[]) => void
  readonly destinations: Accessor<readonly Destination[]>
  readonly sent: Accessor<readonly SentPlay[]>
  readonly setSending: (destinations: readonly Destination[], sent: readonly SentPlay[]) => void
  /** Take a play another device holds over to this one, on the line of the book it is followed on. */
  readonly takeOver: (playId: PlayId) => Promise<Result<void, TakeOverProblem>>
  /** Send one of the device's plays to a book, from now on. */
  readonly send: (playId: PlayId, invitation: string) => Promise<Result<void, SendingProblem>>
  /** Send a play no longer, wherever it is sent. */
  readonly stopSending: (playId: PlayId) => Promise<Result<void, SendingProblem>>
  /** Who a book lets in changed here: its inbox read again by the senders its roster now names. */
  readonly rosterChanged: (bookId: BookId) => void
  /** A book's lines let go of: what waits sent for a moment, then the connection closed. */
  readonly letGo: (bookId: BookId) => void
  /** A destination's line let go of, as a book's is. */
  readonly letSendingGo: (invitation: string) => void
  readonly held: { readonly lines: Map<BookId, OpenLine>; readonly opening: Set<BookId>; readonly sendings: Map<string, OpenSending>; readonly openingSendings: Set<string> }
  readonly opened: Accessor<number>
  /** A book's lines kept open, under its book. */
  readonly keep: (bookId: BookId, line: OpenLine) => void
}

export const createBookLines = (): BookLines => {
  const [standings, setStandings] = createSignal<ReadonlyMap<BookId, LineStanding>>(new Map())
  const [linked, setLinked] = createSignal(0)
  const [followedByBook, setFollowedByBook] = createSignal<ReadonlyMap<BookId, readonly FollowedPlay[]>>(new Map())
  const [arrivedByBook, setArrivedByBook] = createSignal<ReadonlyMap<BookId, readonly Arrived[]>>(new Map())
  const [sending, setSendingNow] = createSignal<{ readonly destinations: readonly Destination[]; readonly sent: readonly SentPlay[] }>({ destinations: [], sent: [] })
  const held: BookLines["held"] = { lines: new Map(), opening: new Set(), sendings: new Map(), openingSendings: new Set() }
  const [opened, setOpened] = createSignal(0)
  const setFollowed = (bookId: BookId, plays: readonly FollowedPlay[]): void => {
    setFollowedByBook((was) => new Map(was).set(bookId, plays))
  }
  const followed = (): readonly FollowedPlay[] => [...followedByBook().values()].flat()
  const sendingOf = (invitation: string | undefined): SendingLine | undefined => (invitation === undefined ? undefined : held.sendings.get(invitation)?.line)
  return {
    standings,
    setStanding: (bookId, standing) =>
      setStandings((was) => {
        const next = new Map(was)
        if (standing === undefined) next.delete(bookId)
        else next.set(bookId, standing)
        return next
      }),
    linked,
    relinked: () => setLinked((count) => count + 1),
    followed,
    setFollowed,
    arrived: () => [...arrivedByBook().values()].flat(),
    setArrived: (bookId, plays) => setArrivedByBook((was) => new Map(was).set(bookId, plays.map((play) => ({ ...play, bookId })))),
    destinations: () => sending().destinations,
    sent: () => sending().sent,
    setSending: (destinations, sent) => setSendingNow({ destinations, sent }),
    takeOver: async (playId) => {
      const bookId = followed().find((play) => play.playId === playId)?.bookId
      const line = bookId === undefined ? undefined : held.lines.get(bookId)
      return line?.plays === undefined ? Err({ type: "unreachable" }) : line.plays.takeOver(playId)
    },
    send: async (playId, invitation) => {
      const line = sendingOf(invitation)
      return line === undefined ? Err({ type: "removed" }) : line.send(playId)
    },
    stopSending: async (playId) => {
      const line = sendingOf(sending().sent.find((play) => play.playId === playId && !play.ended)?.invitation)
      return line === undefined ? Err({ type: "removed" }) : line.stop(playId)
    },
    rosterChanged: (bookId) => held.lines.get(bookId)?.inbox?.sendersChanged(),
    letGo: (bookId) => {
      const line = held.lines.get(bookId)
      held.lines.delete(bookId)
      setArrivedByBook((was) => new Map([...was].filter(([each]) => each !== bookId)))
      if (line === undefined) return
      setOpened((count) => count + 1)
      line.inbox?.close()
      void Promise.all([line.book.close(), line.plays?.close()]).finally(line.connection.close)
    },
    letSendingGo: (invitation) => {
      const open = held.sendings.get(invitation)
      held.sendings.delete(invitation)
      if (open !== undefined) void open.line.close().finally(open.connection.close)
    },
    held,
    opened,
    keep: (bookId, line) => {
      held.lines.set(bookId, line)
      setOpened((count) => count + 1)
    },
  }
}
