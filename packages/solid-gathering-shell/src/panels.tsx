import { Show, type JSX } from "solid-js"

import { useArrangement } from "./context"
import { createResizable, type Bound, type HandleEdge } from "./resize"
import { ResizableBoundary } from "./ResizableBoundary"

export interface PanelWidth {
  readonly initial: number
  readonly min: Bound
  readonly max: Bound
}

interface PanelProps {
  readonly header?: JSX.Element
  readonly footer?: JSX.Element
  readonly children: JSX.Element
  readonly width?: PanelWidth
  /** What a screen reader calls the resize handle. */
  readonly resizeLabel?: string
}

/**
 * What a pane's content scrolls in. It is positioned, so that whatever its
 * content positions absolutely — a label kept for a screen reader and out
 * of sight is one — is placed within it and scrolls with it. Left
 * unpositioned, such a thing is placed against the page instead, far down
 * a long pane, and the page grows to hold it: the whole shell then scrolls
 * away under the content, rail and all.
 */
const SCROLLED = "relative min-h-0 flex-1 overflow-y-auto"

/**
 * A pane with its own width beside the main content: fixed and resizable in a
 * wide arrangement, the whole screen in a narrow one.
 */
function WidthKeepingPanel(
  props: PanelProps & { readonly edge: HandleEdge; readonly surface: string; readonly fallbackWidth: PanelWidth },
): JSX.Element {
  const arrangement = useArrangement()
  const width = (): PanelWidth => props.width ?? props.fallbackWidth
  const { size, onHandlePointerDown } = createResizable({
    initial: width().initial,
    min: width().min,
    max: width().max,
    edge: props.edge,
  })
  const wide = (): boolean => arrangement() === "wide"
  const boundary = (): JSX.Element => (
    <Show when={wide()}>
      <ResizableBoundary label={props.resizeLabel ?? "Resize panel"} onPointerDown={onHandlePointerDown} />
    </Show>
  )

  return (
    <div class="flex min-w-0" classList={{ "flex-1": !wide(), "shrink-0": wide() }}>
      <Show when={props.edge === "start"}>{boundary()}</Show>
      <aside
        class={`flex min-w-0 flex-1 flex-col ${props.surface}`}
        style={{ width: wide() ? `${size()}px` : undefined }}
      >
        <Show when={props.header}>
          <header class="flex h-9 shrink-0 items-center border-b border-border px-3 sm:h-10 sm:px-4">{props.header}</header>
        </Show>
        <div class={SCROLLED}>{props.children}</div>
        <Show when={props.footer}>
          <footer class="shrink-0">{props.footer}</footer>
        </Show>
      </aside>
      <Show when={props.edge === "end"}>{boundary()}</Show>
    </div>
  )
}

/** The list inside the chosen space, beside the rail. */
export function SidePanel(props: PanelProps): JSX.Element {
  return (
    <WidthKeepingPanel
      {...props}
      edge="end"
      surface="bg-surface-1"
      fallbackWidth={{ initial: 300, min: 240, max: 440 }}
    />
  )
}

/** The detail of what is chosen in the main content, on the far side of it. */
export function AuxPanel(props: PanelProps): JSX.Element {
  return (
    <WidthKeepingPanel
      {...props}
      edge="start"
      surface="bg-surface-1"
      fallbackWidth={{ initial: 450, min: 360, max: 660 }}
    />
  )
}

/** What is going on in the chosen item: the pane that takes the room left over. */
export function MainContent(props: { readonly header?: JSX.Element; readonly children: JSX.Element }): JSX.Element {
  return (
    <main class="flex min-w-0 flex-1 flex-col bg-surface-2">
      <Show when={props.header}>
        <header class="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3 sm:h-10 sm:px-4">{props.header}</header>
      </Show>
      <div class={SCROLLED}>{props.children}</div>
    </main>
  )
}
