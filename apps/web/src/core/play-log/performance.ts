import { Err, Ok, type Result } from "../result/result"
import type { Checkpoint, PlayLogError } from "./checkpoint"

/** A log read in play order: by spins, ties kept in the order written. */
export const inPlayOrder = (checkpoints: readonly Checkpoint[]): readonly Checkpoint[] =>
  checkpoints
    .map((checkpoint, written) => ({ checkpoint, written }))
    .toSorted((left, right) => left.checkpoint.spins - right.checkpoint.spins || left.written - right.written)
    .map(({ checkpoint }) => checkpoint)

type WithOutlay = Checkpoint & { readonly outlay: number }

const withOutlay = (checkpoints: readonly Checkpoint[]): readonly WithOutlay[] =>
  checkpoints.filter((checkpoint): checkpoint is WithOutlay => checkpoint.outlay !== undefined)

/** Each item with the one after it. */
const neighbours = <T>(items: readonly T[]): readonly (readonly [T, T])[] =>
  items.flatMap((item, index) => {
    const next = items[index + 1]
    return next === undefined ? [] : [[item, next] as const]
  })

/**
 * A log in play order whose spending never goes backwards, or the first line
 * where it does.
 *
 * Not corrected here: a line that disagrees with its neighbours is reported
 * where it is, and what to do about it is the person's to decide.
 */
export const checkedPlayOrder = (checkpoints: readonly Checkpoint[]): Result<readonly Checkpoint[], PlayLogError> => {
  const ordered = inPlayOrder(checkpoints)
  const backwards = neighbours(withOutlay(ordered)).find(([from, to]) => to.outlay < from.outlay)
  return backwards === undefined ? Ok(ordered) : Err({ type: "non-monotonic", field: "outlay", spins: backwards[1].spins })
}

/** How many spins one stretch of play bought for each ¥1,000. */
export interface StretchPerformance {
  readonly fromSpins: number
  readonly toSpins: number
  readonly spinPerformance: number
}

/**
 * Spin performance between any two points of a play: how many spins the money
 * spent between them bought for each ¥1,000. Undefined when either point does
 * not say how much had been spent, or nothing was spent between them.
 */
export const performanceAcross = (from: Checkpoint, to: Checkpoint): StretchPerformance | undefined =>
  from.outlay !== undefined && to.outlay !== undefined && to.outlay > from.outlay
    ? { fromSpins: from.spins, toSpins: to.spins, spinPerformance: ((to.spins - from.spins) * 1000) / (to.outlay - from.outlay) }
    : undefined

/**
 * Spin performance for each stretch between checkpoints that both say how much
 * had been spent. A stretch with no spending in it has no rate and is left out.
 */
export const stretchPerformances = (ordered: readonly Checkpoint[]): readonly StretchPerformance[] =>
  neighbours(withOutlay(ordered))
    .map(([from, to]) => performanceAcross(from, to))
    .filter((stretch): stretch is StretchPerformance => stretch !== undefined)
