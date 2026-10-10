import { children, createMemo, type JSX } from "solid-js"

import { ArrangementProvider } from "./context"
import { visiblePanes, type Arrangement, type Focus } from "./panes"

interface ShellProps {
  readonly arrangement: Arrangement
  readonly focus: Focus
  readonly topBar?: JSX.Element
  readonly rail: JSX.Element
  readonly side: JSX.Element
  readonly aux?: JSX.Element
  readonly children: JSX.Element
}

/**
 * The frame itself, drawn inside the arrangement it provides: the detail
 * slot is resolved here and not a level up, so a panel in it asks the
 * arrangement of this shell — resolved outside, it found none, took the
 * window for wide and kept its own width on a phone.
 */
function Frame(props: ShellProps): JSX.Element {
  const aux = children(() => props.aux)
  const panes = createMemo(() => visiblePanes(props.arrangement, props.focus, aux() !== undefined))
  const narrow = (): boolean => props.arrangement === "narrow"

  return (
    <div
      data-gathering-shell
      data-arrangement={props.arrangement}
      data-focus={props.focus}
      class="flex w-full flex-col overflow-hidden bg-surface-2 text-text-primary"
      style={{ height: "calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom))" }}
    >
      {props.topBar}
      <div class="flex min-h-0 flex-1">
        <div class="flex min-w-0" classList={{ "flex-1": narrow(), "shrink-0": !narrow() }} style={{ display: panes().selection ? undefined : "none" }}>
          {props.rail}
          {props.side}
        </div>
        <div class="flex min-w-0 flex-1" style={{ display: panes().content ? undefined : "none" }}>
          {props.children}
        </div>
        <div class="flex min-w-0" classList={{ "flex-1": narrow() }} style={{ display: panes().detail ? undefined : "none" }}>
          {aux()}
        </div>
      </div>
    </div>
  )
}

/**
 * One screen holding a place where things gather: a bar across the top, a rail
 * of spaces, the list inside the chosen space, what is going on in the chosen
 * item, and its detail.
 *
 * A frame and nothing more. Every pane arrives as a slot, and the shell keeps
 * no state: the host says which arrangement the window calls for and which pane
 * is in focus. Panes hidden in a narrow arrangement stay mounted, so coming
 * back to the list finds it scrolled where it was left.
 *
 * Its height is one screen with the safe-area insets subtracted; scrolling
 * happens inside each pane.
 */
export function GatheringShell(props: ShellProps): JSX.Element {
  return (
    <ArrangementProvider value={() => props.arrangement}>
      <Frame {...props} />
    </ArrangementProvider>
  )
}
