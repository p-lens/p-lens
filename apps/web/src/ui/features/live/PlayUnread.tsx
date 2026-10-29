import { type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import type { ApplicationError } from "../../../application/errors"
import type { PlayId } from "../../../core/play/play"
import { describeError } from "../../wording/errors"
import { ViewHeader } from "../shell/ViewHeader"

/**
 * A play's screen where the play cannot be read — recorded or deleted on
 * another screen, or broken: why, under a header whose way back goes to
 * the live list whichever of the play's screens it was, the play's own
 * being gone too. A phone without a back gesture is never left there.
 */
export function PlayUnread(props: { readonly playId: PlayId; readonly error: ApplicationError }): JSX.Element {
  return (
    <MainContent header={<ViewHeader place={{ kind: "live-play", playId: props.playId }} title="稼働" />}>
      <div class="max-w-5xl">
        <div role="alert" class="m-4 rounded-md border border-negative/40 bg-negative/10 px-4 py-3 text-sm text-text-primary">
          {describeError(props.error)}
        </div>
      </div>
    </MainContent>
  )
}
