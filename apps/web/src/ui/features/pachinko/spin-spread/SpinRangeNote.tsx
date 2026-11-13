import type { JSX } from "solid-js"

import type { Measured } from "../../../../core/pachinko/consumption"
import { measuredSpinRangeOf } from "../../../../core/pachinko/spin-spread/spin-spread"
import type { PlayTerms } from "../../../../core/parlor/terms"
import { InfoNote } from "../../../primitives/popover"
import { spinRangeText } from "../../../wording/pachinko/spin-spread"
import { UnderTheHoodLink } from "../../settings/UnderTheHoodLink"

/**
 * The small i by a live play's spin performance: where the cabinet's own
 * likely is, from the balls measured so far (`measuredSpinRangeOf`), narrowing as
 * more are played, and the way on to the app's notes for how it is worked
 * out. Dashes until a stretch is measured. Shown while mumming as the spin
 * performance is: it is the figure a stream is about.
 */
export function SpinRangeNote(props: { readonly measured: Measured | undefined; readonly terms: PlayTerms | undefined }): JSX.Element {
  return (
    <InfoNote label="回転率の幅について">
      <p>{spinRangeText(measuredSpinRangeOf(props.measured, props.terms))}</p>
      <UnderTheHoodLink />
    </InfoNote>
  )
}
