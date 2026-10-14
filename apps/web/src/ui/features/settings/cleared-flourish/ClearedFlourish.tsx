import { render } from "solid-js/web"
import type { JSX } from "solid-js"

import "./cleared-flourish.css"

/** How long the flourish stands before the app is opened afresh: the ring, the words, and a moment to read them. */
const STANDS_FOR = 1_700

/** A ring drawn round from twelve o'clock, and the words that the device is empty under it. */
function ClearedFlourish(): JSX.Element {
  return (
    <div class="cleared-flourish" role="status" aria-live="polite">
      <svg class="cleared-flourish__ring" viewBox="0 0 40 40" aria-hidden="true">
        <circle class="cleared-flourish__track" cx="20" cy="20" r="16" />
        <circle class="cleared-flourish__sweep" cx="20" cy="20" r="16" pathLength="100" />
      </svg>
      <p class="cleared-flourish__said">消去しました</p>
    </div>
  )
}

/**
 * Says the device is emptied with a flourish of no use: a ring swept
 * round from twelve o'clock, quickly, then the words, softly. Laid over
 * the whole page on its own, outside the app, since the app is about to
 * be opened afresh; settled once it has stood long enough to be read.
 * Nothing else depends on it: taking it away is taking this folder away
 * and the one call to it.
 */
export const showClearedFlourish = (): Promise<void> => {
  const host = document.createElement("div")
  document.body.append(host)
  render(() => <ClearedFlourish />, host)
  return new Promise((settled) => setTimeout(settled, STANDS_FOR))
}
