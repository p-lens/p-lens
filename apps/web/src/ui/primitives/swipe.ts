import { onCleanup } from "solid-js"

/** How far a finger must travel across, in pixels, for a swipe: less, it was a tap or a slip. */
const ACROSS_AT_LEAST = 56

/** How many times further across than down a finger must travel for a swipe: less, it was scrolling. */
const ACROSS_OVER_DOWN = 1.5

/** The way a swipe went: towards the left, bringing on what comes after, or towards the right, bringing back what came before. */
export type Swiped = "later" | "earlier"

/** What a swiped thing is given so that a finger drawn across it does something of its own. */
export interface Swipe {
  readonly onTouchStart: (event: TouchEvent) => void
  readonly onTouchEnd: (event: TouchEvent) => void
  readonly onTouchCancel: () => void
}

/** The way a finger went from where it touched to where it let go, where it went across far enough and more across than down. */
export const swipedOf = (dx: number, dy: number): Swiped | undefined =>
  Math.abs(dx) < ACROSS_AT_LEAST || Math.abs(dx) < Math.abs(dy) * ACROSS_OVER_DOWN ? undefined : dx < 0 ? "later" : "earlier"

/**
 * A finger drawn across a thing, told once it lets go: `swiped` hears the
 * way it went. Only one finger is followed; a second, a pinch, is let be.
 * Nothing moves while the finger does: the thing is not dragged.
 */
export const createSwipe = (swiped: (way: Swiped) => void): Swipe => {
  const touch: { from: { readonly x: number; readonly y: number } | undefined } = { from: undefined }
  onCleanup(() => {
    touch.from = undefined
  })
  return {
    onTouchStart: (event) => {
      const first = event.touches.item(0)
      touch.from = event.touches.length === 1 && first !== null ? { x: first.clientX, y: first.clientY } : undefined
    },
    onTouchEnd: (event) => {
      const from = touch.from
      const last = event.changedTouches.item(0)
      touch.from = undefined
      if (from === undefined || last === null) return
      const way = swipedOf(last.clientX - from.x, last.clientY - from.y)
      if (way !== undefined) swiped(way)
    },
    onTouchCancel: () => {
      touch.from = undefined
    },
  }
}
