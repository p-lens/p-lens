import { createSignal, onCleanup, onMount, type Accessor } from "solid-js"

const scrolls = (element: HTMLElement): boolean => ((overflow) => overflow === "auto" || overflow === "scroll")(getComputedStyle(element).overflowY)

/** The scroll an element is in: its nearest parent that scrolls, none where nothing does. */
export const scrollerOf = (element: HTMLElement): HTMLElement | undefined => {
  const parent = element.parentElement ?? undefined
  return parent === undefined || scrolls(parent) ? parent : scrollerOf(parent)
}

/**
 * How tall the scroll an element is in shows, in pixels, followed as it
 * changes — a keyboard rising, a phone turned: undefined until the element
 * is in place, and where it is in no scroll. Made in a component, whose
 * mounting is when the element is looked for.
 */
export const createScrollerHeight = (): { readonly within: (element: HTMLElement) => void; readonly height: Accessor<number | undefined> } => {
  const [height, setHeight] = createSignal<number | undefined>(undefined)
  const held: { element: HTMLElement | undefined } = { element: undefined }
  onMount(() => {
    const scroller = held.element === undefined ? undefined : scrollerOf(held.element)
    if (scroller === undefined) return
    const observer = new ResizeObserver(() => setHeight(scroller.clientHeight))
    observer.observe(scroller)
    onCleanup(() => observer.disconnect())
  })
  return {
    within: (element) => {
      held.element = element
    },
    height,
  }
}
