import type { JSX } from "solid-js"

/**
 * A button that opens and closes a part of a form below it, drawn as a
 * `DetailButton` is — its name over it, its mark on it, coloured where
 * the part holds something, red where something in it is wrong — so that
 * the two stand side by side as one kind of thing. What the part holds
 * stays while it is closed.
 */
export function FoldButton(props: {
  /** The name over the button, as a field's is over it. */
  readonly label: string
  /** What the button opens, and whether it holds anything: for whoever cannot see the mark. */
  readonly says: string
  readonly marked: boolean
  /** Whether something the part holds cannot be taken: seen on the button while the part is closed. */
  readonly invalid: boolean
  readonly open: boolean
  readonly onToggle: () => void
  readonly face: JSX.Element
}): JSX.Element {
  return (
    <div class="flex shrink-0 flex-col gap-1.5">
      <span aria-hidden="true" class="text-xs font-bold tracking-wide text-text-secondary">
        {props.label}
      </span>
      <button
        type="button"
        aria-label={props.says}
        aria-expanded={props.open}
        onClick={() => props.onToggle()}
        class="flex h-10 w-10 items-center justify-center rounded-[3px] hover:bg-surface-0 focus-visible:outline-2 focus-visible:outline-focus-ring [&_svg]:size-5"
        classList={{
          "text-text-primary": !props.invalid,
          "bg-surface-3": !props.marked && !props.open && !props.invalid,
          "bg-accent/30": props.marked && !props.invalid,
          "bg-surface-0 ring-1 ring-border": props.open && !props.marked && !props.invalid,
          "bg-surface-3 text-negative outline outline-2 outline-negative": props.invalid,
        }}
      >
        {props.face}
      </button>
    </div>
  )
}
