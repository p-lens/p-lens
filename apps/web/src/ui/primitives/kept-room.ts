import { createSignal, onCleanup, untrack, type Accessor, type JSX } from "solid-js"

/** A place whose content is made again from time to time: where it is, and the room it keeps while that is being done. */
export interface KeptRoom {
  readonly keep: (element: HTMLElement) => void
  readonly style: Accessor<JSX.CSSProperties>
}

/**
 * Keeps the room an answer took while it is being worked out again: what
 * stands in for it meanwhile is shorter, and a page that lost the
 * difference would have its scroll pulled back — to the top, where the
 * rest fits the screen — and left there when the answer came back.
 */
export const createKeptRoom = (busy: Accessor<boolean>): KeptRoom => {
  const [room, setRoom] = createSignal<number>(0)
  const keep = (element: HTMLElement): void => {
    const observer = new ResizeObserver(() => {
      if (!untrack(busy)) setRoom(element.offsetHeight)
    })
    observer.observe(element)
    onCleanup(() => observer.disconnect())
  }
  return { keep, style: () => (busy() ? { "min-height": `${room()}px` } : {}) }
}
