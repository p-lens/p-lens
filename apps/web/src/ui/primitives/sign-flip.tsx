import type { JSX } from "solid-js"

import { flippedSign } from "./flipped-sign"

/**
 * A small button beside a field of yen that may fall below nothing, that
 * turns the sign of what is typed over: a phone's number pad has no minus
 * key, and such a field keeps the number pad for the plus it mostly holds.
 */
export function SignFlip(props: { readonly value: string; readonly onChange: (typed: string) => void; readonly label: string }): JSX.Element {
  return (
    <button
      type="button"
      aria-label={props.label}
      onClick={() => props.onChange(flippedSign(props.value))}
      class="flex h-10 w-7 shrink-0 items-center justify-center rounded-[3px] bg-surface-input text-base font-bold text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring"
    >
      ±
    </button>
  )
}
