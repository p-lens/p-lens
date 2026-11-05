import type { IsoDate } from "../../core/calendar/calendar"
import type { PlayDraft } from "../../core/live-play/draft"
import type { PlayId } from "../../core/play/play"
import { Err, Ok, type Result } from "../../core/result/result"
import { fromBase64Url } from "../core/bytes"
import { digestOf } from "../core/book/canonical"
import { readMailbox, type Mailbox } from "../core/book/sharing"
import { tagValues, type NostrEvent } from "../core/event"
import { NAMES } from "../core/keyring"
import { KIND } from "../core/kinds"
import { copyTime, headJson, logPieces, pieceHash, pieceJson, playsDaysOf, playsExpiration, type CopyHead, type CopyOf } from "../core/plays"
import type { Place } from "../core/seal"
import { SENT_GENERATION, sentPlayOf } from "../core/sending"
import type { SigningKey } from "../port/keys"
import type { Destination, LineStoreError, SentPlay } from "../port/line-store"
import type { Connection, ConnectionState } from "../port/relay"
import { mailboxAt, mailboxPlace, type MailboxAt } from "./book-sharing"
import { seconds, type BookSyncPorts } from "./book-sync"
import { readSince } from "./line-reading"

/** How long the relay's word that it kept an event is waited for. */
const ANSWER_WAIT_MS = 10_000

/** How long after a change a play is sent, and the least time between two sendings of it (PROTOCOL.md §7). */
const SEND_AFTER_MS = 3_000
const SEND_EVERY_MS = 30_000

/** How long what waits is given to go as the line is let go of (PROTOCOL.md §11). */
const CLOSING_WAIT_MS = 3_000

/** How far before now a live subscription reads. */
const LIVE_SLACK = 30

/** What the device sends by to a book's inbox: the sender's key, the seal, and the person's mailbox. */
interface SendingKeys {
  readonly invitation: Uint8Array
  readonly signer: SigningKey
  readonly sealKey: Uint8Array
  readonly mailbox: MailboxAt
}

/** What sending a play to a book's inbox could not do. */
export type SendingProblem = { readonly type: "removed" } | { readonly type: "kept"; readonly error: LineStoreError } | { readonly type: "unreadable" }

interface SendingLineHandlers {
  /** The owner took the person out: nothing more is sent, and the destination says so. */
  readonly onRemoved: () => void
  /** The destination changed: its title, or the plays sent to it. */
  readonly onChanged: () => void
}

/** A book's inbox this device sends plays to, kept open while the app is. */
export interface SendingLine {
  /** A play was written on this device: what is sent of it goes a moment later. */
  readonly wrote: () => void
  /** The page is going out of sight: whatever is due is sent now (PROTOCOL.md §7). */
  readonly sendNow: () => void
  /** Send a play from now on, as it changes, until its day is past or it is no longer sent. */
  readonly send: (playId: PlayId) => Promise<Result<void, SendingProblem>>
  /** Send a play no longer: the owner is told it went from the inbox. */
  readonly stop: (playId: PlayId) => Promise<Result<void, SendingProblem>>
  readonly close: () => Promise<void>
}

/** What a sending line holds while it is open. */
interface Line {
  destination: Destination
  readonly sent: Map<PlayId, SentPlay>
  reach: ConnectionState
  closed: boolean
  timer: ReturnType<typeof setTimeout> | undefined
  /** Milliseconds: when anything was last sent. */
  lastSent: number
  turn: Promise<void>
}

const ofPlay = (playId: PlayId, device: string): CopyOf => ({ playId, gen: SENT_GENERATION, device })

/**
 * Sends the plays a person chose to a book's inbox (PROTOCOL.md §7), signed
 * by their own key and sealed so that only the book's owner opens them: each
 * play's latest state a few seconds after it changes and at most every half
 * minute, as a copy is (§6.1), and once more as the page is hidden; that it
 * left the inbox where it was given up or is sent no longer. The mailbox is
 * listened to, for the owner taking the person out. Playing never waits on
 * any of it.
 */
export const openSendingLine = async (ports: BookSyncPorts, destination: Destination, connection: Connection, handlers: SendingLineHandlers): Promise<Result<SendingLine, SendingProblem>> => {
  const invitation = fromBase64Url(destination.invitation)
  if (invitation === undefined) return Err({ type: "unreadable" })
  const keys: SendingKeys = {
    invitation,
    signer: await ports.keys.signingKey(invitation, NAMES.sender),
    sealKey: await ports.keys.sealKey(invitation, NAMES.inbox),
    mailbox: await mailboxAt(ports.keys, invitation),
  }
  const all = await ports.lines.sentPlays()
  if (!all.ok) return Err({ type: "kept", error: all.error })
  const line: Line = {
    destination,
    sent: new Map(all.value.filter((play) => play.invitation === destination.invitation).map((play) => [play.playId, play])),
    reach: connection.state(),
    closed: false,
    timer: undefined,
    lastSent: 0,
    turn: Promise.resolve(),
  }

  const inTurn = (work: () => Promise<void>): Promise<void> => {
    line.turn = line.turn.then(work).catch(() => undefined)
    return line.turn
  }

  const placeOf = (d: string): Place => ({ kind: KIND.sentPlay, v: line.destination.inbox, d, pubkey: keys.signer.pubkey })

  const keep = async (play: SentPlay): Promise<Result<void, LineStoreError>> => {
    const put = await ports.lines.putSentPlay(play)
    if (put.ok) line.sent.set(play.playId, play)
    return put
  }

  const drop = async (playId: PlayId): Promise<void> => {
    const dropped = await ports.lines.dropSentPlay(playId)
    if (dropped.ok) line.sent.delete(playId)
  }

  const signed = async (d: string, content: unknown, createdAt: number, day: IsoDate): Promise<NostrEvent | undefined> => {
    const sealed = await ports.keys.sealJson(keys.sealKey, placeOf(d), content)
    return sealed.ok
      ? ports.keys.sign(keys.signer, { created_at: createdAt, kind: KIND.sentPlay, tags: [["v", line.destination.inbox], ["d", d], ["expiration", String(playsExpiration(day))]], content: sealed.value })
      : undefined
  }

  /** A play's state as sent after it: the pieces whose lines changed and the head, the head with the last piece in it where it fits; none where it says what was sent last, or will not go in seals. */
  const written = async (sent: SentPlay, draft: PlayDraft): Promise<SentPlay | undefined> => {
    const play = sentPlayOf(draft)
    const said = digestOf({ play, log: draft.log })
    if (said === sent.said) return undefined
    const now = seconds(ports)
    const pieces = logPieces(draft.log)
    const stamp = sent.stamp + 1
    const headAt = await ports.keys.address(keys.invitation, NAMES.sentPlay(sent.playId))
    const headOf = (closed: readonly (readonly string[])[], tail: readonly string[]): CopyHead => ({ ...ofPlay(sent.playId, line.destination.device), stamp, body: { type: "play", play, pieces: closed.map(pieceHash), tail } })
    const headAtTime = copyTime(now, sent.times[headAt])
    const inline = await signed(headAt, headJson(headOf(pieces.slice(0, -1), pieces.at(-1) ?? [])), headAtTime, sent.day)
    const closed = inline === undefined ? pieces : pieces.slice(0, -1)
    const head = inline ?? (await signed(headAt, headJson(headOf(pieces, [])), headAtTime, sent.day))
    if (head === undefined) return undefined
    const events = await Promise.all(
      closed.map(async (lines, index) => {
        if (sent.pieces[index] === pieceHash(lines)) return undefined
        const d = await ports.keys.address(keys.invitation, NAMES.sentPiece(sent.playId, index))
        const createdAt = copyTime(now, sent.times[d])
        const event = await signed(d, pieceJson({ ...ofPlay(sent.playId, line.destination.device), index, lines }), createdAt, sent.day)
        return event === undefined ? null : { d, event }
      }),
    )
    if (events.some((each) => each === null)) return undefined
    const made = events.flatMap((each) => (each === undefined || each === null ? [] : [each]))
    const replaced = new Set([headAt, ...made.map((each) => each.d)])
    return {
      ...sent,
      stamp,
      said,
      pieces: closed.map(pieceHash),
      times: { ...sent.times, [headAt]: headAtTime, ...Object.fromEntries(made.map(({ d, event }) => [d, event.created_at])) },
      waiting: [...sent.waiting.filter((event) => !replaced.has(tagValues(event, "d")[0] ?? "")), ...made.map(({ event }) => event), head],
    }
  }

  /** A play's head saying it left the inbox, everything waiting before it let go of. */
  const ended = async (sent: SentPlay): Promise<SentPlay | undefined> => {
    const d = await ports.keys.address(keys.invitation, NAMES.sentPlay(sent.playId))
    const stamp = sent.stamp + 1
    const createdAt = copyTime(seconds(ports), sent.times[d])
    const event = await signed(d, headJson({ ...ofPlay(sent.playId, line.destination.device), stamp, body: { type: "ended", ending: "deleted" } }), createdAt, sent.day)
    return event === undefined ? undefined : { ...sent, stamp, ended: true, times: { ...sent.times, [d]: createdAt }, waiting: [event] }
  }

  /** What waits of every play, sent in order: what the relay keeps, or has newer of, let go of; the rest kept for later. */
  const flush = async (): Promise<void> => {
    for (const sent of [...line.sent.values()].filter((each) => each.waiting.length > 0)) {
      if (line.reach.type !== "open") return
      const left = [...sent.waiting]
      while (left.length > 0) {
        const answer = await connection.publish(left[0] as NostrEvent, ANSWER_WAIT_MS)
        if (!answer.ok || (answer.value.type === "refused" && answer.value.refusal.type !== "have-newer")) break
        left.shift()
      }
      if (line.sent.get(sent.playId) === sent) await keep({ ...sent, waiting: left })
    }
  }

  /**
   * Every play sent brought up to the device's plays: written where it
   * changed and `writing`; said to have left where the play is gone; let go
   * of once its day is past the lines a copy is read on, or it left and
   * nothing of it waits.
   */
  const reconcile = (writing: boolean): Promise<void> =>
    inTurn(async () => {
      if (line.destination.removed) return
      const drafts = await ports.drafts.listDrafts()
      if (!drafts.ok) return
      const byId = new Map(drafts.value.map((draft) => [draft.id, draft]))
      const days = new Set(playsDaysOf(ports.businessDay()))
      for (const sent of [...line.sent.values()]) {
        const draft = byId.get(sent.playId)
        if (!days.has(sent.day) || (sent.ended && sent.waiting.length === 0)) {
          await drop(sent.playId)
          continue
        }
        if (sent.ended) continue
        if (draft === undefined) {
          const leaving = await ended(sent)
          if (leaving !== undefined) await keep(leaving)
          continue
        }
        const next = writing ? await written(sent, draft) : undefined
        if (next !== undefined) {
          await keep(next)
          line.lastSent = ports.clock()
        }
      }
      await flush()
      handlers.onChanged()
    })

  /** What the person's mailbox last said, taken: a new title or inbox kept; being taken out, everything stopped. */
  const onMailbox = async (said: Mailbox): Promise<void> => {
    if (said.stamp <= line.destination.mailboxStamp || said.type === "member") return
    line.destination =
      said.type === "removed" ? { ...line.destination, removed: true, mailboxStamp: said.stamp } : { ...line.destination, title: said.title, inbox: said.inbox, mailboxStamp: said.stamp }
    await ports.lines.putDestination(line.destination)
    if (said.type === "removed") {
      line.closed = true
      clearTimeout(line.timer)
      return handlers.onRemoved()
    }
    handlers.onChanged()
  }

  const openMailbox = async (event: NostrEvent): Promise<Mailbox | undefined> => {
    if (event.kind !== KIND.mailbox || event.pubkey !== line.destination.owner) return undefined
    const opened = await ports.keys.openJson(keys.mailbox.sealKey, mailboxPlace(keys.mailbox, line.destination.owner), event.content)
    return opened.ok ? readMailbox(opened.value) : undefined
  }

  const mailboxFilter = { kinds: [KIND.mailbox], authors: [destination.owner], "#v": [keys.mailbox.v], "#d": [keys.mailbox.d] }

  /** The mailbox read through, then everything due sent. */
  const catchUp = async (): Promise<void> => {
    const said = await readSince(connection, mailboxFilter)
    if (said.ok) {
      const opened = (await Promise.all(said.value.map(openMailbox))).filter((each): each is Mailbox => each !== undefined)
      const latest = opened.reduce<Mailbox | undefined>((found, each) => (found === undefined || each.stamp > found.stamp ? each : found), undefined)
      if (latest !== undefined) await inTurn(() => onMailbox(latest))
    }
    await reconcile(true)
  }

  /** A sending a moment after a change, and never sooner than the least time after the last. */
  const sendLater = (): void => {
    if (line.closed || line.timer !== undefined) return
    const due = Math.max(SEND_AFTER_MS, line.lastSent + SEND_EVERY_MS - ports.clock())
    line.timer = setTimeout(() => {
      line.timer = undefined
      void reconcile(true)
    }, due)
  }

  const send = async (playId: PlayId): Promise<Result<void, SendingProblem>> => {
    if (line.destination.removed) return Err({ type: "removed" })
    const drafts = await ports.drafts.listDrafts()
    const draft = drafts.ok ? drafts.value.find((each) => each.id === playId) : undefined
    if (draft === undefined) return Err({ type: "unreadable" })
    const was = line.sent.get(playId)
    const sending: SentPlay =
      was === undefined || was.ended
        ? { playId, invitation: line.destination.invitation, day: draft.date, stamp: was?.stamp ?? 0, times: was?.times ?? {}, said: undefined, pieces: [], ended: false, waiting: [] }
        : was
    const kept = await keep(sending)
    if (!kept.ok) return Err({ type: "kept", error: kept.error })
    await reconcile(true)
    return Ok(undefined)
  }

  const stop = async (playId: PlayId): Promise<Result<void, SendingProblem>> => {
    const result: { value: Result<void, SendingProblem> } = { value: Ok(undefined) }
    await inTurn(async () => {
      const sent = line.sent.get(playId)
      if (sent === undefined || sent.ended) return
      const leaving = await ended(sent)
      if (leaving === undefined) return
      const kept = await keep(leaving)
      if (!kept.ok) result.value = Err({ type: "kept", error: kept.error })
      await flush()
    })
    handlers.onChanged()
    return result.value
  }

  const stopHearing = connection.onState((state) => {
    const was = line.reach.type
    line.reach = state
    if (state.type === "open" && was !== "open") void catchUp()
  })
  const mailboxListening = connection.subscribe([{ ...mailboxFilter, since: seconds(ports) - LIVE_SLACK }], {
    onEvent: (event) => void openMailbox(event).then((said) => (said === undefined ? undefined : inTurn(() => onMailbox(said)))),
  })
  if (connection.state().type === "open") void catchUp()

  return Ok({
    wrote: sendLater,
    sendNow: () => {
      clearTimeout(line.timer)
      line.timer = undefined
      void reconcile(true)
    },
    send,
    stop,
    close: async () => {
      line.closed = true
      clearTimeout(line.timer)
      await Promise.race([reconcile(true), new Promise((resolve) => setTimeout(resolve, CLOSING_WAIT_MS))])
      mailboxListening.close()
      stopHearing()
    },
  })
}
