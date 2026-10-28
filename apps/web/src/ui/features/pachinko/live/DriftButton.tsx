import type { JSX } from "solid-js"

import { DetailButton } from "../../../primitives/detail-button"
import { TextField } from "../../../primitives/text-field"
import { feelHot } from "../../../primitives/vibration"
import type { Drift } from "./reading-form"

/**
 * What the 電サポ gained or lost, behind the reading's small button: few
 * readings have any. Its bubble holds which way the balls went and how
 * many, and what is typed there is the reading's from the moment it is
 * typed. The button is in the semipro colour, for those who keep the
 * 電サポ's balls out of their spin performance; inside it, the sign and
 * the field's name are in the text's own colour while it says the balls
 * went down, and in the nerdpro colour once it is turned to a gain: balls
 * won on the 電サポ by one's own hand, the hardest of play. Turned so, it
 * buzzes as a held spin turning purple does, where the device can. Left
 * empty it was not counted: the border takes the formula's 電サポ中の出玉増減,
 * and the spin performance is not measured across the 電サポ; a nought
 * typed is a count of none.
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
  const gained = (): boolean => props.drift === "gain"
  return (
    <DetailButton label="詳細" says={set() ? `詳細（電サポ増減 ${sign()}${props.supported}玉）` : "詳細（電サポ増減）"} marked={set()} invalid={props.invalid} placement="top-end" tone="semipro" onOpen={props.onFocus}>
      <button
        type="button"
        aria-label={props.drift === "loss" ? "電サポで減った（押すと増えたに切替）" : "電サポで増えた（押すと減ったに切替）"}
        onClick={() => {
          if (!gained()) feelHot()
          props.onDrift(gained() ? "loss" : "gain")
        }}
        class="flex h-10 w-7 shrink-0 items-center justify-center rounded-[3px] bg-surface-input text-base font-bold focus-visible:outline-2 focus-visible:outline-focus-ring"
        classList={{ "text-text-primary": !gained(), "text-nerdpro-ink": gained() }}
      >
        {sign()}
      </button>
      <div class="min-w-0 flex-1">
        <TextField label="電サポ増減" {...(gained() ? { tone: "nerdpro" as const } : {})} value={props.supported} onChange={props.onSupported} inputMode="numeric" suffix="玉" placeholder="未計測" invalid={props.invalid} onFocus={props.onFocus} compact />
      </div>
    </DetailButton>
  )
}
