import { createEffect, createMemo, on, onCleanup, type JSX } from "solid-js"

import { loadTodaysPlays } from "../../../application/live-play"
import type { Huddle } from "../../../core/huddle/huddle"
import { ofHuddleDay } from "../../../core/huddle/room"
import { givenUp, huddlePostOf, huddleWithdrawalOf, latestEntries, type HuddleEntry } from "../../../core/huddle/post"
import { huddleTurnOf, jackpotsNow, louderTurn } from "../../../core/huddle/standing"
import type { PlayDraft } from "../../../core/live-play/draft"
import type { PlayId } from "../../../core/play/play"
import { openHuddleLine, showingEvery, type CrossingServices, type HuddleLine, type HuddleProblem } from "../../../crossing"
import { useApp } from "../../context"
import type { Place } from "../../navigation/place"
import { onShownAgain } from "../../primitives/shown-again"
import { reachAfter } from "../../primitives/reach"

/** How long a line is kept open after the page goes out of sight, or the huddle is left, in milliseconds: long enough for what was just put on it to be heard kept. */
const CLOSED_AFTER = 3_000

/** An entry to put on the line, and what is noted once it is there. */
type Putting = { readonly entry: HuddleEntry; readonly done: () => void }

/** Whether the page is out of sight: another app or tab before it, or the screen off. */
const away = (): boolean => document.visibilityState === "hidden"

/** One's own plays of the day that changed since they were last shown. */
const changedSince = (drafts: readonly PlayDraft[], shown: ReadonlyMap<string, string>): readonly PlayDraft[] => drafts.filter((draft) => shown.get(draft.id) !== draft.log)

/**
 * The huddle kept up for as long as the app is open, wherever it is: its
 * line kept open on its relay while the page is in sight — the others'
 * plays coming as they are shown, into the page's `HuddleLine` — and let go
 * a moment after the page goes away, opened again as it comes back; and each
 * of the day's own plays shown to the others when it changes — at once, or
 * as soon after the last showing as the room's size allows, the latest of
 * each then — every one again under a new name the person goes by, and
 * each it showed and has since given up taken back, so the others let it go
 * too, whichever screen gave it up. What failed to be shown is tried again
 * at each look. Nothing is opened or shown where the device is in no
 * huddle, and nothing is drawn.
 *
 * It also says when the way back to the day's list is urged: as who of the
 * others is in a jackpot changes — one wins one, one's ends — and not while
 * one goes on, until the list is looked at, which is anywhere but one's
 * own play.
 */
export function HuddleRunner(props: { readonly place: Place; readonly crossing: CrossingServices }): JSX.Element {
  const app = useApp()
  const line = app.huddle.line
  const held = line.held
  const timers: { showing: ReturnType<typeof setTimeout> | undefined; closing: ReturnType<typeof setTimeout> | undefined } = { showing: undefined, closing: undefined }

  const letGo = (open: HuddleLine | undefined, after: number): void => {
    if (open === undefined) return
    clearTimeout(timers.closing)
    timers.closing = setTimeout(() => open.close(), after)
  }

  const heardOf = (huddle: Huddle) => (problem: HuddleProblem | undefined): void => {
    if (huddle.secret === held.secret) line.setHeard((was) => reachAfter(was, problem, app.services.now()))
  }

  const open = async (huddle: Huddle): Promise<void> => {
    const opened = await openHuddleLine(props.crossing.huddle.keys, props.crossing.huddle.relays, huddle, {
      onEntries: (entries) => {
        if (huddle.secret === held.secret) line.setEntries(latestEntries(entries))
      },
      onHeard: heardOf(huddle),
    })
    if (huddle.secret !== held.secret || held.line !== undefined) return opened.close()
    held.line = opened
    showSoon()
  }

  const joined = (): Huddle | undefined => {
    const huddle = app.huddle.now()
    if (huddle?.secret !== held.secret) {
      letGo(held.line, CLOSED_AFTER)
      held.secret = huddle?.secret
      held.line = undefined
      held.shownAt = 0
      held.shown = new Map()
      line.setEntries([])
      line.setHeard({ type: "not-yet" })
      line.setTold({ type: "not-yet" })
      line.setUrged(undefined)
      line.setKeptUp(huddle?.secret)
      if (huddle !== undefined && !away()) void open(huddle)
    }
    return huddle
  }

  const told = (huddle: Huddle, problem: HuddleProblem | undefined): boolean => {
    if (huddle.secret !== held.secret) return false
    line.setTold((was) => reachAfter(was, problem, app.services.now()))
    return problem === undefined
  }

  const putEach = async (huddle: Huddle, open: HuddleLine, entries: readonly Putting[]): Promise<void> => {
    const [next, ...rest] = entries
    if (next === undefined) return
    const put = await open.put(next.entry)
    if (!told(huddle, put.ok ? undefined : put.error)) return
    next.done()
    await putEach(huddle, open, rest)
  }

  const show = async (): Promise<void> => {
    timers.showing = undefined
    const huddle = joined()
    const open = held.line
    if (huddle === undefined || open === undefined) return
    const found = await loadTodaysPlays(app.services.drafts, app.services.businessDay())
    if (!found.ok) return
    held.shownAt = Date.now()
    const shown = found.value.filter((draft) => ofHuddleDay(huddle, draft))
    const withdrawn = givenUp(line.entries(), huddle.member, new Set(shown.map((draft) => draft.id))).map((playId: PlayId): Putting => ({
      entry: huddleWithdrawalOf(playId, huddle, app.services.now()),
      done: () => undefined,
    }))
    const changed = changedSince(shown, held.shown).map((draft): Putting => ({
      entry: huddlePostOf(draft, huddle, app.services.now()),
      done: () => {
        held.shown = new Map(held.shown).set(draft.id, draft.log)
      },
    }))
    await putEach(huddle, open, [...withdrawn, ...changed])
  }

  const members = (): number => new Set(line.entries().map((entry) => entry.member)).size + 1

  const showSoon = (): void => {
    if (timers.showing !== undefined) return
    timers.showing = setTimeout(() => void show(), Math.max(0, held.shownAt + showingEvery(members()) - Date.now()))
  }

  createEffect(on([() => app.huddle.now()?.secret, () => app.revision()], ([secret]) => {
    joined()
    if (secret !== undefined) showSoon()
  }))
  createEffect(on(() => app.huddle.now()?.name, (name, before) => {
    if (before === undefined || name === undefined || name === before) return
    held.shown = new Map()
    showSoon()
  }, { defer: true }))
  const jackpots = createMemo(() => jackpotsNow(app.huddle.others()))
  const onOwnPlay = (): boolean => props.place.kind === "live-play" || props.place.kind === "live-record" || props.place.kind === "live-cabinet"
  createEffect(on(jackpots, (now, before) => {
    if (before !== undefined && onOwnPlay()) line.setUrged((so) => louderTurn(so, huddleTurnOf(before, now)))
  }))
  createEffect(() => {
    if (!onOwnPlay()) line.setUrged(undefined)
  })

  /** Back in sight: the line opened again, and what has not reached it tried again. */
  const back = (): void => {
    const huddle = joined()
    if (huddle === undefined || away()) return
    clearTimeout(timers.closing)
    if (held.line === undefined) void open(huddle)
    else held.line.reopen()
    showSoon()
  }
  /** Gone from sight: what changed shown at once, and the line let go a moment after, so that a phone's radio rests. */
  const hidden = (): void => {
    if (!away() || held.line === undefined) return
    void show()
    const open = held.line
    held.line = undefined
    letGo(open, CLOSED_AFTER)
  }
  const stopListening = onShownAgain(back)
  document.addEventListener("visibilitychange", hidden)
  window.addEventListener("online", back)
  onCleanup(() => {
    stopListening()
    document.removeEventListener("visibilitychange", hidden)
    window.removeEventListener("online", back)
    line.setKeptUp(undefined)
    clearTimeout(timers.showing)
    held.line?.close()
    held.line = undefined
    held.secret = undefined
  })
  return undefined
}
