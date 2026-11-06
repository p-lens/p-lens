import type { JSX } from "solid-js"

import { DetailButton } from "../../../primitives/detail-button"
import { TextField } from "../../../primitives/text-field"
import { feelHot } from "../../../primitives/vibration"
import { DRIFT_NOTE, HANDED_NOTE } from "../../../wording/pachinko/play"
import type { Drift, Handing } from "./reading-form"

/** The sign beside a count whose way is chosen by pressing it: how the button reads either way. */
const signButtonClass = "flex h-10 w-7 shrink-0 items-center justify-center rounded-[3px] bg-surface-input text-base font-bold focus-visible:outline-2 focus-visible:outline-focus-ring"

/**
 * What a reading says of the balls besides what was bought and counted,
 * behind its small button: few readings have any. Its bubble holds two
 * rows, each a breakdown of the balls in hand, never added to them: the
 * hand is typed as the cabinet shows it. The first is what the 電サポ
 * gained or lost. The sign and the field's name are in the text's
 * own colour while it says the balls went down, and in the nerdpro colour
 * once it is turned to a gain: balls won on the 電サポ by one's own hand,
 * the hardest of play. Turned so, it buzzes as a held spin turning purple
 * does, where the device can. Left empty it was not counted: the border
 * takes the formula's 電サポ中の出玉増減, and the spin performance is not
 * measured across the 電サポ; a nought typed is a count of none. The second
 * is 持ち玉調整: balls handed in by other players or handed to them, kept
 * out of the spin rate and the border. The button is in the semipro
 * colour, for those who keep the 電サポ's balls out of their spin
 * performance.
 */
export function ReadingDetail(props: {
  readonly drift: Drift
  readonly supported: string
  readonly handing: Handing
  readonly handed: string
  readonly supportedInvalid: boolean
  readonly handedInvalid: boolean
  readonly onDrift: (drift: Drift) => void
  readonly onSupported: (supported: string) => void
  readonly onHanded: (change: { readonly handed: string; readonly handing: Handing }) => void
  readonly onFocus: () => void
}): JSX.Element {
  const driftSet = (): boolean => props.supported.trim() !== ""
  const handedSet = (): boolean => props.handed.trim() !== ""
  const driftSign = (): string => (props.drift === "loss" ? "−" : "＋")
  const handedSign = (): string => (props.handing === "given" ? "−" : "＋")
  const gained = (): boolean => props.drift === "gain"
  const says = (): string => {
    const parts = [driftSet() ? `電サポ増減 ${driftSign()}${props.supported}玉` : undefined, handedSet() ? `持ち玉調整 ${handedSign()}${props.handed}玉` : undefined].filter((part) => part !== undefined)
    return parts.length === 0 ? "詳細（電サポ増減・持ち玉調整）" : `詳細（${parts.join("、")}）`
  }
  return (
    <DetailButton label="詳細" says={says()} marked={driftSet() || handedSet()} invalid={props.supportedInvalid || props.handedInvalid} placement="top-end" tone="semipro" onOpen={props.onFocus}>
      <div class="flex w-full flex-col gap-2">
        <div class="flex items-end gap-1">
          <button
            type="button"
            aria-label={props.drift === "loss" ? "電サポで減った（押すと増えたに切替）" : "電サポで増えた（押すと減ったに切替）"}
            onClick={() => {
              if (!gained()) feelHot()
              props.onDrift(gained() ? "loss" : "gain")
            }}
            class={signButtonClass}
            classList={{ "text-text-primary": !gained(), "text-nerdpro-ink": gained() }}
          >
            {driftSign()}
          </button>
          <div class="min-w-0 flex-1">
            <TextField label="電サポ増減" {...(gained() ? { tone: "nerdpro" as const } : {})} value={props.supported} onChange={props.onSupported} inputMode="numeric" suffix="玉" placeholder="未計測" invalid={props.supportedInvalid} onFocus={props.onFocus} note={DRIFT_NOTE} compact />
          </div>
        </div>
        <div class="flex items-end gap-1">
          <button
            type="button"
            aria-label={props.handing === "received" ? "貰い玉（押すと渡し玉に切替）" : "渡し玉（押すと貰い玉に切替）"}
            onClick={() => props.onHanded({ handed: props.handed, handing: props.handing === "received" ? "given" : "received" })}
            class={`${signButtonClass} text-text-primary`}
          >
            {handedSign()}
          </button>
          <div class="min-w-0 flex-1">
            <TextField label="持ち玉調整" value={props.handed} onChange={(handed) => props.onHanded({ handed, handing: props.handing })} inputMode="numeric" suffix="玉" placeholder="0" invalid={props.handedInvalid} onFocus={props.onFocus} note={HANDED_NOTE} compact />
          </div>
        </div>
      </div>
    </DetailButton>
  )
}
