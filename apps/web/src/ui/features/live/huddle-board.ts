import { createEffect, createSignal, on, onCleanup, type Accessor } from "solid-js"

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
 * after it was last shown, the latest of it then. Nothing is read or
 * shown where the device is in no huddle.
 */
export const createHuddleBoard = (draft: Accessor<PlayDraft>): HuddleBoard => {
  const app = useApp()
  const ports = huddlePortsOf(app.services)
  const [posts, setPosts] = createSignal<readonly HuddlePost[]>([])
  const [problem, setProblem] = createSignal<ApplicationError | undefined>()
  const held: { secret: string | undefined; read: number; lineEnd: number; shownAt: number; waiting: ReturnType<typeof setTimeout> | undefined } = { secret: undefined, read: 0, lineEnd: 0, shownAt: 0, waiting: undefined }

  const joined = (): Huddle | undefined => {
    const huddle = app.huddle.now()
    if (huddle?.secret !== held.secret) {
      held.secret = huddle?.secret
      held.read = 0
      held.lineEnd = 0
      setPosts([])
    }
    return huddle
  }

  const read = async (): Promise<void> => {
    const huddle = joined()
    if (huddle === undefined) return
    const found = await readHuddleAfter(ports, huddle, held.read)
    if (huddle.secret !== held.secret) return
    if (!found.ok) {
      setProblem(found.error)
      return
    }
    setProblem(undefined)
    held.read = found.value.head
    held.lineEnd = Math.max(held.lineEnd, found.value.head)
    if (found.value.posts.length > 0) setPosts((so) => [...so, ...found.value.posts])
  }

  const show = async (): Promise<void> => {
    held.waiting = undefined
    const huddle = joined()
    if (huddle === undefined) return
    held.shownAt = Date.now()
    const shown = await showToHuddle(ports, huddle, draft(), held.lineEnd)
    if (huddle.secret !== held.secret) return
    if (!shown.ok) {
      setProblem(shown.error)
      return
    }
    setProblem(undefined)
    held.lineEnd = shown.value
  }

  const showSoon = (): void => {
    if (held.waiting !== undefined) return
    held.waiting = setTimeout(() => void show(), Math.max(0, held.shownAt + SHOWN_AT_MOST_EVERY - Date.now()))
  }

  createEffect(on([() => app.huddle.now()?.secret, () => draft().log], ([secret]) => {
    if (secret === undefined) return
    void read()
    showSoon()
  }))
  const reading = setInterval(() => void read(), READ_EVERY)
  onCleanup(() => {
    clearInterval(reading)
    clearTimeout(held.waiting)
  })

  return { others: () => (app.huddle.now() === undefined ? [] : othersLatest(posts(), app.huddle.now()?.member ?? "")), problem }
}
