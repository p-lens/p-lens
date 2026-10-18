import { createSignal, onCleanup, onMount, type Accessor, type JSX } from "solid-js"

/** How many of a long list's items are drawn at first, and how many more each time its end comes into sight. */
const REVEALED_AT_ONCE = 300

/** How far before the end comes into sight the next items are drawn, so a scroll seldom reaches a gap. */
const AHEAD = "600px"

/**
 * A long list drawn a part at a time: so many of its items at first, and
 * as many more each time the place after the last comes near the screen.
 * Drawing thousands of rows at once holds a phone up for seconds; nobody
 * reads them at once. The place is watched afresh after each part, so a
 * screen the drawn part does not fill is filled.
 */
export function Revealed(props: { readonly count: number; readonly children: (shown: Accessor<number>) => JSX.Element }): JSX.Element {
  const [shown, setShown] = createSignal(REVEALED_AT_ONCE)
  const held: { sentinel: HTMLDivElement | undefined } = { sentinel: undefined }
  onMount(() => {
    const sentinel = held.sentinel
    if (sentinel === undefined) return
    const watcher = new IntersectionObserver(
      (seen) => {
        if (!seen.some((entry) => entry.isIntersecting) || shown() >= props.count) return
        setShown((now) => now + REVEALED_AT_ONCE)
        watcher.unobserve(sentinel)
        watcher.observe(sentinel)
      },
      { rootMargin: AHEAD },
    )
    watcher.observe(sentinel)
    onCleanup(() => watcher.disconnect())
  })
  return (
    <>
      {props.children(() => Math.min(shown(), props.count))}
      <div ref={(element) => (held.sentinel = element)} aria-hidden="true" />
    </>
  )
}
