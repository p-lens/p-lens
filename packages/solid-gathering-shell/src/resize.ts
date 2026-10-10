import { createMemo, createSignal, type Accessor } from "solid-js"

/**
 * Which edge of the resized pane the handle sits on. `end` is the edge after
 * the pane in reading order (a pane on the left, handle on its right), `start`
 * the edge before it.
 */
export type HandleEdge = "start" | "end"

/**
 * A bound that may move, given as a function when it depends on something that
 * changes, so a pane cannot stay wider than the room it now has.
 */
export type Bound = number | (() => number)

export interface SizeBounds {
  readonly min: Bound
  readonly max: Bound
}

const valueOf = (bound: Bound): number => (typeof bound === "function" ? bound() : bound)

/**
 * Keep a size within its bounds. A minimum above the maximum yields to the
 * maximum, because a pane wider than the window puts its own far edge, and
 * whatever sits on it, out of reach.
 */
export const clampSize = (value: number, min: number, max: number): number =>
  Math.max(Math.min(min, max), Math.min(max, value))

/** Dragging away from the pane makes it bigger. */
const growthOf = (edge: HandleEdge): number => (edge === "end" ? 1 : -1)

export interface Resizable {
  readonly size: Accessor<number>
  readonly onHandlePointerDown: (event: PointerEvent) => void
}

/**
 * Hold a width in pixels and change it as a pointer drags the handle.
 *
 * Listeners live on the window only while dragging. A drag the browser cancels
 * is undone: a handle near the screen edge is where a phone's back gesture
 * starts, and the system takes the pointer partway through with
 * `pointercancel`, so what moved was never a drag.
 */
export function createResizable(options: SizeBounds & { readonly initial: number; readonly edge: HandleEdge }): Resizable {
  const [wanted, setWanted] = createSignal(options.initial)
  const clamp = (value: number): number => clampSize(value, valueOf(options.min), valueOf(options.max))
  const size = createMemo(() => clamp(wanted()))
  const growth = growthOf(options.edge)

  const onHandlePointerDown = (event: PointerEvent): void => {
    event.preventDefault()
    const start = event.clientX
    const startSize = size()
    const before = wanted()
    const onMove = (moved: PointerEvent): void => {
      setWanted(clamp(startSize + (moved.clientX - start) * growth))
    }
    const release = (): void => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", release)
      window.removeEventListener("pointercancel", cancel)
      document.body.style.removeProperty("cursor")
      document.body.style.removeProperty("user-select")
    }
    const cancel = (): void => {
      setWanted(before)
      release()
    }
    document.body.style.setProperty("cursor", "col-resize")
    document.body.style.setProperty("user-select", "none")
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", release)
    window.addEventListener("pointercancel", cancel)
  }

  return { size, onHandlePointerDown }
}
