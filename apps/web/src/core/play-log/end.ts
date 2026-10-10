import type { PlayGameKind } from "../play/play"
import { appendCheckpoint, parsePlayLog, type Checkpoint, type Counter } from "./checkpoint"
import { inPlayOrder } from "./performance"

/** The figure of a data counter a play is followed by, and what it last stood at. */
export interface EndCounter {
  readonly figure: keyof Pick<Counter, "spins" | "total">
  readonly count: number
}

/** How a play ended, as the person gave it: when, and what its counter stood at — each where given. */
export interface End {
  readonly at: string | undefined
  readonly counter: number | undefined
}

/** A pachislot counter is followed by the day's games where it was read by them, and by the games since the last AT where not; a pachinko counter by its spins since the last jackpot. */
const figureOf = (gameKind: PlayGameKind, counter: Counter): EndCounter["figure"] => (gameKind === "slot" && counter.total !== undefined ? "total" : "spins")

const lastRead = (ordered: readonly Checkpoint[], gameKind: PlayGameKind): EndCounter | undefined => {
  const counter = ordered.findLast((checkpoint) => checkpoint.counter !== undefined)?.counter
  if (counter === undefined) return undefined
  const figure = figureOf(gameKind, counter)
  const count = counter[figure]
  return count === undefined ? undefined : { figure, count }
}

/** What a play's counter stood at when it was last read, which is where it ends unless the person says it went further. None for a log that does not read or never read a counter. */
export const endCounterOf = (log: string, gameKind: PlayGameKind): EndCounter | undefined => {
  const parsed = parsePlayLog(log)
  return parsed.ok ? lastRead(inPlayOrder(parsed.value), gameKind) : undefined
}

/**
 * A log with the line that ends its play, last in play order: when the
 * play ended, and the counter as it then stood where that is further on
 * than it was last read — the games between are the line's, as any
 * reading's are. A counter given as it was last read, or behind it, adds
 * no games. A log that does not read is left as it is.
 */
export const withEnd = (log: string, end: End, gameKind: PlayGameKind): string => {
  const parsed = parsePlayLog(log)
  if (!parsed.ok) return log
  const ordered = inPlayOrder(parsed.value)
  const spins = ordered.at(-1)?.spins ?? 0
  const read = lastRead(ordered, gameKind)
  const further = read !== undefined && end.counter !== undefined && end.counter > read.count ? { figure: read.figure, by: end.counter - read.count, count: end.counter } : undefined
  return appendCheckpoint(log, {
    spins: spins + (further?.by ?? 0),
    ...(end.at === undefined ? {} : { at: end.at }),
    ...(further === undefined ? {} : { counter: { [further.figure]: further.count } }),
    event: { kind: "ended" },
  })
}
