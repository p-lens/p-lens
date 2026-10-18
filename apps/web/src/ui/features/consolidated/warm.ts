import { createEffect, on, onCleanup, type Accessor } from "solid-js"

import { warmConsolidation } from "../../../application/consolidation"
import type { Services } from "../../../application/services"
import { monthOf } from "../../../core/calendar/calendar"
import { monthQuery } from "../result-calendar"
import { consolidationShown } from "./shown"

/** How long after the app starts, or after a book is written, the consolidation is asked ahead: once the screen asked for has its answers. */
const WARM_AFTER = 3000

/**
 * The consolidation asked ahead for a person who keeps it on the rail,
 * a while after the app starts and after each book is written: nobody
 * else's device does the work. One asking at a time; a write while one
 * runs asks once more after it.
 */
export const warmConsolidationWhileShown = (services: Services, revision: Accessor<number>): void => {
  const held: { timer: ReturnType<typeof setTimeout> | undefined; running: boolean; again: boolean } = { timer: undefined, running: false, again: false }
  const warm = (): void => {
    if (!consolidationShown(services.preferences)) return
    if (held.running) {
      held.again = true
      return
    }
    held.running = true
    void warmConsolidation(services.session, monthQuery(monthOf(services.businessDay()))).finally(() => {
      held.running = false
      if (!held.again) return
      held.again = false
      warm()
    })
  }
  createEffect(
    on(revision, () => {
      clearTimeout(held.timer)
      held.timer = setTimeout(warm, WARM_AFTER)
    }),
  )
  onCleanup(() => clearTimeout(held.timer))
}
