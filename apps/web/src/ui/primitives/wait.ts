import { createEffect, createSignal, on, onCleanup, type Accessor } from "solid-js"

/** How long a wait is passed over in silence, in milliseconds: an answer that comes within it never shows it was waited for. */
const QUIET_FOR = 200

/** How long the sign of waiting stays once it is shown, in milliseconds: shown for less, it is a flicker. */
const SHOWN_FOR = 500

/**
 * Where a wait stands on screen.
 *
 * - `over`: the answer is there to be shown.
 * - `quiet`: waiting, and saying nothing yet.
 * - `shown`: the sign of waiting is up, and stays until the answer has come
 *   and the sign has been up long enough to be read.
 */
export type Wait = { readonly type: "over" } | { readonly type: "quiet" } | { readonly type: "shown"; readonly answered: boolean; readonly longEnough: boolean }

/**
 * What moves a wait on: the wait beginning, its answer coming, the quiet
 * running out, and the sign having been up long enough.
 */
export type WaitEvent = "began" | "answered" | "quiet-over" | "shown-long-enough"

const settled = (wait: Wait & { readonly type: "shown" }): Wait => (wait.answered && wait.longEnough ? { type: "over" } : wait)

/** A wait after something happened to it. What cannot happen where it stands leaves it as it is. */
export const waitAfter = (wait: Wait, event: WaitEvent): Wait => {
  switch (event) {
    case "began":
      return wait.type === "over" ? { type: "quiet" } : wait.type === "shown" ? { ...wait, answered: false } : wait
    case "answered":
      return wait.type === "quiet" ? { type: "over" } : wait.type === "shown" ? settled({ ...wait, answered: true }) : wait
    case "quiet-over":
      return wait.type === "quiet" ? { type: "shown", answered: false, longEnough: false } : wait
    case "shown-long-enough":
      return wait.type === "shown" ? settled({ ...wait, longEnough: true }) : wait
  }
}

/**
 * A wait as the screen should show it, followed from whether something is
 * still waited for: nothing for a wait too short to notice, and a sign that,
 * once up, stays long enough to be seen rather than flash.
 */
export const createWait = (waiting: Accessor<boolean>): Accessor<Wait> => {
  const [wait, setWait] = createSignal<Wait>(waiting() ? { type: "quiet" } : { type: "over" })
  const timers: { quiet: ReturnType<typeof setTimeout> | undefined; shown: ReturnType<typeof setTimeout> | undefined } = { quiet: undefined, shown: undefined }
  const happened = (event: WaitEvent): void => {
    setWait((current) => waitAfter(current, event))
  }
  const shownSoon = (): void => {
    clearTimeout(timers.quiet)
    timers.quiet = setTimeout(() => {
      happened("quiet-over")
      timers.shown = setTimeout(() => happened("shown-long-enough"), SHOWN_FOR)
    }, QUIET_FOR)
  }
  createEffect(
    on(waiting, (still) => {
      if (!still) {
        clearTimeout(timers.quiet)
        happened("answered")
        return
      }
      happened("began")
      if (wait().type === "quiet") shownSoon()
    }),
  )
  onCleanup(() => {
    clearTimeout(timers.quiet)
    clearTimeout(timers.shown)
  })
  return wait
}
