import type { Change, ChangeId } from "./change"
import type { Held } from "./state"

/** The ids a change's ancestry needs that are not held: what is fetched from the line by `ids`. */
export const missingOf = (held: Held): readonly ChangeId[] => [...new Set([...held.values()].flatMap((change) => change.parents.filter((parent) => !held.has(parent))))].toSorted()

/** Every change whose ancestry is held whole, down to a base: those a state can be worked out for. */
export const wholeOf = (held: Held): ReadonlySet<ChangeId> => {
  const known = new Map<ChangeId, boolean>()
  const whole = (id: ChangeId): boolean => {
    const stack: ChangeId[] = [id]
    while (stack.length > 0) {
      const at = stack[stack.length - 1] as ChangeId
      if (known.has(at)) {
        stack.pop()
        continue
      }
      const change = held.get(at)
      if (change === undefined) {
        known.set(at, false)
        stack.pop()
        continue
      }
      const waiting = change.sort === "base" ? [] : change.parents.filter((parent) => !known.has(parent))
      if (waiting.length > 0) {
        stack.push(...waiting)
        continue
      }
      known.set(at, change.sort === "base" || change.parents.every((parent) => known.get(parent) === true))
      stack.pop()
    }
    return known.get(id) === true
  }
  return new Set([...held.keys()].filter(whole))
}

/** The changes no other held change names as a parent, among those given, lowest id first (PROTOCOL.md §5.2). */
export const headsOf = (held: Held, among: ReadonlySet<ChangeId>): readonly ChangeId[] => {
  const named = new Set([...among].flatMap((id) => held.get(id)?.parents ?? []))
  return [...among].filter((id) => !named.has(id)).toSorted()
}

/** A change and every change it descends from, as far as they are held; `toBases` stops at each base, whose state needs nothing below it. */
const reachedFrom = (held: Held, id: ChangeId, toBases: boolean): ReadonlySet<ChangeId> => {
  const found = new Set<ChangeId>()
  const stack: ChangeId[] = [id]
  while (stack.length > 0) {
    const at = stack.pop() as ChangeId
    if (found.has(at)) continue
    found.add(at)
    const change = held.get(at)
    if (change !== undefined && !(toBases && change.sort === "base")) stack.push(...change.parents)
  }
  return found
}

/** A change and every change it descends from, as far as they are held. */
export const ancestryOf = (held: Held, id: ChangeId): ReadonlySet<ChangeId> => reachedFrom(held, id, false)

/** How far a change stands from the base it rests on: a base is none, anything else one past the furthest of its parents. */
const depthsOf = (held: Held, ids: ReadonlySet<ChangeId>): ReadonlyMap<ChangeId, number> => {
  const depths = new Map<ChangeId, number>()
  const depthOf = (id: ChangeId): number => {
    const stack: ChangeId[] = [id]
    while (stack.length > 0) {
      const at = stack[stack.length - 1] as ChangeId
      const change: Change | undefined = held.get(at)
      if (depths.has(at) || change === undefined || change.sort === "base") {
        if (!depths.has(at)) depths.set(at, 0)
        stack.pop()
        continue
      }
      const waiting = change.parents.filter((parent) => !depths.has(parent))
      if (waiting.length > 0) stack.push(...waiting)
      else {
        depths.set(at, 1 + Math.max(...change.parents.map((parent) => depths.get(parent) ?? 0)))
        stack.pop()
      }
    }
    return depths.get(id) ?? 0
  }
  ids.forEach(depthOf)
  return depths
}

/**
 * Where two heads are merged from (PROTOCOL.md §5.3): the common ancestor no
 * other common ancestor descends from; of several, the furthest from the
 * base, then the lowest id. None where the two share nothing held.
 */
export const mergeBaseOf = (held: Held, first: ChangeId, second: ChangeId): ChangeId | undefined => {
  const ofFirst = ancestryOf(held, first)
  const common = new Set([...ancestryOf(held, second)].filter((id) => ofFirst.has(id)))
  const below = new Set([...common].flatMap((id) => [...ancestryOf(held, id)].filter((each) => each !== id)))
  const best = [...common].filter((id) => !below.has(id))
  const depths = depthsOf(held, new Set(best))
  return best.toSorted((one, other) => (depths.get(other) ?? 0) - (depths.get(one) ?? 0) || (one < other ? -1 : one > other ? 1 : 0))[0]
}

/** Whether one change descends from another, or is it. */
export const descendsFrom = (held: Held, id: ChangeId, ancestor: ChangeId): boolean => ancestryOf(held, id).has(ancestor)

/** The latest base a change rests on: the first base up its first parents. */
export const baseUnder = (held: Held, id: ChangeId): ChangeId | undefined => {
  const walked: { at: ChangeId | undefined } = { at: id }
  while (walked.at !== undefined) {
    const change = held.get(walked.at)
    if (change === undefined) return undefined
    if (change.sort === "base") return walked.at
    walked.at = change.parents[0]
  }
  return undefined
}

/** How many changes, and how many bytes of patches, a head carries above the bases it rests on: what says a new base is due (PROTOCOL.md §5.5). */
export const sinceBase = (held: Held, id: ChangeId): { readonly changes: number; readonly bytes: number } =>
  [...reachedFrom(held, id, true)].reduce(
    (so, each) => ((change) => (change === undefined || change.sort === "base" ? so : { changes: so.changes + 1, bytes: so.bytes + JSON.stringify(change.patches).length }))(held.get(each)),
    { changes: 0, bytes: 0 },
  )
