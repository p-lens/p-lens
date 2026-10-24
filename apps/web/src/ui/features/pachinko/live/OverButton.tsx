import type { JSX } from "solid-js"

import { DetailButton } from "../../../primitives/detail-button"
import { TextField } from "../../../primitives/text-field"

/**
 * What a bonus paid beyond what its machine lists (過出玉), behind a small
 * [超] button after the bonus list, there whether a bonus is chosen or
 * not — what is typed with none chosen says nothing: an over-entry. Few
 * say it — those who count — and the rest never open it. It comes filled
 * in by the person's usual over-entry at the cabinet where they said one,
 * to be set right where this bonus paid otherwise. Typed on the number
 * keypad, which has no sign: balls lost to a slack attacker are said in
 * 電サポ増減, and below nought is left to a keyboard that has a minus. In
 * the nerdpro colour: setting what a machine pays by one's own hand is
 * the hardest of play.
 */
export function OverButton(props: { readonly over: string; readonly invalid: boolean; readonly onOver: (over: string) => void; readonly onFocus?: () => void }): JSX.Element {
  const typed = (): boolean => props.over.trim() !== ""
  return (
    <DetailButton
      says={typed() ? `過出玉（${props.over}玉）` : "過出玉"}
      face={<span class="text-base font-bold leading-none">超</span>}
      marked={typed()}
      invalid={props.invalid}
      placement="top-end"
      tone="nerdpro"
      fitted
      {...(props.onFocus === undefined ? {} : { onOpen: props.onFocus })}
    >
      <div class="w-44">
        <TextField label="過出玉" value={props.over} onChange={props.onOver} inputMode="numeric" placeholder="0" suffix="玉" invalid={props.invalid} {...(props.onFocus === undefined ? {} : { onFocus: props.onFocus })} compact />
      </div>
    </DetailButton>
  )
}
