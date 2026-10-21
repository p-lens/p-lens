import { useLocation, useNavigate } from "@solidjs/router"

import { parentOf, pathOf, type Place } from "./place"

/** What a history entry made by a move remembers: the address it was made from. */
interface Came {
  readonly from: string
}

const cameFrom = (state: unknown): string | undefined =>
  typeof state === "object" && state !== null && typeof (state as Partial<Came>).from === "string"
    ? (state as Came).from
    : undefined

/** An address with its hledger query, if there is one. */
const hrefOf = (place: Place, query?: string): string =>
  query === undefined || query === "" ? pathOf(place) : `${pathOf(place)}?q=${encodeURIComponent(query)}`

export interface Moves {
  /** Go somewhere new: one entry in the history, which back undoes. */
  readonly go: (place: Place, query?: string) => void
  /**
   * Go somewhere new in place of where the app is, the screen left being a
   * step on the way there that back does not return to: a play's start,
   * once it is begun, and its cabinet changed, once it is saved. The entry
   * keeps where it was come to from.
   */
  readonly replace: (place: Place) => void
  /**
   * Go one step up from where the app is. When the step before was exactly
   * that, it is taken back rather than taken again, so closing a detail and
   * then pressing back leaves the list instead of reopening the detail.
   */
  readonly up: (here: Place, query?: string) => void
  /**
   * Narrow where the app already is, in place: a search typed letter by
   * letter is one entry in the history, not one per letter.
   */
  readonly refine: (place: Place, query: string) => void
}

export const useMoves = (): Moves => {
  const navigate = useNavigate()
  const location = useLocation()
  const current = (): string => `${location.pathname}${location.search}`

  return {
    go: (place, query) => navigate(hrefOf(place, query), { state: { from: current() } satisfies Came }),
    replace: (place) => navigate(hrefOf(place), { replace: true, state: location.state }),
    up: (here, query) => {
      const parent = parentOf(here)
      if (parent === undefined) return
      const target = hrefOf(parent, query)
      if (cameFrom(location.state) === target) {
        history.back()
        return
      }
      navigate(target, { replace: true })
    },
    refine: (place, query) => navigate(hrefOf(place, query), { replace: true, state: location.state }),
  }
}
