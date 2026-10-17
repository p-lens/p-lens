import { createSignal, onMount, type JSX } from "solid-js"

import { RESENDING } from "../../../wording/pachislot/formula"

/** How long the sending-again notice stays at the least, in milliseconds: long enough to read its two lines through, however soon the answer comes. */
export const RESENDING_SHOWN_FOR = 4500

/**
 * What stands on screen while a formula too heavy for the shared catalog to
 * check goes again, with what this device solved: what is being done and
 * why, over a bar that fills across the time it stays. The bar measures
 * nothing — the sending takes a moment — and is there so the wait reads as
 * work being done for the person, not as a refusal.
 */
export function Resending(): JSX.Element {
  const [filled, setFilled] = createSignal(false)
  onMount(() => requestAnimationFrame(() => setFilled(true)))
  return (
    <div role="status" class="flex flex-col gap-2 rounded-md border border-border bg-surface-1 px-4 py-3">
      <p class="text-sm font-semibold text-text-primary">{RESENDING.title}</p>
      <p class="text-xs text-text-secondary">{RESENDING.note}</p>
      <div class="h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div class="h-full rounded-full bg-accent transition-[width] ease-out" style={{ width: filled() ? "100%" : "3%", "transition-duration": `${RESENDING_SHOWN_FOR}ms` }} />
      </div>
    </div>
  )
}
