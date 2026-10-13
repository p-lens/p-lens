import { createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js"

import { weighToldPlay, type Weighing, type WeighingAsked } from "../../../../application/pachinko/inference"
import { TRIALS_BY_HAND } from "../../../../core/pachinko/inference"
import { useApp } from "../../../context"

/** The weighing of the told play a form holds: where it is, and the press that begins it. */
export interface Weigher {
  readonly weighing: () => Weighing
  readonly weigh: () => void
}

/**
 * The weighing of the told play a form now holds, begun by a press and at
 * no other time. What was weighed is what the form said as it was pressed:
 * once the form says anything else of the play the weighing is stopped and
 * what it came to is gone, and is asked for again by another press. What
 * is asked is told apart by what it says, so typing elsewhere in the form
 * loses nothing. A press where the same play has been weighed weighs it
 * again, from the start: a play is weighed from the seed its id gives, so
 * it comes to what it came to — and whoever presses sees that it does.
 */
export const createWeighing = (asked: () => WeighingAsked | undefined): Weigher => {
  const app = useApp()
  const [weighing, setWeighing] = createSignal<Weighing>({ type: "resting" })
  const said = createMemo(() => ((now) => (now === undefined ? undefined : JSON.stringify(now)))(asked()))
  /** What the form said at the last press, and which press it was: a press that finds the form saying the same is still another weighing. */
  const [pressed, setPressed] = createSignal<{ readonly said: string | undefined; readonly press: number }>({ said: undefined, press: 0 })
  createEffect(() => {
    const now = said() !== undefined && said() === pressed().said ? untrack(asked) : undefined
    if (now === undefined) {
      setWeighing({ type: "resting" })
      return
    }
    const run = weighToldPlay(app.services.catalog, app.services.pachinko, now, TRIALS_BY_HAND, setWeighing)
    onCleanup(() => run.cancel())
  })
  return { weighing, weigh: () => setPressed((before) => ({ said: said(), press: before.press + 1 })) }
}
