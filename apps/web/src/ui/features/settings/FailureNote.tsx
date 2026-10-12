import type { JSX } from "solid-js"

import type { ApplicationError } from "../../../application/errors"
import { describeError } from "../../wording/errors"

/** Why a press did not take, said under what was pressed. */
export function FailureNote(props: { readonly error: ApplicationError }): JSX.Element {
  return (
    <p role="alert" class="rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-text-primary">
      {describeError(props.error)}
    </p>
  )
}
