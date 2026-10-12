import { createSignal, onCleanup, type Accessor } from "solid-js"

import { createLongPress } from "./long-press"

/** A run of a list's rows, by the places of its first and its last. */
export interface Span {
  readonly from: number
  readonly to: number
}

const ROW_PLACE = "data-span-row"

/** What a row of the list is given to be one a run is held over: its place, or nothing where it is no part of any run. */
export const spanRow = (place: number | undefined): Readonly<Record<string, number | undefined>> => ({ [ROW_PLACE]: place })

/** Whether a place is within a run. */
export const inSpan = (span: Span | undefined, place: number | undefined): boolean => span !== undefined && place !== undefined && place >= span.from && place <= span.to

/** How near an edge of what scrolls a held pointer starts it scrolling, in pixels. */
const EDGE = 56

/** How far a frame scrolls at the most, in pixels. */
const FASTEST = 14

/** How far apart the list is looked for under whatever covers it, in pixels. */
const PROBE = 12

/** Where a hold over the list stands: not begun, being dragged out from the row it began on, or let go over a run of more than one row. */
type Pressing =
  | { readonly type: "resting" }
  | { readonly type: "stretching"; readonly anchor: number; readonly reached: number; readonly span: Span }
  | { readonly type: "chosen"; readonly reached: number; readonly span: Span }

/** A run a hold was let go over, with the row of it nearest where it was let go. */
export interface Chosen {
  readonly span: Span
  readonly row: HTMLElement | undefined
}

export interface SpanPress {
  /** The list a run is held over, given once as it is mounted; its rows say their places with `spanRow`. */
  readonly list: (element: HTMLElement) => void
  /** The run as it stands, while it is dragged out and once it is chosen, for marking its rows. */
  readonly span: Accessor<Span | undefined>
  /** The run a hold was let go over, until it is put down. */
  readonly chosen: Accessor<Chosen | undefined>
  /** Puts the chosen run down: what was asked of it is done, or given up. */
  readonly putDown: () => void
  /** Whether the press that just ended was a hold: its click is the hold's, and presses nothing. */
  readonly wasHeld: () => boolean
}

const placeOf = (row: Element | undefined): number | undefined => {
  const written = row?.getAttribute(ROW_PLACE) ?? undefined
  return written === undefined ? undefined : Number(written)
}

const scrolls = (element: Element): boolean => ((overflow) => (overflow === "auto" || overflow === "scroll") && element.scrollHeight > element.clientHeight)(getComputedStyle(element).overflowY)

/** What a list scrolls in: the nearest thing around it that does, or the page. */
const scrollerOf = (list: Element): Element | undefined => {
  const around = list.parentElement ?? undefined
  if (around === undefined) return document.scrollingElement ?? undefined
  return scrolls(around) ? around : scrollerOf(around)
}

/** The part of a scroller that is on the screen, top and bottom. */
const windowOf = (scroller: Element): { readonly top: number; readonly bottom: number } => {
  const box = scroller.getBoundingClientRect()
  return { top: Math.max(box.top, 0), bottom: Math.min(box.bottom, window.innerHeight) }
}

/**
 * A run of a list's rows chosen by holding one and dragging: the row held
 * begins the run, and it follows the pointer from there, the list scrolled
 * on while the pointer is held near an edge of what it scrolls in — or
 * over whatever stands across the list there, a bar kept at the foot of
 * the screen — so a run reaches rows that were off the screen. `stretch`
 * says how far a run from one row towards another may go, so a run is
 * never one that may not be. Letting go over more than one row leaves the
 * run chosen, for a person to be asked about; nothing is done by the
 * dragging itself.
 *
 * A finger's dragging is kept from scrolling the page by a listener that
 * is there from the start: one added once the hold has lasted comes too
 * late for a browser to ask.
 */
export const createSpanPress = (stretch: (anchor: number, reached: number) => Span): SpanPress => {
  const [pressing, setPressing] = createSignal<Pressing>({ type: "resting" })
  const held: { list: HTMLElement | undefined; scroller: Element | undefined; pressed: number | undefined; x: number; y: number; frame: number | undefined } = {
    list: undefined,
    scroller: undefined,
    pressed: undefined,
    x: 0,
    y: 0,
    frame: undefined,
  }

  const rows = (): readonly HTMLElement[] => (held.list === undefined ? [] : [...held.list.querySelectorAll<HTMLElement>(`[${ROW_PLACE}]`)])

  /** Whether the list shows at a height: it is what is there, or the height is past its ends, where nothing covers it. */
  const showsAt = (list: HTMLElement, y: number): boolean => {
    const box = list.getBoundingClientRect()
    if (y < box.top || y > box.bottom) return true
    const there = document.elementFromPoint(held.x, y) ?? undefined
    return there !== undefined && list.contains(there)
  }

  /** The height the list shows at nearest the pointer's: the pointer's own, or the first towards the middle of what it scrolls in that nothing covers. */
  const shownHeight = (list: HTMLElement, within: { readonly top: number; readonly bottom: number }): number => {
    const middle = (within.top + within.bottom) / 2
    const toward = held.y > middle ? -PROBE : PROBE
    const seek = (y: number): number => (showsAt(list, y) || (y - middle) * toward >= 0 ? y : seek(y + toward))
    return seek(held.y)
  }

  /** How far to scroll this frame: faster the nearer the pointer is to an edge, fastest past it or over what covers the list. */
  const paceOf = (within: { readonly top: number; readonly bottom: number }, covered: boolean): number => {
    const middle = (within.top + within.bottom) / 2
    const depth = covered ? 1 : Math.min(1, Math.max(0, held.y < middle ? (within.top + EDGE - held.y) / EDGE : (held.y - (within.bottom - EDGE)) / EDGE))
    return Math.ceil(depth * FASTEST) * (held.y < middle ? -1 : 1)
  }

  const reachedAt = (y: number): number | undefined => {
    const nearest = rows()
      .map((row) => ((box) => ({ row, away: y < box.top ? box.top - y : y > box.bottom ? y - box.bottom : 0 }))(row.getBoundingClientRect()))
      .reduce<{ readonly row: HTMLElement; readonly away: number } | undefined>((best, each) => (best === undefined || each.away < best.away ? each : best), undefined)
    return placeOf(nearest?.row)
  }

  const follow = (): void => {
    const now = pressing()
    const list = held.list
    const scroller = held.scroller
    if (now.type !== "stretching" || list === undefined || scroller === undefined) return
    const within = windowOf(scroller)
    const shown = shownHeight(list, within)
    scroller.scrollTop += paceOf(within, shown !== held.y)
    const reached = reachedAt(shown)
    if (reached !== undefined && reached !== now.reached) setPressing({ ...now, reached, span: stretch(now.anchor, reached) })
    held.frame = requestAnimationFrame(follow)
  }

  const moved = (event: PointerEvent): void => {
    held.x = event.clientX
    held.y = event.clientY
  }

  const stop = (): void => {
    if (held.frame !== undefined) cancelAnimationFrame(held.frame)
    held.frame = undefined
    window.removeEventListener("pointermove", moved)
    window.removeEventListener("pointerup", letGo)
    window.removeEventListener("pointercancel", givenUp)
  }

  const letGo = (): void => {
    const now = pressing()
    stop()
    if (now.type === "stretching") setPressing(now.span.to > now.span.from ? { type: "chosen", reached: now.reached, span: now.span } : { type: "resting" })
  }

  const givenUp = (): void => {
    stop()
    setPressing({ type: "resting" })
  }

  const hold = createLongPress(() => {
    const anchor = held.pressed
    const list = held.list
    if (anchor === undefined || list === undefined) return
    held.scroller = scrollerOf(list)
    setPressing({ type: "stretching", anchor, reached: anchor, span: { from: anchor, to: anchor } })
    window.addEventListener("pointermove", moved)
    window.addEventListener("pointerup", letGo)
    window.addEventListener("pointercancel", givenUp)
    held.frame = requestAnimationFrame(follow)
  })

  const pressed = (event: PointerEvent): void => {
    if (event.pointerType === "mouse" && event.button !== 0) return
    held.pressed = placeOf(event.target instanceof Element ? (event.target.closest(`[${ROW_PLACE}]`) ?? undefined) : undefined)
    moved(event)
    hold.onPointerDown(event)
  }

  const keptStill = (event: TouchEvent): void => {
    if (pressing().type === "stretching" && event.cancelable) event.preventDefault()
  }

  onCleanup(() => {
    stop()
    held.list?.removeEventListener("touchmove", keptStill)
  })

  return {
    list: (element) => {
      held.list = element
      element.style.userSelect = "none"
      element.style.setProperty("-webkit-user-select", "none")
      element.style.setProperty("-webkit-touch-callout", "none")
      element.addEventListener("pointerdown", pressed)
      element.addEventListener("pointermove", hold.onPointerMove)
      element.addEventListener("pointerup", hold.onPointerUp)
      element.addEventListener("pointercancel", hold.onPointerCancel)
      element.addEventListener("pointerleave", hold.onPointerLeave)
      element.addEventListener("contextmenu", hold.onContextMenu)
      element.addEventListener("touchmove", keptStill, { passive: false })
    },
    span: () => {
      const now = pressing()
      return now.type === "resting" ? undefined : now.span
    },
    chosen: () => {
      const now = pressing()
      return now.type === "chosen" ? { span: now.span, row: rows().find((row) => placeOf(row) === Math.min(Math.max(now.reached, now.span.from), now.span.to)) } : undefined
    },
    putDown: () => {
      if (pressing().type === "chosen") setPressing({ type: "resting" })
    },
    wasHeld: hold.wasLong,
  }
}
