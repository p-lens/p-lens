import * as PopoverPrimitive from "@kobalte/core/popover"
import { createSignal, type JSX } from "solid-js"

import { SlidersIcon } from "./icons"

/**
 * What few fill in, behind one small button under its own short name: it
 * is not given a field's width among the fields everyone fills. Pressed,
 * the button opens a bubble holding what is put away there; Enter, or a
 * press anywhere else, closes it, and what was typed stays typed. The
 * button is marked while something is set there, so that a figure put
 * away is not forgotten, red where it stopped a press, beckons with its frame
 * where what a person was asked for is kept in it, and glimmers amber where
 * what would make an answer better is. The bubble does
 * not take the focus as it opens: a keyboard brought up unasked would
 * cover it, where a field the person presses is brought into view by the
 * browser itself.
 */
export function DetailButton(props: {
  /** The name over the button, as a field's is over it. */
  readonly label: string
  /** What the button holds and, where something is set, what: for whoever cannot see the mark. */
  readonly says: string
  readonly marked: boolean
  readonly invalid: boolean
  /** Its icon drawn in the colour of whom what it holds is for — the semipro colour, for those who work their figures out themselves — or in the text's colour where left out. The button itself is drawn and marked as any other. */
  readonly tone?: "semipro"
  /** What was just asked for is to be found here: the frame comes slowly red and goes again, once each time this becomes so. */
  readonly beckoning?: boolean
  /** What would make an answer better is to be found here: an amber light comes softly about it and goes again, once each time this becomes so. */
  readonly glimmering?: boolean
  /** Where the bubble opens: above a button at the foot of the screen, below one further up. */
  readonly placement: "top-end" | "bottom-end"
  /** Whether the bubble is as wide as what it holds and no wider, for pairs of fields set at widths of their own, rather than its usual width. */
  readonly fitted?: boolean
  readonly onOpen?: () => void
  readonly children: JSX.Element
}): JSX.Element {
  const [open, setOpen] = createSignal(false)
  const doneOnEnter = (event: KeyboardEvent): void => {
    if (event.key !== "Enter" || event.isComposing) return
    event.preventDefault()
    setOpen(false)
  }
  return (
    <PopoverPrimitive.Root open={open()} onOpenChange={setOpen} gutter={6} placement={props.placement}>
      <div class="flex shrink-0 flex-col gap-1.5">
        <span aria-hidden="true" class="text-xs font-bold tracking-wide text-text-secondary">
          {props.label}
        </span>
        <PopoverPrimitive.Trigger
          type="button"
          aria-label={props.says}
          onClick={() => props.onOpen?.()}
          class="flex h-10 w-10 items-center justify-center rounded-[3px] hover:bg-surface-0 focus-visible:outline-2 focus-visible:outline-focus-ring [&_svg]:size-5"
          classList={{
            "bg-surface-3": !props.marked && !props.invalid,
            "bg-accent/30": props.marked && !props.invalid,
            "text-text-primary": props.tone === undefined && !props.invalid,
            "text-semipro-ink": props.tone === "semipro" && !props.invalid,
            "bg-surface-3 text-negative outline outline-2 outline-negative": props.invalid,
            "animate-[beckon_2.4s_ease-in-out]": props.beckoning === true && !props.invalid,
            "animate-[glimmer_2.4s_ease-in-out]": props.glimmering === true && props.beckoning !== true && !props.invalid,
          }}
        >
          <SlidersIcon />
        </PopoverPrimitive.Trigger>
      </div>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content onOpenAutoFocus={(event) => event.preventDefault()} onKeyDown={doneOnEnter} class="z-50 flex max-h-[var(--kb-popper-content-available-height)] items-end gap-1 overflow-y-auto rounded-md border border-border bg-surface-1 p-2 shadow-lg outline-none" classList={{ "w-44": props.fitted !== true, "w-max max-w-[calc(100vw-1rem)]": props.fitted === true }}>
          {props.children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
