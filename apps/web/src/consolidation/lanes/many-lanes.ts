import type { Lanes, StoppedAtWork } from "../port/lanes"

/**
 * Lanes over the one session every screen reads on and as many more as the
 * plan gives for so many books, each started the first time it is wanted
 * and kept after, its hledger holding the books it was given. None beyond
 * the first while the consolidation is not on, nor on a page whose last
 * stopped while reading on several.
 */
export const createManyLanes = <Session>(parts: {
  readonly first: Session
  readonly another: () => Session
  readonly plan: (books: number) => number
  readonly on: () => boolean
  readonly stopped: StoppedAtWork
  readonly working: (busy: boolean) => void
}): Lanes<Session> => {
  const started: Session[] = []
  return {
    sessionsFor: (books) => {
      const wanted = parts.on() && !parts.stopped.stopped() ? parts.plan(books) : 1
      while (started.length < wanted - 1) started.push(parts.another())
      return [parts.first, ...started.slice(0, wanted - 1)]
    },
    working: parts.working,
  }
}
