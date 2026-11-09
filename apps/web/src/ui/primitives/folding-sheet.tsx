import { createSignal, onCleanup, onMount, type JSX } from "solid-js"

import { GripIcon } from "./icons"

/** How far down, as a share of its height, an open sheet is pulled before it folds when let go. */
const FOLDS_AT = 0.25

/** How far a press may wander, in pixels, and still be a tap. */
const TAP_SLOP = 6

/** How far up, in pixels, a folded sheet is pulled before it opens when let go: a little. */
const OPENS_AT = 12

/**
 * Where a sheet stands: open at its own height, pulled by a finger from
 * where it was, running to a height of its own once let go, or folded away
 * to nothing.
 */
type Standing =
  | { readonly type: "open" }
  | { readonly type: "pulled"; readonly from: "open" | "folded"; readonly startY: number; readonly moved: number }
  | { readonly type: "running"; readonly to: "open" | "folded" }
  | { readonly type: "folded" }

/** How tall a sheet is drawn while it stands so, given its own height: undefined where it is simply as tall as what it holds. */
const heightOf = (standing: Standing, full: number): number | undefined => {
  switch (standing.type) {
    case "open":
      return undefined
    case "folded":
      return 0
    case "running":
      return standing.to === "open" ? full : 0
    case "pulled":
      return Math.min(full, Math.max(0, (standing.from === "open" ? full : 0) - standing.moved))
  }
}

/** Where a pull lets go to: an open sheet folds once pulled down a share of its height, a folded one opens on a tap or a little pull up. */
const settledAfter = (pulled: Extract<Standing, { type: "pulled" }>, full: number): "open" | "folded" =>
  pulled.from === "open"
    ? pulled.moved > full * FOLDS_AT
      ? "folded"
      : "open"
    : Math.abs(pulled.moved) <= TAP_SLOP || pulled.moved < -OPENS_AT
      ? "open"
      : "folded"

/** Whether the device asks for less motion: a sheet then goes straight to where it settles, running nowhere. */
const lessMotion = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * A part at the foot of a screen that folds down out of the way and comes
 * back, by a tab standing up from its left end with a grip on it, as a
 * folder's tab does, reaching over the line along the part's top so that
 * the two read as one, drawn in the colour the part is — though not while
 * it is folded, when there is no line and the tab reaching below would
 * stand out under the screen's foot: pulled
 * down far enough, a quarter of its height, it folds when let go, and less
 * it springs back; folded, a tap on the tab or a little pull up opens it.
 * The sheet follows the finger as it is pulled, and runs the rest of the
 * way once let go. Folded, what it holds stays, taking no press and no
 * focus. A keyboard opens and folds it from the tab as a button. The tab
 * is at the left, under the thumb of the hand that holds the phone while
 * the other is on a pachinko machine's handle.
 */
export function FoldingSheet(props: { readonly label: string; readonly children: JSX.Element }): JSX.Element {
  const [standing, setStanding] = createSignal<Standing>({ type: "open" })
  const [full, setFull] = createSignal(0)
  const held: { inner: HTMLDivElement | undefined } = { inner: undefined }
  const open = (): boolean => {
    const now = standing()
    return now.type === "open" || (now.type === "running" && now.to === "open") || (now.type === "pulled" && now.from === "open")
  }
  const runTo = (to: "open" | "folded"): void => {
    const still = full() === 0 || heightOf(standing(), full()) === heightOf({ type: "running", to }, full()) || lessMotion()
    setStanding(still ? { type: to } : { type: "running", to })
  }
  const pressed = (event: PointerEvent & { readonly currentTarget: HTMLButtonElement }): void => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setStanding({ type: "pulled", from: open() ? "open" : "folded", startY: event.clientY, moved: 0 })
  }
  const moved = (event: PointerEvent): void => {
    const now = standing()
    if (now.type === "pulled") setStanding({ ...now, moved: event.clientY - now.startY })
  }
  const letGo = (): void => {
    const now = standing()
    if (now.type === "pulled") runTo(settledAfter(now, full()))
  }
  const ran = (event: TransitionEvent): void => {
    const now = standing()
    if (event.target === event.currentTarget && now.type === "running") setStanding({ type: now.to })
  }
  onMount(() => {
    if (held.inner === undefined) return
    const watched = new ResizeObserver(([entry]) => setFull(entry?.borderBoxSize[0]?.blockSize ?? held.inner?.offsetHeight ?? 0))
    watched.observe(held.inner)
    onCleanup(() => watched.disconnect())
  })
  return (
    <div class="relative">
      <button
        type="button"
        aria-label={props.label}
        aria-expanded={open()}
        onPointerDown={pressed}
        onPointerMove={moved}
        onPointerUp={letGo}
        onPointerCancel={letGo}
        onClick={(event) => {
          if (event.detail === 0) runTo(open() ? "folded" : "open")
        }}
        classList={{ "bottom-[calc(100%-1px)] h-[17px]": open(), "bottom-full h-4": !open() }}
        class="absolute left-3 z-10 flex w-8 touch-none select-none items-center justify-center rounded-t border border-b-0 border-border bg-surface-2 text-text-muted hover:text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring [&_svg]:size-3 [&_svg]:rotate-90"
      >
        <GripIcon />
      </button>
      <div
        class="overflow-hidden motion-reduce:transition-none"
        classList={{ "transition-[height] duration-200 ease-out": standing().type === "running" }}
        style={((height) => (height === undefined ? {} : { height: `${height}px` }))(heightOf(standing(), full()))}
        onTransitionEnd={ran}
        inert={standing().type === "folded"}
        aria-hidden={standing().type === "folded"}
      >
        <div
          ref={(element) => {
            held.inner = element
          }}
        >
          {props.children}
        </div>
      </div>
    </div>
  )
}
