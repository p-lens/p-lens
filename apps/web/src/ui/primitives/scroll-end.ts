import { createComputed, createEffect, on, type Accessor } from "solid-js"

/** How near the scroll's end counts as at it, in pixels: a hair short of it, as a scroll to the foot can stop. */
const NEAR_THE_END = 16

const scrolls = (element: HTMLElement): boolean => ((overflow) => overflow === "auto" || overflow === "scroll")(getComputedStyle(element).overflowY)

const scrollerOf = (element: HTMLElement): HTMLElement | undefined => {
  const parent = element.parentElement ?? undefined
  return parent === undefined || scrolls(parent) ? parent : scrollerOf(parent)
}

const nearTheEnd = (scroller: HTMLElement): boolean => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= NEAR_THE_END

/**
 * Keeps a scroll that stood at or near its end at the end as what `shown`
 * reads changes: something pinned over the scroll's end grows, and would
 * otherwise cover what was last in view. Where the scroll was elsewhere, it
 * is left where it was. `anchor` is any element inside the scroll.
 */
export const holdTheEnd = (anchor: () => HTMLElement | undefined, shown: Accessor<unknown>): void => {
  const held: { scroller: HTMLElement | undefined } = { scroller: undefined }
  createComputed(
    on(shown, () => {
      const element = anchor()
      const scroller = element === undefined ? undefined : scrollerOf(element)
      held.scroller = scroller !== undefined && nearTheEnd(scroller) ? scroller : undefined
    }),
  )
  createEffect(
    on(
      shown,
      () => {
        const scroller = held.scroller
        if (scroller !== undefined) scroller.scrollTop = scroller.scrollHeight
      },
      { defer: true },
    ),
  )
}
