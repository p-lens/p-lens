import type { JSX } from "solid-js"

import type { Measured } from "../../../../core/pachinko/consumption"
import { measuredSpinRangeOf } from "../../../../core/pachinko/spin-spread/spin-spread"
import type { PlayTerms } from "../../../../core/parlor/terms"
import { InfoNote } from "../../../primitives/popover"
import { spinRangeLines } from "../../../wording/pachinko/spin-spread"

/**
 * The small i by a live play's spin performance: where the cabinet's own
 * likely is, from the balls measured so far (`measuredSpinRangeOf`), narrowing as
 * more are played. Dashes until a stretch is measured. Shown while mumming as the spin
 * performance is: it is the figure a stream is about.
 */
export function SpinRangeNote(props: { readonly measured: Measured | undefined; readonly terms: PlayTerms | undefined }): JSX.Element {
  return (
    <InfoNote label="回転率の幅について">
      {((lines) => (
        <p>
          {lines[0]}
          <br />
          {lines[1]}
        </p>
      ))(spinRangeLines(measuredSpinRangeOf(props.measured, props.terms)))}
    </InfoNote>
  )
}
