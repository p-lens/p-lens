import { createEffect, createMemo, on, onCleanup, type JSX } from "solid-js"

import type { Outcome } from "../../../application/errors"
import { readHuddleAfter, showToHuddle, withdrawFromHuddle } from "../../../application/huddle"
import { loadTodaysPlays } from "../../../application/live-play"
import type { Huddle } from "../../../core/huddle/huddle"
import { givenUp, latestEntries } from "../../../core/huddle/post"
import { huddleTurnOf, jackpotsNow, louderTurn } from "../../../core/huddle/standing"
import type { PlayDraft } from "../../../core/live-play/draft"
import type { PlayId } from "../../../core/play/play"
import { useApp } from "../../context"
import type { Place } from "../../navigation/place"
import { onShownAgain } from "../../primitives/shown-again"
import { huddlePortsOf } from "./huddle-ports"

/** How often the huddle's line is read while the page is before the person, in milliseconds: a phone's radio asked more often than this is never let rest. */
const READ_EVERY = 30_000

/** The least time between two showings of one's own plays, in milliseconds: readings typed in a row go as one. */
const SHOWN_AT_MOST_EVERY = 30_000

/** Whether the page is out of sight: another app or tab before it, or the screen off. */
const away = (): boolean => document.visibilityState === "hidden"

/** One's own plays of the day that changed since they were last shown: those that came from someone else are theirs to show. */
const changedSince = (drafts: readonly PlayDraft[], shown: ReadonlyMap<string, string>): readonly PlayDraft[] =>
  drafts.filter((draft) => draft.received === undefined && shown.get(draft.id) !== draft.log)

/**
 * The huddle kept up for as long as the app is open, wherever it is: its
 * line read at once and every 30 seconds after, into the page's
 * `HuddleLine`, while the page is in sight — not while it is away, and at
 * once as it is back — and each of the day's own plays shown to the others when
 * it changes — at once, or 30 seconds after the last showing, the latest
 * of each then — every one again under a new name the person goes by, and
 * each it showed and has since given up taken back, so the others let it go
 * too, whichever screen gave it up. Nothing is read
 * or shown where the device is in no huddle, and nothing is drawn.
 *
 * It also says when the way back to the day's list is urged: as who of the
 * others is in a jackpot changes — one wins one, one's ends — and not while
 * one goes on, until the list is looked at, which is anywhere but one's
 * own play.
 */
export function HuddleRunner(props: { readonly place: Place }): JSX.Element {
  const app = useApp()
  const ports = huddlePortsOf(app.services)
  const line = app.huddle.line
  const held = line.held
  const waiting: { timer: ReturnType<typeof setTimeout> | undefined } = { timer: undefined }

  const joined = (): Huddle | undefined => {
    const huddle = app.huddle.now()
    if (huddle?.secret !== held.secret) {
      held.secret = huddle?.secret
      held.read = 0
      held.lineEnd = 0
      held.shownAt = 0
      held.shown = new Map()
      line.setEntries([])
      line.setProblem(undefined)
      line.setUrged(undefined)
      line.setKeptUp(huddle?.secret)
    }
    return huddle
  }

  const settled = (huddle: Huddle, outcome: Outcome<unknown>): boolean => {
    if (huddle.secret !== held.secret) return false
    line.setProblem(outcome.ok ? undefined : outcome.error)
    return outcome.ok
  }

  const read = async (): Promise<void> => {
    const huddle = joined()
    if (huddle === undefined || held.reading || away()) return
    held.reading = true
    const found = await readHuddleAfter(ports, huddle, held.read)
    held.reading = false
    if (!settled(huddle, found) || !found.ok) return
    held.read = found.value.head
    held.lineEnd = Math.max(held.lineEnd, found.value.head)
    if (found.value.entries.length > 0) line.setEntries((so) => latestEntries([...so, ...found.value.entries]))
  }

  const showEach = async (huddle: Huddle, drafts: readonly PlayDraft[]): Promise<void> => {
    const [draft, ...rest] = drafts
    if (draft === undefined) return
    const shown = await showToHuddle(ports, huddle, draft, held.lineEnd)
    if (!settled(huddle, shown) || !shown.ok) return
    held.lineEnd = Math.max(held.lineEnd, shown.value)
    held.shown = new Map(held.shown).set(draft.id, draft.log)
    await showEach(huddle, rest)
  }

  const withdrawEach = async (huddle: Huddle, playIds: readonly PlayId[]): Promise<void> => {
    const [playId, ...rest] = playIds
    if (playId === undefined) return
    const withdrawn = await withdrawFromHuddle(ports, huddle, playId, held.lineEnd)
    if (!settled(huddle, withdrawn) || !withdrawn.ok) return
    held.lineEnd = Math.max(held.lineEnd, withdrawn.value)
    await withdrawEach(huddle, rest)
  }

  const show = async (): Promise<void> => {
    waiting.timer = undefined
    const huddle = joined()
    if (huddle === undefined) return
    const found = await loadTodaysPlays(app.services.drafts, app.services.businessDay())
    if (!found.ok) return
    held.shownAt = Date.now()
    await withdrawEach(huddle, givenUp(line.entries(), huddle.member, new Set(found.value.map((draft) => draft.id))))
    await showEach(huddle, changedSince(found.value, held.shown))
  }

  const showSoon = (): void => {
    if (waiting.timer !== undefined) return
    waiting.timer = setTimeout(() => void show(), Math.max(0, held.shownAt + SHOWN_AT_MOST_EVERY - Date.now()))
  }

  createEffect(on([() => app.huddle.now()?.secret, () => app.revision()], ([secret]) => {
    if (secret === undefined) return
    void read()
    showSoon()
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
  const reading = setInterval(() => void read(), READ_EVERY)
  const stopListening = onShownAgain(() => void read())
  onCleanup(() => {
    stopListening()
    line.setKeptUp(undefined)
    clearInterval(reading)
    clearTimeout(waiting.timer)
  })
  return undefined
}
