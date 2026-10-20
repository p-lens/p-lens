import { createEffect, on, onCleanup, type Accessor } from "solid-js"

import type { ApplicationError } from "../../../application/errors"
import { readHuddleAfter, showToHuddle, type HuddlePorts } from "../../../application/huddle"
import type { Services } from "../../../application/services"
import type { Huddle } from "../../../core/huddle/huddle"
import { othersLatest, type HuddlePost } from "../../../core/huddle/post"
import type { PlayDraft } from "../../../core/live-play/draft"
import { useApp } from "../../context"

/** What a huddle reaches, out of what the app is made of. */
export const huddlePortsOf = (services: Services): HuddlePorts => ({
  relay: services.sync.relay,
  sealer: services.sync.sealer,
  packer: services.packer,
  preferences: services.preferences,
  relayUrl: services.relayUrl,
  now: services.now,
  newId: () => crypto.randomUUID(),
})

/** How often the huddle's line is read while a play's screen is open, in milliseconds. */
const READ_EVERY = 15_000

/** The least time between two showings of one's own play, in milliseconds: readings typed in a row go as one. */
const SHOWN_AT_MOST_EVERY = 20_000

/** The huddle as a live play's screen has it: what each of the others last showed, and why the line could not be reached, where it last could not. */
export interface HuddleBoard {
  readonly others: Accessor<readonly HuddlePost[]>
  readonly problem: Accessor<ApplicationError | undefined>
}

/**
 * The huddle seen from a live play's screen, for as long as it is open:
 * its line read as the screen opens and every 15 seconds after, and the
 * play shown to the others each time it changes — at once, or 20 seconds
 * after it was last shown, the latest of it then. What has been read and
 * when the play was last shown are the page's (`HuddleLine`), so a screen
 * made again goes on from them. Nothing is read or shown where the device
 * is in no huddle.
 */
export const createHuddleBoard = (draft: Accessor<PlayDraft>): HuddleBoard => {
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
      line.setPosts([])
      line.setProblem(undefined)
    }
    return huddle
  }

  const read = async (): Promise<void> => {
    const huddle = joined()
    if (huddle === undefined || held.reading) return
    held.reading = true
    const found = await readHuddleAfter(ports, huddle, held.read)
    held.reading = false
    if (huddle.secret !== held.secret) return
    if (!found.ok) {
      line.setProblem(found.error)
      return
    }
    line.setProblem(undefined)
    held.read = found.value.head
    held.lineEnd = Math.max(held.lineEnd, found.value.head)
    if (found.value.posts.length > 0) line.setPosts((so) => [...so, ...found.value.posts])
  }

  const show = async (): Promise<void> => {
    waiting.timer = undefined
    const huddle = joined()
    if (huddle === undefined) return
    held.shownAt = Date.now()
    const shown = await showToHuddle(ports, huddle, draft(), held.lineEnd)
    if (huddle.secret !== held.secret) return
    if (!shown.ok) {
      line.setProblem(shown.error)
      return
    }
    line.setProblem(undefined)
    held.lineEnd = Math.max(held.lineEnd, shown.value)
  }

  const showSoon = (): void => {
    if (waiting.timer !== undefined) return
    waiting.timer = setTimeout(() => void show(), Math.max(0, held.shownAt + SHOWN_AT_MOST_EVERY - Date.now()))
  }

  createEffect(on([() => app.huddle.now()?.secret, () => draft().log], ([secret]) => {
    if (secret === undefined) return
    void read()
    showSoon()
  }))
  const reading = setInterval(() => void read(), READ_EVERY)
  onCleanup(() => {
    clearInterval(reading)
    clearTimeout(waiting.timer)
  })

  return { others: () => (app.huddle.now() === undefined ? [] : othersLatest(line.posts(), app.huddle.now()?.member ?? "")), problem: line.problem }
}
