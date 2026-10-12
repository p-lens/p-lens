import type { Checkpoint } from "../play-log/checkpoint"
import type { Result } from "../result/result"
import { revised, takenOf, type RevisionRefusal, type Taken } from "./revision"

/** A run of a play's readings, by the places of its first and its last among them. */
export interface Span {
  readonly from: number
  readonly to: number
}

/** A reading with the regular games the play had come to by it. */
interface Weighed {
  readonly taken: Taken
  readonly regularSpins: number
}

const weighedOf = (ordered: readonly Checkpoint[]): readonly Weighed[] =>
  takenOf(ordered).reduce<{ readonly weighed: readonly Weighed[]; readonly counter: number; readonly regularSpins: number }>(
    (walked, taken) => {
      const advanced = taken.reading.counterSpins - (taken.afterMissedJackpot ? 0 : walked.counter)
      const regularSpins = walked.regularSpins + (taken.reading.phase === "regular" ? advanced : 0)
      return { weighed: [...walked.weighed, { taken, regularSpins }], counter: taken.reading.jackpot.type === "none" ? taken.reading.counterSpins : 0, regularSpins }
    },
    { weighed: [], counter: ordered.at(0)?.counter?.spins ?? 0, regularSpins: 0 },
  ).weighed

/**
 * Whether a reading and the one after it may be made one. Not across a
 * jackpot, which starts the counter over and is a line of its own, and
 * not across a change of the state the cabinet was in, which a single
 * line cannot say of two stretches. Nor is either a reading a jackpot
 * nobody wrote down was admitted before: that jackpot is known only by
 * the counter having gone back at that reading, and would be lost with
 * it.
 */
const joins = (earlier: Taken, later: Taken): boolean =>
  earlier.reading.jackpot.type === "none" && earlier.reading.phase === later.reading.phase && !earlier.afterMissedJackpot && !later.afterMissedJackpot

/** The place a run from one reading reaches towards another, each reading joined to the next: the other's, or the last before a line that does not join. */
const stretched = (weighed: readonly Weighed[], at: number, reached: number): number => {
  if (at === reached) return at
  const next = at + Math.sign(reached - at)
  const earlier = weighed[Math.min(at, next)]
  const later = weighed[Math.max(at, next)]
  return earlier !== undefined && later !== undefined && joins(earlier.taken, later.taken) ? stretched(weighed, next, reached) : at
}

/** Whether a reading says what was in hand: the balls counted, or balls bought, which says the hand had run out. */
const knowsTheHand = ({ reading }: Taken): boolean => reading.held !== undefined || reading.rented > 0 || reading.replayed > 0

/**
 * Whether a run made one line leaves what the play is measured by as it
 * was. A play's regular games are measured between two lines that know
 * what was in hand (`consumptionOf`), and the one line a run becomes
 * stands where its last reading stood, saying what that one said of the
 * hand. So where any reading of the run knew the hand, the last must: a
 * count would otherwise be lost, or balls bought earlier be taken as
 * bought, the hand empty, at the last. And a reading that knew the hand
 * before any regular game is not folded into one after them: the
 * measuring starts from it.
 */
const keepsTheMeasure = (run: readonly Weighed[]): boolean => {
  const last = run.at(-1)
  const knowing = run.slice(0, -1).filter(({ taken }) => knowsTheHand(taken))
  return last === undefined || knowing.length === 0 || (knowsTheHand(last.taken) && !knowing.some((each) => each.regularSpins === 0 && last.regularSpins > 0))
}

const spanBetween = (one: number, other: number): Span => ({ from: Math.min(one, other), to: Math.max(one, other) })

/** Every place from one to another, the other first. */
const backFrom = (reached: number, anchor: number): readonly number[] => Array.from({ length: Math.abs(reached - anchor) + 1 }, (_, back) => reached - back * Math.sign(reached - anchor))

/**
 * The run of readings that may be made one, from the reading at `anchor`
 * towards the one at `reached`: as far as each joins the next, and then
 * the longest of that which leaves the play measured as it was. A reading
 * alone, where nothing may be made one with it.
 */
export const mergeableSpan = (ordered: readonly Checkpoint[], anchor: number, reached: number): Span => {
  const weighed = weighedOf(ordered)
  const end = backFrom(stretched(weighed, anchor, reached), anchor).find((candidate) => ((span) => keepsTheMeasure(weighed.slice(span.from, span.to + 1)))(spanBetween(anchor, candidate)))
  return spanBetween(anchor, end ?? anchor)
}

/** A run of readings as the one it makes: the last, with all that was rented, drawn and drifted over the run. */
const mergedOf = (run: readonly Taken[]): Taken | undefined => {
  const last = run.at(-1)
  if (last === undefined) return undefined
  return {
    ...last,
    reading: {
      ...last.reading,
      rented: run.reduce((sum, each) => sum + each.reading.rented, 0),
      replayed: run.reduce((sum, each) => sum + each.reading.replayed, 0),
      supported: run.reduce((sum, each) => sum + each.reading.supported, 0),
    },
  }
}

/**
 * The log with a run of its readings made one line: the counter, the
 * balls in hand and the hour as the last read them, and what was rented,
 * drawn and drifted over the run in all. The play's totals, and what it
 * is measured by, stand as they were; only the lines between are gone. A
 * span that may not be made one whole is made one as far as it may be
 * (`mergeableSpan`), from its first reading.
 */
export const withReadingsMerged = (ordered: readonly Checkpoint[], span: Span): Result<readonly Checkpoint[], RevisionRefusal> => {
  const { from, to } = mergeableSpan(ordered, span.from, span.to)
  return revised(ordered, (taken) => {
    const merged = mergedOf(taken.slice(from, to + 1))
    return merged === undefined ? taken : [...taken.slice(0, from), merged, ...taken.slice(to + 1)]
  })
}
