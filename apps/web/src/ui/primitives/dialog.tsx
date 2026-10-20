import * as DialogPrimitive from "@kobalte/core/dialog"
import type { JSX } from "solid-js"

import { Button } from "./button"
import { CloseIcon } from "./icons"

/**
 * Something a person is to read before they go on: laid over the screen,
 * which is dimmed behind it, and gone once they say they have. Escape and a
 * press outside it close it as its button does.
 */
export function NoticeDialog(props: {
  readonly open: boolean
  readonly title: string
  readonly acknowledge: string
  readonly onAcknowledged: () => void
  readonly children: JSX.Element
}): JSX.Element {
  return (
    <DialogPrimitive.Root
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onAcknowledged()
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay class="fixed inset-0 z-50 bg-surface-0/80" />
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
          <DialogPrimitive.Content class="flex max-h-full w-[min(30rem,100%)] flex-col gap-4 overflow-y-auto rounded-md border border-border bg-surface-1 p-5 shadow-lg outline-none">
            <DialogPrimitive.Title class="text-base font-semibold text-text-primary">{props.title}</DialogPrimitive.Title>
            <DialogPrimitive.Description as="div" class="flex flex-col gap-3 text-sm leading-relaxed text-text-secondary">
              {props.children}
            </DialogPrimitive.Description>
            <div class="flex justify-end">
              <Button onClick={props.onAcknowledged}>{props.acknowledge}</Button>
            </div>
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/**
 * A panel laid over the screen to do something in, its own buttons doing
 * it: closed by the cross in its corner, by a press outside it, or by
 * Escape, and by nothing else — it has no button of its own to close it.
 */
export function PanelDialog(props: { readonly open: boolean; readonly title: string; readonly onClosed: () => void; readonly children: JSX.Element }): JSX.Element {
  return (
    <DialogPrimitive.Root
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onClosed()
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay class="fixed inset-0 z-50 bg-surface-0/80" />
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
          <DialogPrimitive.Content class="flex max-h-full w-[min(30rem,100%)] flex-col gap-4 overflow-y-auto rounded-md border border-border bg-surface-1 p-5 shadow-lg outline-none">
            <div class="flex items-start gap-2">
              <DialogPrimitive.Title class="flex-1 text-base font-semibold text-text-primary">{props.title}</DialogPrimitive.Title>
              <DialogPrimitive.CloseButton aria-label="閉じる" class="-mr-1 -mt-1 flex size-7 items-center justify-center rounded text-text-muted hover:bg-surface-3 hover:text-text-primary [&_svg]:size-4">
                <CloseIcon label="閉じる" />
              </DialogPrimitive.CloseButton>
            </div>
            <DialogPrimitive.Description as="div" class="flex flex-col gap-3 text-sm leading-relaxed text-text-secondary">
              {props.children}
            </DialogPrimitive.Description>
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/**
 * Something a person is asked before it is done, because it cannot simply
 * be taken back: laid over the screen like a notice, with the doing and
 * the leaving alone side by side. Escape and a press outside it leave
 * alone, as its second button does.
 */
export function ConfirmDialog(props: {
  readonly open: boolean
  readonly title: string
  readonly confirm: string
  readonly decline: string
  readonly onConfirmed: () => void
  readonly onDeclined: () => void
  readonly children: JSX.Element
}): JSX.Element {
  return (
    <DialogPrimitive.Root
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onDeclined()
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay class="fixed inset-0 z-50 bg-surface-0/80" />
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
          <DialogPrimitive.Content role="alertdialog" class="flex max-h-full w-[min(30rem,100%)] flex-col gap-4 overflow-y-auto rounded-md border border-negative/40 bg-surface-1 p-5 shadow-lg outline-none">
            <DialogPrimitive.Title class="text-base font-semibold text-text-primary">{props.title}</DialogPrimitive.Title>
            <DialogPrimitive.Description as="div" class="flex flex-col gap-3 text-sm leading-relaxed text-text-secondary">
              {props.children}
            </DialogPrimitive.Description>
            <div class="flex gap-2 sm:justify-end">
              <Button variant="secondary" class="flex-1 sm:flex-none" onClick={props.onDeclined}>
                {props.decline}
              </Button>
              <Button variant="secondary" class="flex-1 text-negative sm:flex-none" onClick={props.onConfirmed}>
                {props.confirm}
              </Button>
            </div>
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
