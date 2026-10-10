// After stefan-karger/solid-ui's popover, on the app's tokens.

import * as PopoverPrimitive from "@kobalte/core/popover"
import { createSignal, type JSX } from "solid-js"

import { CloseIcon, QuestionIcon } from "./icons"

/**
 * A question mark that opens an explanation beside it: what a control does,
 * and the settings that matter only now and then — kept out of the form, at
 * hand for whoever wants them. Where what it explains is how a figure is
 * worked out, it is drawn in the semipro ink; any other question mark keeps
 * the quiet colour of a control.
 */
export function HelpPopover(props: { readonly label: string; readonly title: string; readonly semipro?: boolean; readonly children: JSX.Element }): JSX.Element {
  return (
    <PopoverPrimitive.Root gutter={8}>
      <PopoverPrimitive.Trigger
        aria-label={props.label}
        title={props.label}
        class="flex size-10 shrink-0 items-center justify-center rounded hover:bg-surface-3 [&_svg]:size-5"
        classList={{ "text-semipro-ink hover:text-semipro-ink-hover": props.semipro === true, "text-text-muted hover:text-text-primary": props.semipro !== true }}
      >
        <QuestionIcon />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content class="z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-3 rounded-md border border-border bg-surface-1 p-4 text-sm text-text-secondary shadow-lg outline-none">
          <div class="flex items-start gap-2">
            <PopoverPrimitive.Title class="flex-1 font-semibold text-text-primary">{props.title}</PopoverPrimitive.Title>
            <PopoverPrimitive.CloseButton aria-label="閉じる" class="-mr-1 -mt-1 flex size-6 items-center justify-center rounded text-text-muted hover:bg-surface-3 hover:text-text-primary [&_svg]:size-4">
              <CloseIcon label="閉じる" />
            </PopoverPrimitive.CloseButton>
          </div>
          {props.children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

/**
 * An icon button that says what it is for while it has nothing to act on:
 * pressed when not `ready`, a speech bubble opens beside it with the hint,
 * closed by its cross, by a tap anywhere on the bubble or outside it. Once
 * ready, a press is just the press. Neither the button nor the bubble ever
 * takes the focus: a press leaves it where it was, and the tab order passes
 * them by.
 */
export function HintedIconButton(props: {
  readonly label: string
  readonly hint: string
  readonly ready: boolean
  readonly onPress: () => void
  /** Drawn in the semipro ink: for a button that leads to how a figure is worked out. */
  readonly semipro?: boolean
  readonly children: JSX.Element
}): JSX.Element {
  const [open, setOpen] = createSignal(false)
  return (
    <PopoverPrimitive.Root gutter={8} placement="top" open={open()} onOpenChange={(next) => setOpen(next && !props.ready)}>
      <PopoverPrimitive.Trigger
        aria-label={props.label}
        title={props.label}
        tabIndex={-1}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (props.ready) props.onPress()
        }}
        class="flex size-10 shrink-0 items-center justify-center rounded hover:bg-surface-3 [&_svg]:size-5"
        classList={{ "text-semipro-ink hover:text-semipro-ink-hover": props.semipro === true, "text-text-muted hover:text-text-primary": props.semipro !== true }}
      >
        {props.children}
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          onClick={() => setOpen(false)}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          class="z-50 flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-md border border-border bg-surface-1 py-2 pl-3 pr-2 text-sm text-text-primary shadow-lg outline-none"
        >
          <PopoverPrimitive.Arrow class="text-surface-1" />
          <PopoverPrimitive.Description class="flex-1">{props.hint}</PopoverPrimitive.Description>
          <PopoverPrimitive.CloseButton aria-label="閉じる" tabIndex={-1} class="flex size-6 shrink-0 items-center justify-center rounded text-text-muted hover:bg-surface-3 hover:text-text-primary [&_svg]:size-4">
            <CloseIcon label="閉じる" />
          </PopoverPrimitive.CloseButton>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

/**
 * A caution in a line of its own that says more when pressed, opening
 * downwards as it appears: a speech bubble grows out beside it, closed by its cross, by a tap on the bubble or
 * anywhere outside it. It stops nothing — what it cautions about may be
 * left as it is — and never takes the focus.
 */
export function CautionNote(props: { readonly children: string; readonly hint: string }): JSX.Element {
  const [open, setOpen] = createSignal(false)
  return (
    <PopoverPrimitive.Root gutter={6} placement="top-start" open={open()} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        tabIndex={-1}
        onMouseDown={(event) => event.preventDefault()}
        class="animate-[unfold_360ms_ease-out] self-start overflow-hidden text-left text-xs font-semibold text-warning underline decoration-dotted underline-offset-2"
      >
        {props.children}
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          onClick={() => setOpen(false)}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          class="z-50 flex max-w-[min(20rem,calc(100vw-2rem))] origin-[var(--kb-popover-content-transform-origin)] animate-[unfurl_240ms_ease-out] items-start gap-2 rounded-md border border-warning/50 bg-surface-1 py-2 pl-3 pr-2 text-sm text-text-primary shadow-lg outline-none"
        >
          <PopoverPrimitive.Description class="flex-1">{props.hint}</PopoverPrimitive.Description>
          <PopoverPrimitive.CloseButton aria-label="閉じる" tabIndex={-1} class="flex size-6 shrink-0 items-center justify-center rounded text-text-muted hover:bg-surface-3 hover:text-text-primary [&_svg]:size-4">
            <CloseIcon label="閉じる" />
          </PopoverPrimitive.CloseButton>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
