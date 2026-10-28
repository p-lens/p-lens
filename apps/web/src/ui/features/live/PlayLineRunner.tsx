import { createEffect, on, onCleanup, onMount, type JSX } from "solid-js"

import type { Outcome } from "../../../application/errors"
import { loadDrafts } from "../../../application/live-play"
import { flushOnHide, followPlays, isLargeShowing, readPlayLines, showHeldPlays, type Followings, type KeptLine, type LinesRead } from "../../../application/play-line"
import type { IsoDate } from "../../../core/calendar/calendar"
import type { PlayDraft } from "../../../core/live-play/draft"
import type { PlayLineAction } from "../../../core/play-line/reconcile"
import type { PlayId } from "../../../core/play/play"
import { useApp } from "../../context"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { onShownAgain } from "../../primitives/shown-again"
import { toast } from "../../primitives/toast"
import { playGoneText } from "../../wording/errors"
import { FOLLOWED_RECORDED, lostReadingsText, YIELDED } from "../../wording/play-line"

/** How often the clock is looked at to see whether a line is due to be read, in milliseconds: as often as the quickest reading. */
const TICK = 5_000

/** How often the line of a play another device holds is read while it is open, in milliseconds: a device set up to stream that play shows it as it goes. That book's lines alone are read this often. */
const READ_WATCHING = 5_000

/** How often the lines are read while the day's plays, or one this device holds, are before the person, in milliseconds. */
const READ_EVERY = 30_000

/** How long after a write its play is shown, in milliseconds: readings typed in a row go as one. */
const AFTER_WRITING = 2_000

/** The least time between two showings, in milliseconds. */
const SHOWN_AT_MOST_EVERY = 4_000

/** The least time between two showings where a play shown is past what the relay takes as a small body, in milliseconds: a large one is let go less often. */
const LARGE_SHOWN_AT_MOST_EVERY = 30_000

/** How much sooner than its time a reading is let go on a tick, in milliseconds: the ticks drift, and a reading just short of its time would wait a whole tick more. */
const LEEWAY = TICK / 2

/** Whether the page is out of sight: another app or tab before it, or the screen off. */
const away = (): boolean => document.visibilityState === "hidden"

/** Whether the day's plays, or one of them, are before the person: anywhere in ライブ計測. */
const onLive = (place: Place): boolean => place.kind === "live" || place.kind === "live-new" || place.kind === "live-play" || place.kind === "live-record" || place.kind === "live-cabinet"

const openPlay = (place: Place): PlayId | undefined => (place.kind === "live-play" || place.kind === "live-record" || place.kind === "live-cabinet" ? place.playId : undefined)

/** The plays this device holds as they stand on the business day, each as its text: what was last shown is told from what is to be shown by these. */
const printsOf = (drafts: readonly PlayDraft[], businessDay: IsoDate): ReadonlyMap<string, string> => new Map(drafts.map((draft) => [draft.id, `${businessDay} ${JSON.stringify(draft)}`]))

/** The plays whose print differs from the one last shown: those a showing would put on a line. */
const changedSince = (drafts: readonly PlayDraft[], prints: ReadonlyMap<string, string>, shown: ReadonlyMap<string, string>): readonly PlayDraft[] => drafts.filter((draft) => prints.get(draft.id) !== shown.get(draft.id))

const samePrints = (left: ReadonlyMap<string, string>, right: ReadonlyMap<string, string>): boolean => left.size === right.size && [...left].every(([id, print]) => right.get(id) === print)

/** What a turn of the runner does: read every book's lines, read the line of the play watched, or show. */
type TurnKind = "read" | "watch" | "show"

/** What the runner keeps between its turns: the lines as read so far, its turns in order, which are waiting, when it last read every book's lines and any, when it last showed, and what it last showed. */
interface Held {
  lines: readonly KeptLine[]
  turn: Promise<void>
  queued: ReadonlySet<TurnKind>
  waiting: ReturnType<typeof setTimeout> | undefined
  readAt: number
  anyReadAt: number
  shownAt: number
  spacing: number
  shown: ReadonlyMap<string, string>
}

/**
 * The person's plays kept in step between their own devices for as long
 * as the app is open, wherever it is: the lines of their own books this
 * device syncs read at once, every 30 seconds while the day's plays are
 * before them — the line of a play another device holds every 5 while it
 * is open — at once as the page is back and never while it is away; and
 * the plays this device holds shown 2 seconds after a write, no more than once every 4
 * seconds — every 30 where a play would be shown whole and is large. As the page is put away what
 * is still to be shown goes at once, without waiting, should the device
 * not come back.
 *
 * Whatever the lines change of the plays kept here has every screen read
 * them again; a play given up to another device is said so, and where
 * readings typed here never reached it, how many, once. A play being
 * watched that was deleted, recorded on a day after it began, or now goes
 * to a book this device does not sync, is left for the day's list, with
 * why. Nothing is read or shown
 * where the app has no relay, and nothing is drawn.
 */
export function PlayLineRunner(props: { readonly place: Place }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const ports = app.services.playLine
  const held: Held = { lines: [], turn: Promise.resolve(), queued: new Set(), waiting: undefined, readAt: 0, anyReadAt: 0, shownAt: 0, spacing: SHOWN_AT_MOST_EVERY, shown: new Map() }

  const inTurn = (kind: TurnKind, work: () => Promise<void>): void => {
    if (held.queued.has(kind)) return
    held.queued = new Set([...held.queued, kind])
    const turn = held.turn.then(() => {
      held.queued = new Set([...held.queued].filter((each) => each !== kind))
      return work()
    })
    held.turn = turn.catch(() => undefined)
  }

  const leftFor = (action: PlayLineAction): void => {
    if (action.type !== "drop-followed" || openPlay(props.place) !== action.playId) return
    toast({ title: action.reason === "recorded" ? FOLLOWED_RECORDED : playGoneText(action.reason), stays: "read" })
    moves.replace({ kind: "live" })
  }

  const told = (acted: readonly PlayLineAction[]): void => {
    acted.forEach((action) => {
      if (action.type === "yield-up") toast(action.unshown > 0 ? { title: lostReadingsText(action.unshown), tone: "error", stays: "read" } : { title: YIELDED, stays: "glance" })
      leftFor(action)
    })
    if (acted.length > 0) app.played()
  }

  const kept = (found: Outcome<Followings>): void => {
    if (!found.ok) return
    held.lines = found.value.lines
    told(found.value.acted)
  }

  const showSoon = (): void => {
    if (held.waiting !== undefined) return
    held.waiting = setTimeout(() => {
      held.waiting = undefined
      inTurn("show", show)
    }, Math.max(AFTER_WRITING, held.shownAt + held.spacing - Date.now()))
  }

  const show = async (): Promise<void> => {
    if (away()) return
    const found = await loadDrafts(ports.drafts)
    if (!found.ok) return
    const prints = printsOf(found.value, ports.businessDay())
    if (samePrints(prints, held.shown)) return
    held.shownAt = Date.now()
    held.spacing = (await isLargeShowing(ports, held.lines, changedSince(found.value, prints, held.shown))) ? LARGE_SHOWN_AT_MOST_EVERY : SHOWN_AT_MOST_EVERY
    const shown = await showHeldPlays(ports, held.lines)
    if (shown.ok) held.shown = prints
    kept(shown)
  }

  const readOf = (reading: LinesRead) => async (): Promise<void> => {
    if (away()) return
    held.anyReadAt = Date.now()
    if (reading.type === "every-book") held.readAt = held.anyReadAt
    const lines = await readPlayLines(ports, held.lines, reading)
    if (!lines.ok) return
    held.lines = lines.value
    kept(await followPlays(ports, lines.value))
    showSoon()
  }

  const readNow = (): void => inTurn("read", readOf({ type: "every-book" }))

  const since = (at: number): number => Date.now() - at

  /** What reading is due on a tick: every book's lines every 30 seconds while anywhere in ライブ計測, and in between, every 5, the line of a play being watched. */
  const due = (): LinesRead | undefined => {
    const watching = app.playLine.watching()
    if (onLive(props.place) && since(held.readAt) >= READ_EVERY - LEEWAY) return { type: "every-book" }
    return watching !== undefined && since(held.anyReadAt) >= READ_WATCHING - LEEWAY ? { type: "book-of", playId: watching } : undefined
  }

  const putAway = (): void => {
    clearTimeout(held.waiting)
    held.waiting = undefined
    void flushOnHide(ports, held.lines)
  }

  const turnedAway = (): void => {
    if (away()) putAway()
  }

  if (app.services.relayUrl === undefined) return undefined
  createEffect(on(() => app.revision(), showSoon, { defer: true }))
  createEffect(on(() => app.playLine.watching(), (watching) => {
    if (watching !== undefined) inTurn("watch", readOf({ type: "book-of", playId: watching }))
  }, { defer: true }))
  onMount(() => {
    readNow()
    document.addEventListener("visibilitychange", turnedAway)
    window.addEventListener("pagehide", putAway)
  })
  const ticking = setInterval(() => {
    const reading = due()
    if (reading !== undefined) inTurn(reading.type === "every-book" ? "read" : "watch", readOf(reading))
  }, TICK)
  const stopListening = onShownAgain(readNow)
  onCleanup(() => {
    stopListening()
    clearInterval(ticking)
    clearTimeout(held.waiting)
    document.removeEventListener("visibilitychange", turnedAway)
    window.removeEventListener("pagehide", putAway)
  })
  return undefined
}
