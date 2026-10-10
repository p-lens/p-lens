import * as PopoverPrimitive from "@kobalte/core/popover"
import { createSignal, type JSX } from "solid-js"

import { createLongPress } from "../../../primitives/long-press"
import { TextField } from "../../../primitives/text-field"
import { PRESS_DIGITS } from "../../live/parlor-setting"
import { readPressAmount } from "./press-amounts"

/**
 * A button that adds one press's worth to the field beside it. Held, it
 * opens a small bubble where what a press adds is set, kept from the
 * moment it reads as an amount; Enter, or a press anywhere else, closes
 * it, and a field left holding no amount puts back the one it opened on.
 * The bubble does not take the focus as it opens: a keyboard brought up
 * unasked would cover it, where a field the person presses is brought
 * into view by the browser itself.
 */
export function PressButton(props: {
  readonly amount: number
  readonly unit: string
  /** What the button adds to, for naming it and its bubble. */
  readonly of: string
  readonly onPress: () => void
  readonly onAmount: (amount: number) => void
}): JSX.Element {
  const [open, setOpen] = createSignal(false)
  const [typed, setTyped] = createSignal("")
  const own: { button: HTMLButtonElement | undefined; content: HTMLElement | undefined; opened: number } = { button: undefined, content: undefined, opened: props.amount }
  /**
   * Closes the bubble on what its field holds as it stands — read off the
   * field itself, which may be ahead of what it has told — or, where that
   * is no amount, on the amount it was opened with: a field emptied and
   * left is a change given up.
   */
  const close = (): void => {
    const held = own.content?.querySelector("input")?.value ?? typed()
    props.onAmount(readPressAmount(held) ?? own.opened)
    setOpen(false)
  }
  const doneOnEnter = (event: KeyboardEvent): void => {
    if (event.key !== "Enter" || event.isComposing) return
    event.preventDefault()
    close()
  }
  /** The hold that opened the bubble ends on the button: letting go there is not a press outside it. */
  const unlessOnButton = (event: Event): void => {
    if (event.target instanceof Node && own.button?.contains(event.target) === true) event.preventDefault()
  }
  const hold = createLongPress(() => {
    own.opened = props.amount
    setTyped(String(props.amount))
    setOpen(true)
  })
  const type = (text: string): void => {
    setTyped(text)
    const amount = readPressAmount(text)
    if (amount !== undefined) props.onAmount(amount)
  }
  return (
    <PopoverPrimitive.Root open={open()} onOpenChange={(next) => (next ? setOpen(true) : close())} gutter={6} placement="top-end">
      <PopoverPrimitive.Anchor class="flex shrink-0">
        <button
          type="button"
          ref={(element) => {
            own.button = element
          }}
          aria-label={`${props.of}に${props.amount}${props.unit}足す（長押しで変更）`}
          class="h-10 shrink-0 select-none rounded-[3px] bg-surface-3 px-2 text-xs font-medium tabular-nums text-text-primary hover:bg-surface-0"
          onPointerDown={hold.onPointerDown}
          onPointerMove={hold.onPointerMove}
          onPointerUp={hold.onPointerUp}
          onPointerLeave={hold.onPointerLeave}
          onPointerCancel={hold.onPointerCancel}
          onContextMenu={hold.onContextMenu}
          onClick={() => {
            if (!hold.wasLong()) props.onPress()
          }}
        >
          +{props.amount}
        </button>
      </PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          ref={(element: HTMLElement) => {
            own.content = element
          }}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={unlessOnButton} onKeyDown={doneOnEnter} class="z-50 flex w-36 flex-col gap-1 rounded-md border border-border bg-surface-1 p-2 shadow-lg outline-none">
          <TextField
            label={`1回で足す${props.of}`}
            value={typed()}
            onChange={type}
            inputMode="numeric"
            suffix={props.unit}
            maxLength={PRESS_DIGITS}
            invalid={readPressAmount(typed()) === undefined}
            compact
          />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
