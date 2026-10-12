import * as PopoverPrimitive from "@kobalte/core/popover"
import { createSignal, type JSX } from "solid-js"

import { EditIcon } from "./icons"

/**
 * A word with a pencil beside it, the two as one button no taller than the
 * word, that opens a bubble where what the word says is typed: for
 * something a form shows the answer to and seldom asks. Enter, or a press
 * anywhere else, closes the bubble, and what was typed stays typed. The
 * word turns red where what it holds stopped a press. The bubble does not
 * take the focus as it opens: a keyboard brought up unasked would cover
 * it, where a field the person presses is brought into view by the browser
 * itself.
 */
export function PencilledBubble(props: {
  /** What the button says: what is held, or dashes in its shape where nothing is. */
  readonly text: string
  /** What the pencil does, for whoever cannot see it. */
  readonly says: string
  readonly invalid: boolean
  readonly children: JSX.Element
}): JSX.Element {
  const [open, setOpen] = createSignal(false)
  const doneOnEnter = (event: KeyboardEvent): void => {
    if (event.key !== "Enter" || event.isComposing) return
    event.preventDefault()
    setOpen(false)
  }
  return (
    <PopoverPrimitive.Root open={open()} onOpenChange={setOpen} gutter={6} placement="bottom-end">
      <PopoverPrimitive.Trigger
        type="button"
        class="group flex h-5 shrink-0 items-center gap-1 rounded-[3px] text-xs font-bold focus-visible:outline-2 focus-visible:outline-focus-ring [&_svg]:size-3.5"
        classList={{ "text-text-primary": !props.invalid, "text-negative": props.invalid }}
      >
        {props.text}
        <span classList={{ "text-text-secondary group-hover:text-text-primary": !props.invalid }}>
          <EditIcon label={props.says} />
        </span>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content onOpenAutoFocus={(event) => event.preventDefault()} onKeyDown={doneOnEnter} class="z-50 flex w-36 flex-col gap-1 rounded-md border border-border bg-surface-1 p-2 shadow-lg outline-none">
          {props.children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
