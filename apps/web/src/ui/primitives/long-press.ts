import { onCleanup } from "solid-js"

/** How long a press is held before it is a long one, in milliseconds. */
const HELD_FOR = 550

/** How far a finger may wander and still be holding, in pixels: further, it is scrolling. */
const WANDER = 10

/** What a pressed thing is given so that holding it does something of its own. */
export interface LongPress {
  readonly onPointerDown: (event: PointerEvent) => void
  readonly onPointerMove: (event: PointerEvent) => void
  readonly onPointerUp: () => void
  readonly onPointerLeave: () => void
  readonly onPointerCancel: () => void
  readonly onContextMenu: (event: Event) => void
  /** Whether the press that just ended was a long one: its click is the hold's, and opens nothing. */
  readonly wasLong: () => boolean
}

/**
 * A press held where it began, by a finger or a mouse alike: `held` is told
 * once, when the hold has lasted. The click that follows letting go is
 * marked as the hold's own, and the menu a held finger would bring up is
 * kept away, so holding does the one thing.
 */
export const createLongPress = (held: () => void): LongPress => {
  const press: { timer: ReturnType<typeof setTimeout> | undefined; x: number; y: number; long: boolean } = { timer: undefined, x: 0, y: 0, long: false }
  const letGo = (): void => {
    clearTimeout(press.timer)
    press.timer = undefined
  }
  onCleanup(letGo)
  return {
    onPointerDown: (event) => {
      letGo()
      press.long = false
      press.x = event.clientX
      press.y = event.clientY
      press.timer = setTimeout(() => {
        press.timer = undefined
        press.long = true
        held()
      }, HELD_FOR)
    },
    onPointerMove: (event) => {
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > WANDER) letGo()
    },
    onPointerUp: letGo,
    onPointerLeave: letGo,
    onPointerCancel: letGo,
    onContextMenu: (event) => event.preventDefault(),
    wasLong: () => press.long,
  }
}
