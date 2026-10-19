import { createSignal, onCleanup, type Accessor } from "solid-js"

import type { Services } from "../../../application/services"

/** How long after the last word that an answer was outdated the consolidation is asked again: the books found changed in one going over, taken together. */
const ASK_AGAIN_AFTER = 500

/** A count of the times the consolidation's answers were found outdated, counted once the words stop coming. */
export const heardOutdated = (services: Services): Accessor<number> => {
  const [count, setCount] = createSignal(0)
  const held: { timer: ReturnType<typeof setTimeout> | undefined } = { timer: undefined }
  const stop = services.consolidation.outdated.heard(() => {
    clearTimeout(held.timer)
    held.timer = setTimeout(() => setCount((counted) => counted + 1), ASK_AGAIN_AFTER)
  })
  onCleanup(() => {
    stop()
    clearTimeout(held.timer)
  })
  return count
}
