import type { JSX } from "solid-js"

/**
 * The border between two panes, dragged to resize the one it belongs to.
 *
 * Drawn as a hairline, with a hit area spilling over both sides so it is easy
 * to take hold of. Pressing it is wired to `createResizable`.
 */
export function ResizableBoundary(props: {
  readonly label: string
  readonly onPointerDown: (event: PointerEvent) => void
}): JSX.Element {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={props.label}
      class="group relative z-10 w-px shrink-0 cursor-col-resize bg-border"
      onPointerDown={(event) => props.onPointerDown(event)}
    >
      <div class="absolute inset-y-0 -left-1 -right-1 transition-colors group-hover:bg-accent/40" />
    </div>
  )
}
