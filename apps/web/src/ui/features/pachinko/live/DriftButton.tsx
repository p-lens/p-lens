import * as PopoverPrimitive from "@kobalte/core/popover"
import { createSignal, type JSX } from "solid-js"

import { SlidersIcon } from "../../../primitives/icons"
import { TextField } from "../../../primitives/text-field"
import type { Drift } from "./reading-form"

/**
 * What the 電サポ gained or lost, behind one small button: few readings
 * have any, so it is not given a field's width among those every reading
 * fills. Pressed, the button opens a bubble with which way the balls went
 * and how many; Enter, or a press anywhere else, closes it, and what was
 * typed is the reading's from the moment it is typed. The button is
 * marked while a count is set, so that one typed and put away is not
 * forgotten, and red where the count stopped a press. The bubble does not
 * take the focus as it opens: a keyboard brought up unasked would cover
 * it, where a field the person presses is brought into view by the
 * browser itself.
 */
export function DriftButton(props: {
  readonly drift: Drift
  readonly supported: string
  readonly invalid: boolean
  readonly onDrift: (drift: Drift) => void
  readonly onSupported: (supported: string) => void
  readonly onFocus: () => void
}): JSX.Element {
  const [open, setOpen] = createSignal(false)
  const set = (): boolean => props.supported.trim() !== ""
  const sign = (): string => (props.drift === "loss" ? "−" : "＋")
  const doneOnEnter = (event: KeyboardEvent): void => {
    if (event.key !== "Enter" || event.isComposing) return
    event.preventDefault()
    setOpen(false)
  }
  return (
    <PopoverPrimitive.Root open={open()} onOpenChange={setOpen} gutter={6} placement="top-end">
      <div class="flex shrink-0 flex-col gap-1.5">
        <span aria-hidden="true" class="text-xs font-bold tracking-wide text-text-secondary">
          詳細
        </span>
        <PopoverPrimitive.Trigger
          type="button"
          aria-label={set() ? `詳細（電サポ増減 ${sign()}${props.supported}玉）` : "詳細（電サポ増減）"}
          onClick={props.onFocus}
          class="flex h-10 w-10 items-center justify-center rounded-[3px] hover:bg-surface-0 focus-visible:outline-2 focus-visible:outline-focus-ring [&_svg]:size-5"
          classList={{
            "bg-surface-3 text-text-primary": !set() && !props.invalid,
            "bg-accent/30 text-text-primary": set() && !props.invalid,
            "bg-surface-3 text-negative outline outline-2 outline-negative": props.invalid,
          }}
        >
          <SlidersIcon />
        </PopoverPrimitive.Trigger>
      </div>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content onOpenAutoFocus={(event) => event.preventDefault()} onKeyDown={doneOnEnter} class="z-50 flex w-44 items-end gap-1 rounded-md border border-border bg-surface-1 p-2 shadow-lg outline-none">
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
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
