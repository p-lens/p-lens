import { createEffect, type Accessor } from "solid-js"

/**
 * Brings an element to the middle of the view once, when a place asks for
 * it and what it waits on is ready: the element `target` is given, or else
 * the one `fallback` is. Asked again only after the place has stopped
 * asking, so a person scrolling on is never pulled back.
 */
export const bringIntoView = (asked: Accessor<boolean>, ready: Accessor<boolean>): { readonly target: (element: HTMLElement) => void; readonly fallback: (element: HTMLElement) => void } => {
  const held: { target: HTMLElement | undefined; fallback: HTMLElement | undefined; brought: boolean } = { target: undefined, fallback: undefined, brought: false }
  createEffect(() => {
    if (!asked()) {
      held.brought = false
      return
    }
    if (held.brought || !ready()) return
    held.brought = true
    requestAnimationFrame(() => (held.target ?? held.fallback)?.scrollIntoView({ block: "center" }))
  })
  return {
    target: (element) => {
      held.target = element
    },
    fallback: (element) => {
      held.fallback = element
    },
  }
}
