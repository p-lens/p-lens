import type { JSX } from "solid-js"

import { DetailButton } from "../../../primitives/detail-button"
import { TextField } from "../../../primitives/text-field"

/**
 * What a bonus paid beyond what its machine lists, behind a small [差]
 * button beside the bonus chosen: an over-entry, or below nought balls
 * lost to a slack attacker. Few say it — those who count — and the rest
 * never open it. It comes filled in by the person's usual over-entry at
 * the cabinet where they said one, to be set right where this bonus paid
 * otherwise. Typed with a sign, so on a keyboard that has one.
 */
export function OverButton(props: { readonly over: string; readonly invalid: boolean; readonly onOver: (over: string) => void; readonly onFocus?: () => void }): JSX.Element {
  const typed = (): boolean => props.over.trim() !== ""
  return (
    <DetailButton
      says={typed() ? `出玉差（${props.over}玉）` : "出玉差"}
      face={<span class="text-base font-bold leading-none">差</span>}
      marked={typed()}
      invalid={props.invalid}
      placement="top-end"
      fitted
      {...(props.onFocus === undefined ? {} : { onOpen: props.onFocus })}
    >
      <div class="w-44">
        <TextField label="出玉差（公称との差）" value={props.over} onChange={props.onOver} inputMode="text" placeholder="+0" suffix="玉" invalid={props.invalid} {...(props.onFocus === undefined ? {} : { onFocus: props.onFocus })} compact />
      </div>
    </DetailButton>
  )
}
