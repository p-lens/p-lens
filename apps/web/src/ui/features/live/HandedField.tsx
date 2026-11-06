import type { JSX } from "solid-js"

import { TextField } from "../../primitives/text-field"
import { HANDED_TALLY_NOTE } from "../../wording/fields"
import type { Handing } from "./finish-tally-reading"

/**
 * The tokens handed between players over a play followed live, as its
 * tally is recorded: how many, and the way they went by the sign beside
 * them, turned by pressing it — opened on what the play's log says.
 */
export function HandedField(props: {
  readonly label: string
  readonly unit: string
  readonly value: string
  readonly handing: Handing
  readonly onValue: (typed: string) => void
  readonly onHanding: (handing: Handing) => void
  readonly error: string | undefined
  readonly invalid: boolean
  readonly onFocus: () => void
}): JSX.Element {
  return (
    <div class="flex min-w-0 items-end gap-1">
      <button
        type="button"
        aria-label={props.handing === "received" ? "貰った（押すと渡したに切替）" : "渡した（押すと貰ったに切替）"}
        onClick={() => props.onHanding(props.handing === "received" ? "given" : "received")}
        class="flex h-10 w-7 shrink-0 items-center justify-center rounded-[3px] bg-surface-input text-base font-bold text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring"
      >
        {props.handing === "given" ? "−" : "＋"}
      </button>
      <div class="min-w-0 flex-1">
        <TextField label={props.label} value={props.value} onChange={props.onValue} inputMode="numeric" suffix={props.unit} placeholder="0" error={props.error} invalid={props.invalid} onFocus={props.onFocus} note={HANDED_TALLY_NOTE} />
      </div>
    </div>
  )
}
