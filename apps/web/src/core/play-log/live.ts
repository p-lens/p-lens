import { Err, Ok, type Result } from "../result/result"
import type { Checkpoint } from "./checkpoint"
import { performanceAcross, stretchPerformances, type StretchPerformance } from "./performance"

/**
 * Where a play stands, worked out from its log in play order. Every figure is
 * read off the checkpoints; nothing here is kept between readings.
 */
export interface LiveSummary {
  /** Spins since the play began, as of the last checkpoint. */
  readonly spins: number
  /** What the parlor's counter should be showing now. */
  readonly counterNow: number
  readonly outlay: number | undefined
  /** Jackpots this log records: one for each line that says one, or as many as the bonus it names was won over. */
  readonly jackpots: number
  /**
   * Jackpots the parlor's counter has shown since the play began, where it
   * was read: what it last said, less what it already said at the seat —
   * those were somebody else's, before this play.
   */
  readonly counterJackpots: number | undefined
  /** Spin performance from the first point that knows the outlay to the last. */
  readonly overall: StretchPerformance | undefined
  readonly stretches: readonly StretchPerformance[]
}

const isJackpot = (checkpoint: Checkpoint): boolean => checkpoint.event?.kind === "jackpot"

/** The jackpots a line records: none, one, or as many as the bonus it names was won over — a run of jackpots a machine gives as one win, which the parlor's counter counts each of. */
const jackpotsAt = (checkpoint: Checkpoint): number => (checkpoint.event?.kind === "jackpot" ? (checkpoint.event.bonus?.jackpots ?? 1) : 0)

/** A point the parlor's counter is read from: the play's spins there, and what the counter showed. */
interface Anchor {
  readonly spins: number
  readonly counter: number
}

/**
 * Where counter readings count from. The counter starts over at every
 * jackpot, so after one it is the last jackpot, counter zero; before any, it
 * is the play's first point, whose counter still shows the spins of whoever
 * played the cabinet before.
 */
const anchorOf = (ordered: readonly Checkpoint[]): Anchor => {
  const jackpot = ordered.findLast(isJackpot)
  const first = ordered.at(0)
  return jackpot !== undefined
    ? { spins: jackpot.spins, counter: 0 }
    : { spins: first?.spins ?? 0, counter: first?.counter?.spins ?? 0 }
}

const counterNowOf = (ordered: readonly Checkpoint[]): number => {
  const anchor = anchorOf(ordered)
  return anchor.counter + (ordered.at(-1)?.spins ?? 0) - anchor.spins
}

const lastKnown = <T>(ordered: readonly Checkpoint[], read: (checkpoint: Checkpoint) => T | undefined): T | undefined =>
  ordered.map(read).findLast((value): value is T => value !== undefined)

const jackpotsSinceSeat = (ordered: readonly Checkpoint[]): number | undefined => {
  const shown = lastKnown(ordered.slice(1), (checkpoint) => checkpoint.counter?.jackpots)
  return shown === undefined ? undefined : shown - (ordered.at(0)?.counter?.jackpots ?? 0)
}

export const liveSummary = (ordered: readonly Checkpoint[]): LiveSummary => {
  const spins = ordered.at(-1)?.spins ?? 0
  const withOutlay = ordered.filter((checkpoint) => checkpoint.outlay !== undefined)
  const first = withOutlay.at(0)
  const last = withOutlay.at(-1)
  return {
    spins,
    counterNow: counterNowOf(ordered),
    outlay: last?.outlay,
    jackpots: ordered.reduce((sum, checkpoint) => sum + jackpotsAt(checkpoint), 0),
    counterJackpots: jackpotsSinceSeat(ordered),
    overall: first === undefined || last === undefined ? undefined : performanceAcross(first, last),
    stretches: stretchPerformances(ordered),
  }
}

/**
 * What a reading of the parlor's counter means for the log.
 *
 * The running total is the spins at the anchor plus how far the counter has
 * moved since it. A reading below what the counter should already be showing
 * means it started over without this log knowing: a jackpot came and was not
 * written down.
 */
export type CounterReading =
  | { readonly type: "continues"; readonly spins: number }
  | { readonly type: "counter-went-back"; readonly expectedAtLeast: number }

export const readCounter = (ordered: readonly Checkpoint[], counterSpins: number): CounterReading => {
  const anchor = anchorOf(ordered)
  const expected = counterNowOf(ordered)
  return counterSpins < expected
    ? { type: "counter-went-back", expectedAtLeast: expected }
    : { type: "continues", spins: anchor.spins + counterSpins - anchor.counter }
}

/**
 * The checkpoints for a reading taken after a jackpot nobody wrote down: an
 * approximate jackpot at the last point the log knew of, then the reading,
 * counted from there.
 */
export const afterMissedJackpot = (
  ordered: readonly Checkpoint[],
  counterSpins: number,
  reading: Omit<Checkpoint, "spins">,
): readonly Checkpoint[] => {
  const known = ordered.at(-1)?.spins ?? 0
  return [
    { spins: known, ...(reading.at === undefined ? {} : { at: reading.at }), event: { kind: "jackpot", approximate: true } },
    { ...reading, spins: known + counterSpins },
  ]
}

/**
 * Whether the counter says there have been more jackpots than the log has:
 * a jackpot came in a run too quick to write down.
 */
export const missingJackpots = (summary: LiveSummary): number =>
  summary.counterJackpots === undefined ? 0 : Math.max(0, summary.counterJackpots - summary.jackpots)

/** One reading of the counter, as it was taken at the cabinet. */
export interface CounterInput {
  readonly counterSpins: number
  readonly outlay: number | undefined
  /** Tokens drawn from savings since the play began, where they were given. */
  readonly replay: number | undefined
  readonly counterJackpots: number | undefined
  readonly at: string
  /** Whether the reading was taken at a jackpot, the moment the counter is about to start over. */
  readonly jackpot: boolean
}

export type ReadingRefusal =
  | { readonly type: "counter-went-back"; readonly expectedAtLeast: number }
  | { readonly type: "outlay-went-back"; readonly atLeast: number }
  | { readonly type: "replay-went-back"; readonly atLeast: number }

/** Everything a reading records except where in the play it falls. */
const readingFields = (input: CounterInput): Omit<Checkpoint, "spins"> => ({
  ...(input.outlay === undefined ? {} : { outlay: input.outlay }),
  ...(input.replay === undefined ? {} : { replay: input.replay }),
  at: input.at,
  counter: input.counterJackpots === undefined ? { spins: input.counterSpins } : { spins: input.counterSpins, jackpots: input.counterJackpots },
  ...(input.jackpot ? { event: { kind: "jackpot" as const } } : {}),
})

/**
 * The checkpoints a counter reading adds to a log, or why it cannot be added
 * as it stands. `missedJackpot` is the person's answer to a counter that went
 * back: a jackpot came that nobody wrote down, so it is written down now.
 */
export const checkpointsForReading = (
  ordered: readonly Checkpoint[],
  input: CounterInput,
  missedJackpot: boolean,
): Result<readonly Checkpoint[], ReadingRefusal> => {
  const spentBefore = lastKnown(ordered, (checkpoint) => checkpoint.outlay)
  if (input.outlay !== undefined && spentBefore !== undefined && input.outlay < spentBefore)
    return Err({ type: "outlay-went-back", atLeast: spentBefore })
  const drawnBefore = lastKnown(ordered, (checkpoint) => checkpoint.replay)
  if (input.replay !== undefined && drawnBefore !== undefined && input.replay < drawnBefore) return Err({ type: "replay-went-back", atLeast: drawnBefore })
  const reading = readCounter(ordered, input.counterSpins)
  if (reading.type === "continues") return Ok([{ spins: reading.spins, ...readingFields(input) }])
  if (!missedJackpot) return Err(reading)
  return Ok(afterMissedJackpot(ordered, input.counterSpins, readingFields(input)))
}
