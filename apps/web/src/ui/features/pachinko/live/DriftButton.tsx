import type { JSX } from "solid-js"

import { DetailButton } from "../../../primitives/detail-button"
import { TextField } from "../../../primitives/text-field"
import type { Drift } from "./reading-form"

/**
 * What the 電サポ gained or lost, behind the reading's small button: few
 * readings have any. Its bubble holds which way the balls went and how
 * many, and what is typed there is the reading's from the moment it is
 * typed.
 */
export function DriftButton(props: {
  readonly drift: Drift
  readonly supported: string
  readonly invalid: boolean
  readonly onDrift: (drift: Drift) => void
  readonly onSupported: (supported: string) => void
  readonly onFocus: () => void
}): JSX.Element {
  const set = (): boolean => props.supported.trim() !== ""
  const sign = (): string => (props.drift === "loss" ? "−" : "＋")
  return (
    <DetailButton label="詳細" says={set() ? `詳細（電サポ増減 ${sign()}${props.supported}玉）` : "詳細（電サポ増減）"} marked={set()} invalid={props.invalid} placement="top-end" onOpen={props.onFocus}>
      <button
        type="button"
        aria-label={props.drift === "loss" ? "電サポで減った（押すと増えたに切替）" : "電サポで増えた（押すと減ったに切替）"}
        onClick={() => props.onDrift(props.drift === "loss" ? "gain" : "loss")}
        class="flex h-10 w-7 shrink-0 items-center justify-center rounded-[3px] bg-surface-input text-base font-bold text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring"
      >
        {sign()}
      </button>
      <div class="min-w-0 flex-1">
        <TextField label="電サポ増減" value={props.supported} onChange={props.onSupported} inputMode="numeric" suffix="玉" invalid={props.invalid} onFocus={props.onFocus} compact />
      </div>
    </DetailButton>
  )
}
