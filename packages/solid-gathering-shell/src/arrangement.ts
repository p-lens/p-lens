import { createSignal, onCleanup, type Accessor } from "solid-js"

import type { Arrangement } from "./panes"

/** Where a window turns narrow: below a width, or where what stands beside the main content leaves it less than it needs. */
export interface ArrangementBounds {
  /** Below this window width the panes are shown one at a time, whatever stands beside the content. */
  readonly narrowBelow: number
  /** The least the main content needs: a wide arrangement leaving it less is narrow instead. */
  readonly contentAtLeast: number
}

/**
 * The arrangement a window calls for: narrow below its width, or where the
 * panes beside the main content — the rail, the list, a detail — would leave
 * the content less room than it needs, as a tablet held sideways does with a
 * detail open; wide otherwise.
 */
export const arrangementFor = (windowWidth: number, besideContent: number, bounds: ArrangementBounds): Arrangement =>
  windowWidth < bounds.narrowBelow || windowWidth - besideContent < bounds.contentAtLeast ? "narrow" : "wide"

/** A window followed: the arrangement it calls for, and where the shell says how wide the panes beside the main content stand. */
export interface ArrangementFollower {
  readonly arrangement: Accessor<Arrangement>
  /** How wide the panes beside the main content stand in a wide arrangement, in pixels, as the shell measures them. */
  readonly besideContent: (width: number) => void
}

const windowWidth = (): number => document.documentElement.clientWidth

/**
 * Follow the window and say which arrangement it calls for: by how wide it
 * is and how much of it the panes beside the main content take, never by
 * what kind of device it is, so a desktop window dragged thin behaves as a
 * phone does, and turns narrow as soon as the content would be squeezed.
 * Must be called inside a reactive owner, which removes the listener when
 * it goes.
 */
export function createArrangement(bounds: ArrangementBounds): ArrangementFollower {
  const [width, setWidth] = createSignal(windowWidth())
  const [beside, setBeside] = createSignal(0)
  const follow = (): void => {
    setWidth(windowWidth())
  }
  window.addEventListener("resize", follow)
  onCleanup(() => window.removeEventListener("resize", follow))
  return { arrangement: () => arrangementFor(width(), beside(), bounds), besideContent: setBeside }
}
