// After stefan-karger/solid-ui's toast, on P-Lens's tokens.

import * as ToastPrimitive from "@kobalte/core/toast"
import { toaster } from "@kobalte/core/toast"
import { Show, type JSX } from "solid-js"
import { Portal } from "solid-js/web"

import { Button } from "./button"
import { CloseIcon } from "./icons"

/** How a toast reads: news, something to mind, or something that went wrong. */
export type ToastTone = "info" | "warning" | "error"

const TONES: Readonly<Record<ToastTone, string>> = {
  info: "border-l-accent",
  warning: "border-l-warning",
  error: "border-l-negative",
}

/** How long a toast stays, in milliseconds, unless it is hovered or touched. */
const SHOWN_FOR = 4000

/**
 * How long a toast stays where it is not the usual few seconds: a glance is
 * long enough to read a word by and gone before the next thing is typed; a
 * blink is shorter still, for a press the screen itself answers by
 * changing; a read is long enough for a few lines that explain what
 * happened and why.
 */
const SHOWN_OTHERWISE_FOR: Readonly<Record<"glance" | "blink" | "read", number>> = { glance: 1200, blink: 700, read: 12000 }

/** How far a toast must be swiped, in pixels, before letting go throws it away rather than puts it back. */
const SWIPE_AWAY = 50

/**
 * How a toast moves: it rises in, follows a finger or a mouse dragged to the
 * right, springs back if let go too soon, and flies off from where it was let
 * go if far enough. The page under it does not scroll while it is touched, so
 * a sideways swipe is the toast's, not the page's.
 */
const MOTION = [
  "touch-none select-none transition-transform duration-200",
  "data-[opened]:animate-[toast-enter_200ms_ease-out]",
  "data-[swipe=move]:translate-x-[var(--kb-toast-swipe-move-x)] data-[swipe=move]:transition-none",
  "data-[swipe=cancel]:translate-x-0",
  "data-[closed]:animate-[toast-leave_200ms_ease-in_forwards]",
].join(" ")

/**
 * Where toasts appear, once for the whole app: bottom centre, above a phone's
 * home bar, a few at a time, each swiped away to the right.
 */
export function ToastRegion(): JSX.Element {
  return (
    <Portal>
      <ToastPrimitive.Region duration={SHOWN_FOR} limit={3} swipeDirection="right" swipeThreshold={SWIPE_AWAY} aria-label="お知らせ">
        <ToastPrimitive.List class="fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-1/2 z-50 flex w-[min(24rem,calc(100%-2rem))] -translate-x-1/2 flex-col gap-2 outline-none" />
      </ToastPrimitive.Region>
    </Portal>
  )
}

/**
 * Say something briefly without stopping anyone: a title, perhaps a line
 * more, gone after a few seconds or when closed. Never for something that
 * must be answered — that belongs on the screen itself. One said to stay
 * a glance or a blink only says that a press took: it is done many times
 * over, and is gone in a moment so as not to stand over what is typed
 * next. One given an `action` says what was just done and offers one thing
 * to do about it — taking it back: it stays until it is closed, by its
 * cross or by being swiped away, and pressing its button does the thing
 * and closes it. One said to stay a read explains something that was done
 * on a person's behalf, and stays long enough to be read through.
 */
export const toast = (message: {
  readonly title: string
  readonly description?: string
  readonly tone?: ToastTone
  readonly stays?: "glance" | "blink" | "read"
  readonly action?: { readonly label: string; readonly onPress: () => void }
}): void => {
  toaster.show((props) => (
    <ToastPrimitive.Root
      toastId={props.toastId}
      {...(message.action !== undefined ? { persistent: true } : message.stays === undefined ? {} : { duration: SHOWN_OTHERWISE_FOR[message.stays] })}
      class={`flex items-start gap-3 rounded-md border border-l-4 border-border bg-surface-1 px-4 py-3 shadow-lg ${TONES[message.tone ?? "info"]} ${MOTION}`}
    >
      <div class="min-w-0 flex-1">
        <ToastPrimitive.Title class="text-sm font-semibold text-text-primary">{message.title}</ToastPrimitive.Title>
        <Show when={message.description}>
          <ToastPrimitive.Description class="mt-0.5 text-xs text-text-secondary">{message.description}</ToastPrimitive.Description>
        </Show>
      </div>
      <Show when={message.action} keyed>
        {(action) => (
          <Button
            variant="secondary"
            size="small"
            class="shrink-0"
            onClick={() => {
              toaster.dismiss(props.toastId)
              action.onPress()
            }}
          >
            {action.label}
          </Button>
        )}
      </Show>
      <ToastPrimitive.CloseButton aria-label="閉じる" class="-mr-1 flex size-6 shrink-0 items-center justify-center rounded text-text-muted hover:bg-surface-3 hover:text-text-primary [&_svg]:size-4">
        <CloseIcon label="閉じる" />
      </ToastPrimitive.CloseButton>
    </ToastPrimitive.Root>
  ))
}
