import * as DialogPrimitive from "@kobalte/core/dialog"
import { For, type JSX } from "solid-js"

import { Button } from "../../primitives/button"
import { MAKE_SAMPLE, START_ALONE, WELCOME_LINES, welcomeTitle } from "../../wording/onboarding"

/**
 * The welcome, laid over the screen: what the app is in a line, and the
 * sample book offered as the way in, beside starting alone. Escape and a
 * press outside it start alone, as its first button does.
 */
export function WelcomeDialog(props: { readonly open: boolean; readonly name: string; readonly onAlone: () => void; readonly onSample: () => void }): JSX.Element {
  return (
    <DialogPrimitive.Root
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onAlone()
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay class="fixed inset-0 z-50 bg-surface-0/80" />
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
          <DialogPrimitive.Content class="flex max-h-full w-[min(26rem,100%)] flex-col gap-4 overflow-y-auto rounded-md border border-border bg-surface-1 p-5 shadow-lg outline-none">
            <DialogPrimitive.Title class="text-base font-semibold text-text-primary">{welcomeTitle(props.name)}</DialogPrimitive.Title>
            <DialogPrimitive.Description as="div" class="flex flex-col gap-2 text-sm leading-relaxed text-text-secondary">
              <For each={WELCOME_LINES}>{(line) => <p>{line}</p>}</For>
            </DialogPrimitive.Description>
            <div class="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={props.onAlone}>
                {START_ALONE}
              </Button>
              <Button type="button" onClick={props.onSample}>
                {MAKE_SAMPLE}
              </Button>
            </div>
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
