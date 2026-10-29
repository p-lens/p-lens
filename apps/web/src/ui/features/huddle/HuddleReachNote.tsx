import { Show, type JSX } from "solid-js"

import type { SyncProblem } from "../../../application/errors"
import { useApp } from "../../context"
import { huddleUnheardText, huddleUntoldText } from "../../wording/huddle"
import type { Reach } from "../../primitives/reach"

/** A reach's problem, where it failed for a reason of the relay's. */
const problemOf = (reach: Reach): SyncProblem | undefined => (reach.type === "unreached" && reach.error.type === "sync" ? reach.error.problem : undefined)

/**
 * A quiet line over what a huddle's screens show, while the line cannot be
 * reached: the others' plays as of when, and this device's own not yet
 * shown. Nothing is said while both go through, and it goes by itself as
 * they do again.
 */
export function HuddleReachNote(): JSX.Element {
  const app = useApp()
  const sinceHeard = (): string | undefined => ((heard) => (heard.type === "unreached" ? heard.since : undefined))(app.huddle.line.heard())
  return (
    <>
      <Show when={problemOf(app.huddle.line.heard())} keyed>
        {(problem) => (
          <p role="status" class="rounded-md bg-warning/10 px-3 py-2 text-xs text-text-secondary">
            {huddleUnheardText(sinceHeard(), problem)}
          </p>
        )}
      </Show>
      <Show when={problemOf(app.huddle.line.told())} keyed>
        {(problem) => (
          <p role="status" class="rounded-md bg-warning/10 px-3 py-2 text-xs text-text-secondary">
            {huddleUntoldText(problem)}
          </p>
        )}
      </Show>
    </>
  )
}
