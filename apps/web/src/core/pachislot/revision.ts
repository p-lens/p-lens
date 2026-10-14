import type { Checkpoint } from "../play-log/checkpoint"
import { checkpointsForReading, type ReadingRefusal } from "../play-log/live"
import { Err, Ok, type Result } from "../result/result"
import { czMissedAt } from "./path"
import { checkpointForReading, type CounterInput, type CounterRefusal } from "./reading"

/** How the games an AT machine's reading closes ended: with nothing, a CZ missed, or an AT won. */
export type Ended = "going" | "cz-missed" | "at"

/** An AT machine's counter as it was read: the games since the last AT, and the outlay and the medals drawn from savings so far, each where it was given. */
export interface AtInput {
  readonly sinceAt: number
  readonly outlay: number | undefined
  readonly replay: number | undefined
  readonly at: string
}

/**
 * One thing a pachislot play's log was made of, read back out of it: what
 * was typed or tapped, not the games it came to.
 *
 * - `reading`: a bonus machine's counter — the day's games, its bonuses, the outlay, the medals drawn from savings.
 * - `at-reading`: an AT machine's counter, with how its games ended; `afterMissedAt`
 *   says an AT nobody wrote down was admitted before it.
 * - `kept`: anything else — counting begun, a tap on a tile, an AT's result — which
 *   says nothing of the counter and stands on whatever games the log has reached.
 */
export type Step =
  | { readonly type: "reading"; readonly input: CounterInput }
  | { readonly type: "at-reading"; readonly input: AtInput; readonly ended: Ended; readonly afterMissedAt: boolean }
  | { readonly type: "kept"; readonly line: Checkpoint }

/** Why a play's steps, changed, do not make a log: the one at `index` cannot follow those before it. */
export type RevisionRefusal = (CounterRefusal | ReadingRefusal) & { readonly index: number }

const isMissedAt = (checkpoint: Checkpoint): boolean => checkpoint.event?.kind === "jackpot" && checkpoint.event.approximate === true

const endedOf = (checkpoint: Checkpoint): Ended => (checkpoint.event?.kind === "jackpot" ? "at" : checkpoint.event?.kind === "cz-missed" ? "cz-missed" : "going")

const stepOf = (checkpoint: Checkpoint, afterMissedAt: boolean): Step => {
  const counter = checkpoint.counter
  const at = checkpoint.at ?? ""
  if (counter?.total !== undefined) return { type: "reading", input: { total: counter.total, bonuses: counter.bonuses ?? {}, outlay: checkpoint.outlay, replay: checkpoint.replay, at } }
  if (counter?.spins !== undefined) return { type: "at-reading", input: { sinceAt: counter.spins, outlay: checkpoint.outlay, replay: checkpoint.replay, at }, ended: endedOf(checkpoint), afterMissedAt }
  return { type: "kept", line: checkpoint }
}

/**
 * The steps a play's log was made of, in order, after its first line — the
 * seat as it was found, which is no step. An AT found missing is no step of
 * its own: it belongs to the reading it was admitted with.
 */
export const stepsOf = (ordered: readonly Checkpoint[]): readonly Step[] =>
  ordered.slice(1).reduce<{ readonly steps: readonly Step[]; readonly missed: boolean }>(
    (walked, checkpoint) => (isMissedAt(checkpoint) ? { ...walked, missed: true } : { steps: [...walked.steps, stepOf(checkpoint, walked.missed)], missed: false }),
    { steps: [], missed: false },
  ).steps

/**
 * Which step the log's line at `line` is, where it is a reading that can
 * be set right: not the seat, not an AT found missing, and nothing that
 * says nothing of the counter.
 */
export const revisableStepAt = (ordered: readonly Checkpoint[], line: number): number | undefined => {
  const checkpoint = ordered[line]
  if (line < 1 || checkpoint === undefined || isMissedAt(checkpoint) || stepOf(checkpoint, false).type === "kept") return undefined
  return ordered.slice(1, line).filter((before) => !isMissedAt(before)).length
}

/** An AT's result with no AT before it to be the result of: the AT it told of is gone from the log, and it goes with it. */
const isOrphaned = (log: readonly Checkpoint[], line: Checkpoint): boolean => line.event?.kind === "at-ended" && log.at(-1)?.event?.kind !== "jackpot"

/** The lines one step adds to a log as it stands, or why it cannot follow it. */
const linesOf = (log: readonly Checkpoint[], step: Step): Result<readonly Checkpoint[], CounterRefusal | ReadingRefusal> => {
  switch (step.type) {
    case "reading": {
      const made = checkpointForReading(log, step.input)
      return made.ok ? Ok([made.value]) : made
    }
    case "at-reading": {
      const made = checkpointsForReading(log, { counterSpins: step.input.sinceAt, outlay: step.input.outlay, replay: step.input.replay, counterJackpots: undefined, at: step.input.at, jackpot: step.ended === "at" }, step.afterMissedAt)
      if (!made.ok) return made
      return Ok(step.ended === "cz-missed" ? czMissedAt(made.value) : made.value)
    }
    case "kept":
      return Ok(isOrphaned(log, step.line) ? [] : [{ ...step.line, spins: log.at(-1)?.spins ?? 0 }])
  }
}

/** A log made again from its first line and its steps, each added as it was when taken. */
const madeFrom = (seat: Checkpoint, steps: readonly Step[]): Result<readonly Checkpoint[], RevisionRefusal> =>
  steps.reduce<Result<readonly Checkpoint[], RevisionRefusal>>(
    (made, step, index) => {
      if (!made.ok) return made
      const added = linesOf(made.value, step)
      return added.ok ? Ok([...made.value, ...added.value]) : Err({ ...added.error, index })
    },
    Ok([seat]),
  )

/** A play's log with its steps changed, made again from the seat on, so every line after the change follows from it. Refused where the change leaves a step unable to follow. */
export const revised = (ordered: readonly Checkpoint[], change: (steps: readonly Step[]) => readonly Step[]): Result<readonly Checkpoint[], RevisionRefusal> => {
  const seat = ordered.at(0)
  return seat === undefined ? Ok(ordered) : madeFrom(seat, change(stepsOf(ordered)))
}

/**
 * The log with the step at `index` taken as given instead, made again from
 * the seat on so that every line after it follows from it. Refused where
 * the change leaves a later step unable to follow.
 */
export const withStepRevised = (ordered: readonly Checkpoint[], index: number, step: Step): Result<readonly Checkpoint[], RevisionRefusal> =>
  revised(ordered, (steps) => steps.map((each, at) => (at === index ? step : each)))

/** The log without the step at `index`: one taken by mistake. */
export const withStepRemoved = (ordered: readonly Checkpoint[], index: number): Result<readonly Checkpoint[], RevisionRefusal> => revised(ordered, (steps) => steps.filter((_, at) => at !== index))
