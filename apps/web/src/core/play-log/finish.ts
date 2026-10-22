import type { PlayGameKind } from "../play/play"
import { appendCheckpoint, parsePlayLog, type Checkpoint, type Counter } from "./checkpoint"
import { inPlayOrder } from "./performance"

/** The figure of a data counter a play is followed by, and what it last stood at. */
export interface FinishCounter {
  readonly figure: keyof Pick<Counter, "spins" | "total">
  readonly count: number
}

/** How a play finished, as the person gave it: when, and what its counter stood at — each where given. */
export interface Finish {
  readonly at: string | undefined
  readonly counter: number | undefined
}

/** A pachislot counter is followed by the day's games where it was read by them, and by the games since the last AT where not; a pachinko counter by its spins since the last jackpot. */
const figureOf = (gameKind: PlayGameKind, counter: Counter): FinishCounter["figure"] => (gameKind === "pachislot" && counter.total !== undefined ? "total" : "spins")

const lastRead = (ordered: readonly Checkpoint[], gameKind: PlayGameKind): FinishCounter | undefined => {
  const counter = ordered.findLast((checkpoint) => checkpoint.counter !== undefined)?.counter
  if (counter === undefined) return undefined
  const figure = figureOf(gameKind, counter)
  const count = counter[figure]
  return count === undefined ? undefined : { figure, count }
}

/** What a play's counter stood at when it was last read, which is where it finishes unless the person says it went further. None for a log that does not read or never read a counter. */
export const finishCounterOf = (log: string, gameKind: PlayGameKind): FinishCounter | undefined => {
  const parsed = parsePlayLog(log)
  return parsed.ok ? lastRead(inPlayOrder(parsed.value), gameKind) : undefined
}

/** The moment a play's log was last written to: the latest any of its lines says, its finish aside. None for a log that does not read, or whose lines say no moment. */
export const lastWrittenAt = (log: string): string | undefined => {
  const parsed = parsePlayLog(log)
  if (!parsed.ok) return undefined
  return parsed.value
    .filter((checkpoint) => checkpoint.event?.kind !== "finished")
    .flatMap((checkpoint) => (checkpoint.at === undefined ? [] : [checkpoint.at]))
    .reduce<string | undefined>((latest, at) => (latest === undefined || new Date(at).getTime() > new Date(latest).getTime() ? at : latest), undefined)
}

/**
 * How long after its last line a play is taken to have gone on, in
 * minutes, where nobody says when it finished. A person following their own
 * play writes a line every few thousand yen — some a quarter of an hour
 * apart — so their play may have run that long past its last line; a play
 * sent by someone else was written to up to the moment it was sent, and
 * is given less.
 */
export const PLAYED_ON_FOR = { own: 15, received: 5 } as const

/**
 * When a play is taken to have finished, asked at `now`: now, while the play
 * was written to lately — the person is still at the cabinet — and
 * otherwise so long after its last line and no later. A play recorded the
 * morning after did not finish that morning. A log that says no moment finishes
 * now.
 */
export const finishedBy = (now: string, lastWritten: string | undefined, minutes: number): string => {
  if (lastWritten === undefined) return now
  const latest = new Date(lastWritten).getTime() + minutes * 60_000
  return new Date(now).getTime() <= latest ? now : new Date(latest).toISOString()
}

/**
 * A log with the line that finishes its play, last in play order: when the
 * play finished, the counter as it then stood where that is further on
 * than it was last read — the games between are the line's, as any
 * reading's are — and the tokens in hand as the play was recorded with
 * them, where it was: a count, which the play is measured to. A counter
 * given as it was last read, or behind it, adds no games. A log that does
 * not read is left as it is.
 */
export const withFinish = (log: string, finish: Finish, gameKind: PlayGameKind, held: number | undefined): string => {
  const parsed = parsePlayLog(log)
  if (!parsed.ok) return log
  const ordered = inPlayOrder(parsed.value)
  const spins = ordered.at(-1)?.spins ?? 0
  const read = lastRead(ordered, gameKind)
  const further = read !== undefined && finish.counter !== undefined && finish.counter > read.count ? { figure: read.figure, by: finish.counter - read.count, count: finish.counter } : undefined
  return appendCheckpoint(log, {
    spins: spins + (further?.by ?? 0),
    ...(finish.at === undefined ? {} : { at: finish.at }),
    ...(further === undefined ? {} : { counter: { [further.figure]: further.count } }),
    ...(held === undefined ? {} : { held }),
    event: { kind: "finished" },
  })
}
