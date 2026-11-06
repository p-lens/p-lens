import type { IsoDate } from "../../core/calendar/calendar"
import type { PlayDraft } from "../../core/live-play/draft"
import type { PlayId } from "../../core/play/play"
import { tagValues, type NostrEvent } from "../core/event"
import { NAMES } from "../core/keyring"
import { KIND } from "../core/kinds"
import { assembledPlay, playsDaysOf, readHead, readPiece, type CopyHead, type CopyPiece } from "../core/plays"
import type { Place } from "../core/seal"
import type { Connection, ConnectionState } from "../port/relay"
import type { SharedMember } from "./book-sharing"
import { ownersKeysOf, seconds, type BookSyncPorts, type OwnersLink } from "./book-sync"
import { readSince } from "./line-reading"

/** How far before now a live subscription reads: a sent play is said to be made up to ten seconds before it is. */
const LIVE_SLACK = 30

/** How far before the mark a catch-up reads: a sent play signed a while before it reached the relay, from a device that was out of reach (PROTOCOL.md §11). */
const CATCH_UP_SLACK = 120

/** Who sent a play, as the owner's devices know them: their invitation's mailbox, which stays theirs whatever they are called, and what the owner calls them. */
export interface PlaySender {
  readonly id: string
  readonly name: string
}

/** A play a sender sends to a book's inbox, as its owner's device last had it: who sends it, the play, its business day, and when its state was made. */
export interface ReceivedPlay {
  readonly sender: PlaySender
  readonly play: PlayDraft
  readonly day: IsoDate
  /** Milliseconds: when the state shown was made. */
  readonly shownAt: number
}

interface InboxLineHandlers {
  /** Every play the inbox holds now, as this device has it. */
  readonly onReceived: (plays: readonly ReceivedPlay[]) => void
}

/** A book's inbox, kept open beside its line on one of the owner's devices. */
export interface InboxLine {
  /** Who may send may have changed: the inbox is read again where the senders the roster names are others now. */
  readonly sendersChanged: () => void
  readonly close: () => void
}

/** A sender as the inbox reads them: who they are, their key, and what their sent plays are sealed with. */
interface Reading {
  readonly sender: PlaySender
  readonly pubkey: string
  readonly sealKey: Uint8Array
}

/**
 * What an inbox line holds while it is open; `mark` is when the last
 * catch-up by the senders it now reads by that finished began, none before
 * the first, so that one after the socket opens again reads only what came
 * since.
 */
interface Line {
  senders: ReadonlyMap<string, Reading>
  mark: number | undefined
  readonly heads: Map<string, { readonly head: CopyHead; readonly createdAt: number }>
  readonly pieces: Map<string, { readonly piece: CopyPiece; readonly createdAt: number }>
  reach: ConnectionState
  closeSubscription: () => void
  turn: Promise<void>
}

const headKey = (pubkey: string, playId: PlayId): string => `${pubkey} ${playId}`

/** Whether two readings name the same senders. */
const sameSenders = (one: ReadonlyMap<string, Reading>, other: ReadonlyMap<string, Reading>): boolean =>
  one.size === other.size && [...one.keys()].every((pubkey) => other.has(pubkey))

/**
 * Reads a book's inbox on one of its owner's devices (PROTOCOL.md §7): every
 * sender's latest state of each play they send, opened with that sender's
 * seal, and only from those the roster names as senders, so that one taken
 * out is dropped. Nothing is kept: the relay holds each play until its day
 * is past, and the inbox is read again whenever the app opens — and, as
 * the socket opens again, what came since it was last read.
 */
export const openInboxLine = async (ports: BookSyncPorts, link: OwnersLink, connection: Connection, senders: () => Promise<readonly SharedMember[]>, handlers: InboxLineHandlers): Promise<InboxLine> => {
  const owners = await ownersKeysOf(ports.keys, link.access.sync)
  const inbox = await ports.keys.locator(owners.sync, NAMES.inbox)
  const line: Line = { senders: new Map(), mark: undefined, heads: new Map(), pieces: new Map(), reach: connection.state(), closeSubscription: () => undefined, turn: Promise.resolve() }

  const inTurn = (work: () => Promise<void>): Promise<void> => {
    line.turn = line.turn.then(work).catch(() => undefined)
    return line.turn
  }

  const placeOf = (d: string, pubkey: string): Place => ({ kind: KIND.sentPlay, v: inbox, d, pubkey })

  const readingsOf = async (members: readonly SharedMember[]): Promise<ReadonlyMap<string, Reading>> =>
    new Map(
      await Promise.all(
        members.flatMap((member) =>
          member.role === "sender" && member.pubkey !== undefined
            ? [(async (pubkey: string): Promise<[string, Reading]> => [pubkey, { sender: { id: member.mailbox, name: member.name }, pubkey, sealKey: await ports.keys.sealKey(member.invitation, NAMES.inbox) }])(member.pubkey)]
            : [],
        ),
      ),
    )

  const onEvent = async (event: NostrEvent): Promise<void> => {
    const reading = line.senders.get(event.pubkey)
    const d = tagValues(event, "d")[0]
    if (reading === undefined || d === undefined || event.kind !== KIND.sentPlay || tagValues(event, "v")[0] !== inbox) return
    const opened = await ports.keys.openJson(reading.sealKey, placeOf(d, event.pubkey), event.content)
    if (!opened.ok) return
    const head = readHead(opened.value)
    if (head !== undefined) {
      const key = headKey(event.pubkey, head.playId)
      const was = line.heads.get(key)
      if (was === undefined || head.stamp > was.head.stamp) line.heads.set(key, { head, createdAt: event.created_at })
      return
    }
    const piece = readPiece(opened.value)
    if (piece === undefined) return
    const key = `${headKey(event.pubkey, piece.playId)} ${piece.index}`
    const was = line.pieces.get(key)
    if (was === undefined || event.created_at >= was.createdAt) line.pieces.set(key, { piece, createdAt: event.created_at })
  }

  const piecesOf = (pubkey: string, playId: PlayId): ReadonlyMap<number, CopyPiece> =>
    new Map([...line.pieces.entries()].filter(([key]) => key.startsWith(`${headKey(pubkey, playId)} `)).map(([, { piece }]) => [piece.index, piece]))

  /** Every play the inbox holds from a sender the roster names, put together where every piece is, on a day still read. */
  const told = (): void => {
    const days = new Set(playsDaysOf(ports.businessDay()))
    const received = [...line.heads.entries()].flatMap(([key, { head, createdAt }]): ReceivedPlay[] => {
      const reading = line.senders.get(key.split(" ")[0] ?? "")
      const play = reading === undefined ? undefined : assembledPlay(head, piecesOf(reading.pubkey, head.playId))
      return reading === undefined || play === undefined || !days.has(play.date) ? [] : [{ sender: reading.sender, play, day: play.date, shownAt: createdAt * 1000 }]
    })
    handlers.onReceived(received)
  }

  /** The senders the roster names now, and what they sent since the mark read through — all of it where they are not those the mark was made by. */
  const catchUp = (): Promise<void> =>
    inTurn(async () => {
      const began = seconds(ports)
      const now = await readingsOf(await senders())
      const since = sameSenders(now, line.senders) && line.mark !== undefined ? { since: line.mark - CATCH_UP_SLACK } : {}
      line.senders = now
      ;[...line.heads.keys()].filter((key) => !line.senders.has(key.split(" ")[0] ?? "")).forEach((key) => line.heads.delete(key))
      if (line.senders.size > 0) {
        const read = await readSince(connection, { kinds: [KIND.sentPlay], "#v": [inbox], authors: [...line.senders.keys()], ...since })
        if (!read.ok) return told()
        for (const event of read.value) await onEvent(event)
      }
      line.mark = began
      told()
    })

  const listen = (): void => {
    line.closeSubscription()
    const subscription = connection.subscribe(() => [{ kinds: [KIND.sentPlay], "#v": [inbox], since: seconds(ports) - LIVE_SLACK }], {
      onEvent: (event) => void inTurn(() => onEvent(event)).then(told),
    })
    line.closeSubscription = subscription.close
  }

  const stopHearing = connection.onState((state) => {
    const was = line.reach.type
    line.reach = state
    if (state.type === "open" && was !== "open") void catchUp()
  })
  listen()
  if (connection.state().type === "open") void catchUp()

  /** The inbox read again where the senders the roster names are not those it was read by. */
  const sendersChanged = async (): Promise<void> => {
    if (!sameSenders(await readingsOf(await senders()), line.senders)) await catchUp()
  }

  return {
    sendersChanged: () => void sendersChanged(),
    close: () => {
      line.closeSubscription()
      stopHearing()
    },
  }
}
