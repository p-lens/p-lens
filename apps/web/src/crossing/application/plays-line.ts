import { bookInUse, type BookId } from "../../core/book/book"
import type { IsoDate } from "../../core/calendar/calendar"
import { isPast, type PlayDraft } from "../../core/live-play/draft"
import type { PlayId } from "../../core/play/play"
import { Err, Ok, type Result } from "../../core/result/result"
import type { DraftError } from "../../storage/port/draft-storage"
import { digestOf } from "../core/book/canonical"
import { tagValues, type NostrEvent } from "../core/event"
import { NAMES } from "../core/keyring"
import { KIND } from "../core/kinds"
import type { Refusal } from "../core/messages"
import {
  assembledPlay,
  copiedPlayOf,
  copyTime,
  headJson,
  isAbove,
  linesLost,
  logPieces,
  pieceHash,
  pieceJson,
  playsDaysOf,
  playsExpiration,
  readHead,
  readPiece,
  type CopyHead,
  type CopyOf,
  type CopyPiece,
  type Ending,
} from "../core/plays"
import type { Place } from "../core/seal"
import type { FollowedPlay, HeldPlay, KeptPlay, LineStoreError } from "../port/line-store"
import type { Connection, ConnectionState } from "../port/relay"
import { ownersKeysOf, seconds, type BookSyncPorts, type BookSyncProblem, type OwnersLink } from "./book-sync"
import { readSince } from "./line-reading"

/** How long the relay's word that it kept an event is waited for. */
const ANSWER_WAIT_MS = 10_000

/** How long taking a play over waits for the relay to keep its copy (PROTOCOL.md §6.2). */
const TAKE_OVER_WAIT_MS = 3_000

/** How long after a change a play is copied, and the least time between two copies (PROTOCOL.md §6.3). */
const COPY_AFTER_MS = 3_000

/** How long what waits is given to go as the line is let go of (PROTOCOL.md §11). */
const CLOSING_WAIT_MS = 3_000

/** How far before now a live subscription reads: a copy is said to be made up to ten seconds before it is. */
const LIVE_SLACK = 30

/** How far before the mark a catch-up reads: a copy signed a while before it reached the relay, from a device that was out of reach (PROTOCOL.md §11). */
const CATCH_UP_SLACK = 120

/**
 * Why a play could not be taken over from the device holding it.
 *
 * - `unreachable`: the relay is not reached, or has not been read through yet.
 * - `refused`: the relay would not keep the copy, and why.
 * - `gone`: the play is no longer followed here: it left its line, or this device holds it.
 * - `kept`: what the device keeps of its lines could not be written.
 * - `draft`: the play could not be kept among the device's plays.
 */
export type TakeOverProblem =
  | { readonly type: "unreachable" }
  | { readonly type: "refused"; readonly refusal: Refusal }
  | { readonly type: "gone" }
  | { readonly type: "kept"; readonly error: LineStoreError }
  | { readonly type: "draft"; readonly error: DraftError }

interface PlaysLineHandlers {
  /** The plays of the book another of the owner's devices holds, as this device now has them. */
  readonly onFollowed: (plays: readonly FollowedPlay[]) => void
  /** Another device took over a play this one held: how many lines written here its copy lacks. */
  readonly onYielded: (playId: PlayId, lost: number) => void
  /** A play was put among the device's plays, or taken from them, from the line. */
  readonly onDraftsChanged: () => void
}

/** A book's plays line, kept open beside the book's. */
export interface PlaysLine {
  /** A play was written on this device: it is copied a moment later. */
  readonly wrote: () => void
  /** The page is going out of sight: whatever is due is copied now (PROTOCOL.md §6.3). */
  readonly copyNow: () => void
  /** Hold a play another device holds, and play it on here (PROTOCOL.md §6.2). */
  readonly takeOver: (playId: PlayId) => Promise<Result<void, TakeOverProblem>>
  /** Copies what is due and lets the line go, at most a moment later. */
  readonly close: () => Promise<void>
}

/** A day's line: its business day, `v` and seal. */
interface DayLine {
  readonly day: IsoDate
  readonly v: string
  readonly sealKey: Uint8Array
}

/** A head as read, with where it came from. */
interface Heard {
  readonly head: CopyHead
  readonly day: IsoDate
  readonly createdAt: number
}

/**
 * What a plays line holds while it is open; `mark` is when the last catch-up
 * of its days that finished began, none before the first, so that one after
 * the socket opens again reads only what came since.
 */
interface Line {
  days: readonly DayLine[]
  readonly heads: Map<string, Heard>
  readonly pieces: Map<string, { readonly piece: CopyPiece; readonly createdAt: number }>
  readonly kept: Map<PlayId, KeptPlay>
  caughtUp: boolean
  mark: number | undefined
  reach: ConnectionState
  closed: boolean
  copyTimer: ReturnType<typeof setTimeout> | undefined
  followTimer: ReturnType<typeof setTimeout> | undefined
  closeSubscription: () => void
  turn: Promise<void>
}

const copyKey = (of: CopyOf): string => `${of.playId} ${of.gen} ${of.device}`

const copyOf = (of: CopyOf): CopyOf => ({ playId: of.playId, gen: of.gen, device: of.device })

/** The head above every other of each play the line holds: its holder's (PROTOCOL.md §6.2). */
const topsOf = (heads: Iterable<Heard>): ReadonlyMap<PlayId, Heard> =>
  [...heads].reduce((tops, heard) => {
    const top = tops.get(heard.head.playId)
    return top === undefined || isAbove(heard.head, top.head) ? new Map(tops).set(heard.head.playId, heard) : tops
  }, new Map<PlayId, Heard>())

const newHold = (bookId: BookId, draft: PlayDraft, gen: number): HeldPlay => ({
  type: "held",
  bookId,
  playId: draft.id,
  day: draft.date,
  gen,
  taking: false,
  stamp: 0,
  times: {},
  said: undefined,
  pieces: [],
  recorded: false,
  ended: undefined,
  waiting: [],
})

/** A play's generation, as a device keeps it. */
const genOf = (kept: KeptPlay): number => (kept.type === "held" ? kept.gen : kept.holder.gen)

/** What the head of a hold is, for ranking it against the line's. */
const holdOf = (held: HeldPlay, device: string): CopyOf => ({ playId: held.playId, gen: held.gen, device })

/**
 * Keeps a book's plays on their lines (PROTOCOL.md §6), over the connection
 * its book's line is kept on: the plays this device holds copied a moment
 * after each change, every other device's copies read as they come, a play
 * given up when another device took it over, and taken over when a person
 * asks. What the device plays is never waited on: a play is copied after it
 * is written, and a copy that cannot go waits. Only the owner's devices
 * carry a book's plays: they alone hold its sync secret.
 */
export const openPlaysLine = async (ports: BookSyncPorts, link: OwnersLink, connection: Connection, handlers: PlaysLineHandlers): Promise<Result<PlaysLine, BookSyncProblem>> => {
  const keys = await ownersKeysOf(ports.keys, link.access.sync)
  const all = await ports.lines.plays()
  if (!all.ok) return Err({ type: "kept", error: all.error })
  const bookId = link.bookId
  const line: Line = {
    days: [],
    heads: new Map(),
    pieces: new Map(),
    kept: new Map(all.value.filter((play) => play.bookId === bookId).map((play) => [play.playId, play])),
    caughtUp: false,
    mark: undefined,
    reach: connection.state(),
    closed: false,
    copyTimer: undefined,
    followTimer: undefined,
    closeSubscription: () => undefined,
    turn: Promise.resolve(),
  }

  const inTurn = (work: () => Promise<void>): Promise<void> => {
    line.turn = line.turn.then(work).catch(() => undefined)
    return line.turn
  }

  const placeOf = (day: DayLine, d: string): Place => ({ kind: KIND.playCopy, v: day.v, d, pubkey: keys.owner.pubkey })

  const dayLineOf = async (day: IsoDate): Promise<DayLine> => ({ day, v: await ports.keys.locator(keys.sync, NAMES.plays(day)), sealKey: await ports.keys.sealKey(keys.sync, NAMES.plays(day)) })

  const told = (): void => handlers.onFollowed([...line.kept.values()].filter((kept): kept is FollowedPlay => kept.type === "followed"))

  const keep = async (play: KeptPlay): Promise<Result<void, LineStoreError>> => {
    const put = await ports.lines.putPlay(play)
    if (put.ok) line.kept.set(play.playId, play)
    return put
  }

  const drop = async (playId: PlayId): Promise<void> => {
    const dropped = await ports.lines.dropPlay(bookId, playId)
    if (dropped.ok) line.kept.delete(playId)
  }

  const onEvent = async (event: NostrEvent): Promise<void> => {
    const day = line.days.find((each) => tagValues(event, "v")[0] === each.v)
    const d = tagValues(event, "d")[0]
    if (day === undefined || d === undefined || event.pubkey !== keys.owner.pubkey || event.kind !== KIND.playCopy) return
    const opened = await ports.keys.openJson(day.sealKey, placeOf(day, d), event.content)
    if (!opened.ok) return
    const head = readHead(opened.value)
    if (head !== undefined) {
      const was = line.heads.get(copyKey(head))
      if (was === undefined || head.stamp > was.head.stamp) line.heads.set(copyKey(head), { head, day: day.day, createdAt: event.created_at })
      return
    }
    const piece = readPiece(opened.value)
    if (piece === undefined) return
    const key = `${copyKey(piece)} ${piece.index}`
    const was = line.pieces.get(key)
    if (was === undefined || event.created_at >= was.createdAt) line.pieces.set(key, { piece, createdAt: event.created_at })
  }

  const piecesOf = (head: CopyOf): ReadonlyMap<number, CopyPiece> =>
    new Map([...line.pieces.values()].filter(({ piece }) => copyKey(piece) === copyKey(head)).map(({ piece }) => [piece.index, piece]))

  /** A signed event of a day's line at an address, sealed. */
  const signed = async (day: DayLine, d: string, content: unknown, createdAt: number, play: { readonly day: IsoDate }): Promise<NostrEvent | undefined> => {
    const sealed = await ports.keys.sealJson(day.sealKey, placeOf(day, d), content)
    return sealed.ok
      ? ports.keys.sign(keys.owner, { created_at: createdAt, kind: KIND.playCopy, tags: [["v", day.v], ["d", d], ["expiration", String(playsExpiration(play.day))]], content: sealed.value })
      : undefined
  }

  /**
   * A play's copy as the hold it is written under comes to after it: the
   * pieces whose lines changed and the head, the head with the last piece
   * in it where it fits; none where the play is the same as last written,
   * or will not go in seals at all.
   */
  const copied = async (held: HeldPlay, draft: PlayDraft): Promise<HeldPlay | undefined> => {
    const day = line.days.find((each) => each.day === held.day)
    if (day === undefined) return undefined
    const play = copiedPlayOf(draft)
    const said = digestOf({ play, log: draft.log })
    if (said === held.said) return undefined
    const now = seconds(ports)
    const pieces = logPieces(draft.log)
    const stamp = held.stamp + 1
    const headAt = await ports.keys.address(keys.sync, NAMES.copy(held.playId, held.gen, link.device))
    const headOf = (closed: readonly (readonly string[])[], tail: readonly string[]): CopyHead => ({
      ...holdOf(held, link.device),
      stamp,
      body: { type: "play", play, pieces: closed.map(pieceHash), tail },
    })
    const headAtTime = copyTime(now, held.times[headAt])
    const inline = await signed(day, headAt, headJson(headOf(pieces.slice(0, -1), pieces.at(-1) ?? [])), headAtTime, held)
    const closed = inline === undefined ? pieces : pieces.slice(0, -1)
    const head = inline ?? (await signed(day, headAt, headJson(headOf(pieces, [])), headAtTime, held))
    if (head === undefined) return undefined
    const written = await Promise.all(
      closed.map(async (lines, index) => {
        if (held.pieces[index] === pieceHash(lines)) return undefined
        const d = await ports.keys.address(keys.sync, NAMES.piece(held.playId, held.gen, link.device, index))
        const createdAt = copyTime(now, held.times[d])
        const event = await signed(day, d, pieceJson({ ...holdOf(held, link.device), index, lines }), createdAt, held)
        return event === undefined ? null : { d, event }
      }),
    )
    if (written.some((each) => each === null)) return undefined
    const events = written.flatMap((each) => (each === undefined || each === null ? [] : [each]))
    const replaced = new Set([headAt, ...events.map((each) => each.d)])
    return {
      ...held,
      stamp,
      said,
      pieces: closed.map(pieceHash),
      recorded: draft.recorded !== undefined,
      times: { ...held.times, [headAt]: headAtTime, ...Object.fromEntries(events.map(({ d, event }) => [d, event.created_at])) },
      waiting: [...held.waiting.filter((event) => !replaced.has(tagValues(event, "d")[0] ?? "")), ...events.map(({ event }) => event), head],
    }
  }

  /** The hold with its play's head saying it left the line, everything waiting before it let go of. */
  const ended = async (held: HeldPlay, ending: Ending): Promise<HeldPlay | undefined> => {
    const day = line.days.find((each) => each.day === held.day)
    if (day === undefined) return undefined
    const d = await ports.keys.address(keys.sync, NAMES.copy(held.playId, held.gen, link.device))
    const stamp = held.stamp + 1
    const createdAt = copyTime(seconds(ports), held.times[d])
    const event = await signed(day, d, headJson({ ...holdOf(held, link.device), stamp, body: { type: "ended", ending } }), createdAt, held)
    return event === undefined ? undefined : { ...held, stamp, ended: ending, times: { ...held.times, [d]: createdAt }, waiting: [event] }
  }

  /** What waits of every hold, sent in order: what the relay keeps, or has newer of, let go of; the rest kept for later. */
  const flush = async (): Promise<void> => {
    for (const held of [...line.kept.values()].filter((kept): kept is HeldPlay => kept.type === "held" && kept.waiting.length > 0)) {
      if (line.reach.type !== "open") return
      const left = [...held.waiting]
      while (left.length > 0) {
        const answer = await connection.publish(left[0] as NostrEvent, ANSWER_WAIT_MS)
        if (!answer.ok || (answer.value.type === "refused" && answer.value.refusal.type !== "have-newer")) break
        left.shift()
      }
      const now = line.kept.get(held.playId)
      if (now === held) await keep({ ...held, waiting: left })
    }
  }

  /**
   * Give a play up to the device whose head is above this one's: the
   * play let go of here and followed from now on, with how much of what was
   * written here the holder lacks; told once the holder's copy is whole.
   */
  const yielded = async (draft: PlayDraft | undefined, held: HeldPlay, top: Heard): Promise<void> => {
    if (draft !== undefined) {
      const deleted = await ports.drafts.deleteDraft(draft.id)
      if (!deleted.ok) return
    }
    const theirs = assembledPlay(top.head, piecesOf(top.head))
    const shown = theirs ?? draft
    if (shown === undefined) return drop(held.playId)
    await keep({ type: "followed", bookId, playId: held.playId, day: top.day, holder: copyOf(top.head), play: shown, shownAt: top.createdAt * 1000, yielded: theirs === undefined ? draft?.log : undefined })
    if (draft === undefined) return
    if (theirs !== undefined) handlers.onYielded(held.playId, linesLost(draft.log, theirs.log))
    handlers.onDraftsChanged()
  }

  /** A play another device holds, as this device has it now: its copy put together where every piece is held, let go of once it left the line or its day is past. */
  const followed = async (top: Heard, today: IsoDate): Promise<void> => {
    const kept = line.kept.get(top.head.playId)
    if (top.head.body.type === "ended") {
      if (kept?.type === "followed") await drop(top.head.playId)
      return
    }
    const play = assembledPlay(top.head, piecesOf(top.head))
    if (play === undefined) return
    if (isPast(play, today)) {
      if (kept?.type === "followed") await drop(top.head.playId)
      return
    }
    if (kept?.type === "followed" && copyKey(kept.holder) === copyKey(top.head) && kept.shownAt === top.createdAt * 1000 && kept.yielded === undefined) return
    if (kept?.type === "followed" && kept.yielded !== undefined) handlers.onYielded(top.head.playId, linesLost(kept.yielded, play.log))
    await keep({ type: "followed", bookId, playId: top.head.playId, day: top.day, holder: copyOf(top.head), play, shownAt: top.createdAt * 1000, yielded: undefined })
  }

  /** Every play of this device that is this book's to carry: said for it, or kept on its line already, or going into the book in use. */
  const ownOf = async (today: IsoDate): Promise<{ readonly drafts: readonly PlayDraft[]; readonly mine: ReadonlyMap<PlayId, PlayDraft> } | undefined> => {
    const [drafts, books, kept] = await Promise.all([ports.drafts.listDrafts(), ports.session.books(), ports.lines.plays()])
    if (!drafts.ok || !books.ok || !kept.ok) return undefined
    const pinned = new Map(kept.value.filter((play) => play.type === "held" && play.ended === undefined).map((play) => [play.playId, play.bookId]))
    const fallback = bookInUse(books.value, ports.me.id)
    const window = new Set(line.days.map((each) => each.day))
    const mine = drafts.value.filter((draft) => !isPast(draft, today) && window.has(draft.date) && (draft.bookId ?? pinned.get(draft.id) ?? fallback) === bookId)
    return { drafts: drafts.value, mine: new Map(mine.map((draft) => [draft.id, draft])) }
  }

  /**
   * A play of this device's, on the line: held — anew, above whatever the
   * line has of it, where the device holds it no longer — copied when it is
   * time, and given up where another device holds it now. A head of this
   * device's own above its hold is one it wrote before it lost what it kept,
   * and is held above.
   */
  const ownPlay = async (draft: PlayDraft, top: Heard | undefined, copying: boolean): Promise<void> => {
    const kept = line.kept.get(draft.id)
    const holding = kept?.type === "held" && kept.ended === undefined ? kept : newHold(bookId, draft, Math.max(kept === undefined ? -1 : genOf(kept), top?.head.gen ?? -1) + 1)
    if (holding === kept && line.caughtUp && top !== undefined && isAbove(top.head, holdOf(holding, link.device))) {
      if (top.head.device !== link.device) return yielded(draft, holding, top)
      await keep(newHold(bookId, draft, top.head.gen + 1))
      return
    }
    const next = (copying ? await copied(holding, draft) : undefined) ?? holding
    if (next !== kept) await keep(next)
  }

  /**
   * Bring what the device keeps and the line into line: each of the
   * device's own plays held and copied, a hold whose play went elsewhere or
   * was given up said to have left, and every play another device holds
   * followed. Copies are written only when `copying`, so that they go at
   * most every few seconds however often the line is heard.
   */
  const reconcile = (copying: boolean): Promise<void> =>
    inTurn(async () => {
      const today = ports.businessDay()
      if (line.days[0]?.day !== today) await watch(today)
      const own = await ownOf(today)
      if (own === undefined) return
      for (const stale of [...line.kept.values()]) if (stale.type === "held" && stale.taking) await keep({ ...stale, taking: false })
      const tops = topsOf(line.heads.values())
      for (const draft of own.mine.values()) await ownPlay(draft, tops.get(draft.id), copying)
      for (const kept of [...line.kept.values()]) {
        if (kept.type !== "held" || own.mine.has(kept.playId)) continue
        const top = tops.get(kept.playId)
        if (kept.ended !== undefined) {
          if (kept.waiting.length === 0 && !line.days.some((each) => each.day === kept.day)) await drop(kept.playId)
          continue
        }
        if (line.caughtUp && top !== undefined && top.head.device !== link.device && isAbove(top.head, holdOf(kept, link.device))) {
          await yielded(undefined, kept, top)
          continue
        }
        const draft = own.drafts.find((each) => each.id === kept.playId)
        if (draft !== undefined && isPast(draft, today)) await drop(kept.playId)
        else if (draft === undefined && kept.recorded && kept.day < today) await drop(kept.playId)
        else if (!line.days.some((each) => each.day === kept.day)) await drop(kept.playId)
        else {
          const leaving = await ended(kept, draft === undefined ? "deleted" : "moved")
          if (leaving !== undefined) await keep(leaving)
        }
      }
      for (const top of tops.values()) if (top.head.device !== link.device && !own.mine.has(top.head.playId) && line.kept.get(top.head.playId)?.type !== "held") await followed(top, today)
      for (const kept of [...line.kept.values()]) if (kept.type === "followed" && (isPast(kept.play, today) || !line.days.some((each) => each.day === kept.day))) await drop(kept.playId)
      told()
      await flush()
    })

  /** Every copy on the days' lines since the mark read through, the mark moved to when the reading began, and what the device keeps brought into line with them. */
  const catchUp = async (): Promise<void> => {
    const began = seconds(ports)
    const filter = { kinds: [KIND.playCopy], "#v": line.days.map((each) => each.v) }
    const read = await readSince(connection, line.mark === undefined ? filter : { ...filter, since: line.mark - CATCH_UP_SLACK })
    if (!read.ok) return
    for (const event of read.value) await onEvent(event)
    line.mark = began
    line.caughtUp = true
    await reconcile(true)
  }

  /** The lines of a business day and the two before it, listened to from now, and read through whole. */
  const watch = async (today: IsoDate): Promise<void> => {
    line.days = await Promise.all(playsDaysOf(today).map(dayLineOf))
    line.mark = undefined
    line.closeSubscription()
    const subscription = connection.subscribe(() => [{ kinds: [KIND.playCopy], "#v": line.days.map((each) => each.v), since: seconds(ports) - LIVE_SLACK }], {
      onEvent: (event) => void onEvent(event).then(heard),
    })
    line.closeSubscription = subscription.close
    if (line.reach.type === "open") void catchUp()
  }

  /** Something was heard on the line: what is followed is brought up to it a moment later. */
  const heard = (): void => {
    if (line.closed || line.followTimer !== undefined) return
    line.followTimer = setTimeout(() => {
      line.followTimer = undefined
      void reconcile(false)
    }, 0)
  }

  const wrote = (): void => {
    if (line.closed || line.copyTimer !== undefined) return
    line.copyTimer = setTimeout(() => {
      line.copyTimer = undefined
      void reconcile(true)
    }, COPY_AFTER_MS)
  }

  /**
   * Take a play over from the device holding it: kept among this device's
   * plays as its copy here has it, held at the generation above, and kept
   * only once the relay has said within moments that it keeps the copy;
   * otherwise let go of again, still followed.
   */
  const takeOver = async (playId: PlayId): Promise<Result<void, TakeOverProblem>> => {
    const result: { value: Result<void, TakeOverProblem> } = { value: Err({ type: "gone" }) }
    await inTurn(async () => {
      const following = line.kept.get(playId)
      if (following?.type !== "followed") return
      if (line.reach.type !== "open" || !line.caughtUp) {
        result.value = Err({ type: "unreachable" })
        return
      }
      const top = topsOf(line.heads.values()).get(playId)
      const draft = following.play
      const taking: HeldPlay = { ...newHold(bookId, draft, Math.max(following.holder.gen, top?.head.gen ?? -1) + 1), day: following.day, taking: true }
      const written = await copied(taking, draft)
      if (written === undefined) {
        result.value = Err({ type: "unreachable" })
        return
      }
      const kept = await keep(written)
      if (!kept.ok) {
        result.value = Err({ type: "kept", error: kept.error })
        return
      }
      const created = await ports.drafts.createDraft(draft)
      if (!created.ok) {
        await keep(following)
        result.value = Err({ type: "draft", error: created.error })
        return
      }
      const answered = await keptInTime(written.waiting)
      if (!answered.ok) {
        await ports.drafts.deleteDraft(playId)
        await keep(following)
        result.value = answered
        return
      }
      await keep({ ...written, taking: false, waiting: [] })
      result.value = Ok(undefined)
    })
    if (result.value.ok) handlers.onDraftsChanged()
    told()
    return result.value
  }

  /** Whether the relay keeps every event within the time taking over is given. */
  const keptInTime = async (events: readonly NostrEvent[]): Promise<Result<void, TakeOverProblem>> => {
    const deadline = Date.now() + TAKE_OVER_WAIT_MS
    for (const event of events) {
      const answer = await connection.publish(event, Math.max(1, deadline - Date.now()))
      if (!answer.ok) return Err({ type: "unreachable" })
      if (answer.value.type === "refused") return Err({ type: "refused", refusal: answer.value.refusal })
    }
    return Ok(undefined)
  }

  const stopHearing = connection.onState((state) => {
    const was = line.reach.type
    line.reach = state
    if (state.type === "open" && was !== "open") void catchUp()
  })
  await watch(ports.businessDay())
  told()

  return Ok({
    wrote,
    copyNow: () => {
      clearTimeout(line.copyTimer)
      line.copyTimer = undefined
      void reconcile(true)
    },
    takeOver,
    close: async () => {
      line.closed = true
      clearTimeout(line.copyTimer)
      clearTimeout(line.followTimer)
      await Promise.race([reconcile(true), new Promise((resolve) => setTimeout(resolve, CLOSING_WAIT_MS))])
      line.closeSubscription()
      stopHearing()
    },
  })
}
