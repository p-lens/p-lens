import { createEffect, on, onCleanup, type JSX } from "solid-js"

import type { Outcome } from "../../../application/errors"
import { readHuddleAfter, showToHuddle } from "../../../application/huddle"
import { loadTodaysPlays } from "../../../application/live-play"
import type { Huddle } from "../../../core/huddle/huddle"
import type { PlayDraft } from "../../../core/live-play/draft"
import { useApp } from "../../context"
import { huddlePortsOf } from "./huddle-ports"

/** How often the huddle's line is read, in milliseconds. */
const READ_EVERY = 15_000

/** The least time between two showings of one's own plays, in milliseconds: readings typed in a row go as one. */
const SHOWN_AT_MOST_EVERY = 20_000

/** One's own plays of the day that changed since they were last shown: those that came from someone else are theirs to show. */
const changedSince = (drafts: readonly PlayDraft[], shown: ReadonlyMap<string, string>): readonly PlayDraft[] =>
  drafts.filter((draft) => draft.received === undefined && shown.get(draft.id) !== draft.log)

/**
 * The huddle kept up for as long as the app is open, wherever it is: its
 * line read at once and every 15 seconds after, into the page's
 * `HuddleLine`, and each of the day's own plays shown to the others when
 * it changes — at once, or 20 seconds after the last showing, the latest
 * of each then. Nothing is read or shown where the device is in no huddle,
 * and nothing is drawn.
 */
export function HuddleRunner(): JSX.Element {
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
      line.setPosts([])
      line.setProblem(undefined)
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
    if (huddle === undefined || held.reading) return
    held.reading = true
    const found = await readHuddleAfter(ports, huddle, held.read)
    held.reading = false
    if (!settled(huddle, found) || !found.ok) return
    held.read = found.value.head
    held.lineEnd = Math.max(held.lineEnd, found.value.head)
    if (found.value.posts.length > 0) line.setPosts((so) => [...so, ...found.value.posts])
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

  const show = async (): Promise<void> => {
    waiting.timer = undefined
    const huddle = joined()
    if (huddle === undefined) return
    const found = await loadTodaysPlays(app.services.drafts, app.services.businessDay())
    if (!found.ok) return
    held.shownAt = Date.now()
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
  const reading = setInterval(() => void read(), READ_EVERY)
  onCleanup(() => {
    clearInterval(reading)
    clearTimeout(waiting.timer)
  })
  return undefined
}
