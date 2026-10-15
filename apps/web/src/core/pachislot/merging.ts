import type { Checkpoint } from "../play-log/checkpoint"
import type { Result } from "../result/result"
import { revised, stepsOf, type RevisionRefusal, type Step } from "./revision"

/** A run of a play's readings, by the places of its first and its last among the play's steps. */
export interface Span {
  readonly from: number
  readonly to: number
}

const TAPPED_FIELDS: readonly string[] = ["spins", "at", "tally"]

/**
 * Whether the step at a place is a tap on a counting tile: a line that
 * says nothing but its counts. A run passes over taps, which stand
 * wherever the log has reached. A line of no counts is where a log written
 * while counting began with a press told its counted games from, and no
 * run passes it.
 */
const isTap = (steps: readonly Step[], at: number): boolean => {
  const step = steps[at]
  return step?.type === "kept" && Object.keys(step.line.tally ?? {}).length > 0 && Object.keys(step.line).every((field) => TAPPED_FIELDS.includes(field))
}

/** The next reading from a place, one way or the other, past any taps; none where another line stands between, or the steps end. */
const neighbourOf = (steps: readonly Step[], at: number, toward: 1 | -1): number | undefined => {
  const next = at + toward
  const step = steps[next]
  if (step === undefined) return undefined
  if (step.type !== "kept") return next
  return isTap(steps, next) ? neighbourOf(steps, next, toward) : undefined
}

/**
 * Whether a reading and the next may be made one. A counter's readings
 * are of the same kind, each saying all the one before did and more. On
 * an AT machine the earlier must have ended with nothing — a CZ missed or
 * an AT won is a line of its own — and the later not be one an AT nobody
 * wrote down was admitted before.
 */
const joins = (earlier: Step, later: Step): boolean =>
  (earlier.type === "reading" && later.type === "reading") || (earlier.type === "at-reading" && later.type === "at-reading" && earlier.ended === "going" && !later.afterMissedAt)

/** The place a run from one reading reaches towards another, each reading joined to the next: the other's, or the last before a line that does not join. */
const stretched = (steps: readonly Step[], at: number, reached: number): number => {
  if (at === reached) return at
  const toward = reached > at ? 1 : -1
  const next = neighbourOf(steps, at, toward)
  if (next === undefined || (next - reached) * toward > 0) return at
  const earlier = steps[Math.min(at, next)]
  const later = steps[Math.max(at, next)]
  return earlier !== undefined && later !== undefined && joins(earlier, later) ? stretched(steps, next, reached) : at
}

/**
 * The run of readings that may be made one, from the reading at `anchor`
 * towards the one at `reached`, as far as each joins the next. A reading
 * alone, where nothing may be made one with it.
 */
export const mergeableSpan = (ordered: readonly Checkpoint[], anchor: number, reached: number): Span => {
  const end = stretched(stepsOf(ordered), anchor, reached)
  return { from: Math.min(anchor, end), to: Math.max(anchor, end) }
}

/**
 * The log with a run of its readings made one line: the last of them,
 * which says of the counter and the outlay all the ones before it did.
 * What was tapped between them stays, and so does every figure the play
 * comes to; only the readings between are gone. A span that may not be
 * made one whole is made one as far as it may be (`mergeableSpan`), from
 * its first reading.
 */
export const withStepsMerged = (ordered: readonly Checkpoint[], span: Span): Result<readonly Checkpoint[], RevisionRefusal> => {
  const { from, to } = mergeableSpan(ordered, span.from, span.to)
  return revised(ordered, (steps) => steps.filter((step, at) => at < from || at >= to || step.type === "kept"))
}
