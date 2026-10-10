import { createEffect, createSignal, on, onCleanup, type Accessor } from "solid-js"

/** How long what is typed stands still before it is acted on, in milliseconds. */
export const DEBOUNCE_FOR = 300

/**
 * A value debounced: it follows another only once that other has stood
 * still. Typing 512 passes through 5 and 51, and nothing worth working out
 * stands at either.
 */
export const createDebounced = <T>(source: Accessor<T>): Accessor<T> => {
  const [value, setValue] = createSignal<T>(source())
  createEffect(
    on(
      source,
      (next) => {
        const timer = setTimeout(() => setValue(() => next), DEBOUNCE_FOR)
        onCleanup(() => clearTimeout(timer))
      },
      { defer: true },
    ),
  )
  return value
}
