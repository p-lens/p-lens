import type { JSX } from "solid-js"

import { clockFrom } from "../../../core/tally/clock"
import type { PlayClock } from "../../../core/tally/tally"
import { TimeField } from "../../primitives/time-field"

/**
 * When a tally's play began and finished by the clock, as its entry says it,
 * to be set right: each time typed over or emptied, either left unsaid.
 * They are written beside the tally and change nothing of its figures.
 */
export function ClockFields(props: { readonly clock: PlayClock | undefined; readonly onChange: (clock: PlayClock | undefined) => void }): JSX.Element {
  return (
    <div class="grid grid-cols-[6rem_6rem] gap-x-3 px-4 pt-4">
      <TimeField
        label="開始時刻"
        value={props.clock?.started}
        onChange={(started) => props.onChange(clockFrom(started, props.clock?.finished))}
        onClear={() => props.onChange(clockFrom(undefined, props.clock?.finished))}
      />
      <TimeField
        label="終了時刻"
        value={props.clock?.finished}
        onChange={(finished) => props.onChange(clockFrom(props.clock?.started, finished))}
        onClear={() => props.onChange(clockFrom(props.clock?.started, undefined))}
      />
    </div>
  )
}
