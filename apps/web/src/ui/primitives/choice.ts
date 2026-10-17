/**
 * Some of a list chosen, as a filter holds them: `undefined` is every one
 * of them, nothing left out, and a list is those chosen alone — none at
 * all being a choice too, made on the way to choosing a few out of many.
 */
export type Chosen = readonly string[] | undefined

/** How the ticks stand together: every one, none, or some — what a tick for all of them shows. */
export type TickState = "all" | "none" | "some"

/** Whether a filter holds anything back. */
export const isNarrowed = (chosen: Chosen): boolean => chosen !== undefined

export const isTicked = (chosen: Chosen, key: string): boolean => chosen === undefined || chosen.includes(key)

/** The choice once one is ticked or unticked, in the list's order: every one again where nothing is left out. */
export const tickedOne = (every: readonly string[], chosen: Chosen, key: string, on: boolean): Chosen => {
  const next = every.filter((each) => (each === key ? on : isTicked(chosen, each)))
  return next.length === every.length ? undefined : next
}

/** The choice once the tick for all of them is pressed: every one, or none. */
export const tickedAll = (on: boolean): Chosen => (on ? undefined : [])

export const tickStateOf = (every: readonly string[], chosen: Chosen): TickState => {
  const ticked = every.filter((each) => isTicked(chosen, each)).length
  return ticked === every.length ? "all" : ticked === 0 ? "none" : "some"
}
