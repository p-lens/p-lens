import { createSignal, onCleanup, type Accessor } from "solid-js"

import type { Arrangement } from "./panes"

/**
 * Follow the window and say which arrangement it calls for.
 *
 * Asks how wide the window is, never what kind of device it is, so a desktop
 * window dragged thin behaves as a phone does. Must be called inside a reactive
 * owner, which removes the listener when it goes.
 */
export function createArrangement(options: { readonly narrowBelow: number }): Accessor<Arrangement> {
  const query = window.matchMedia(`(width < ${options.narrowBelow}px)`)
  const [narrow, setNarrow] = createSignal(query.matches)
  const follow = (event: MediaQueryListEvent): void => {
    setNarrow(event.matches)
  }
  query.addEventListener("change", follow)
  onCleanup(() => query.removeEventListener("change", follow))
  return () => (narrow() ? "narrow" : "wide")
}
