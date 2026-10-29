import { Match, Switch, type JSX } from "solid-js"

import type { ApplicationError } from "../../../application/errors"
import { describeError } from "../../wording/errors"
import { PARLORLESS_STILL, parlorListAsOfText } from "../../wording/parlor"
import type { ListAge } from "./offered"

/**
 * A quiet line over a form whose parlor field offers the list: where it
 * offers none, the list not having been read, why, and that the form goes
 * on without it; where it offers the device's copy and that copy is old,
 * as of when it is.
 */
export function ParlorListNote(props: { readonly failure: ApplicationError | undefined; readonly age: ListAge }): JSX.Element {
  return (
    <Switch>
      <Match when={props.failure} keyed>
        {(error) => (
          <p role="status" class="px-4 pt-3 text-xs text-text-muted">
            {describeError(error)}
            {PARLORLESS_STILL}
          </p>
        )}
      </Match>
      <Match when={props.age.type === "old" && props.age} keyed>
        {(old) => (
          <p role="status" class="px-4 pt-3 text-xs text-text-muted">
            {parlorListAsOfText(old.readAt)}
          </p>
        )}
      </Match>
    </Switch>
  )
}
