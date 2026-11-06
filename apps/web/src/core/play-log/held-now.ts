import type { Checkpoint } from "./checkpoint"

/** A running total as the log last gave it at or before a line, none where it never did. */
const runningAt = (ordered: readonly Checkpoint[], line: number, read: (checkpoint: Checkpoint) => number | undefined): number =>
  ordered
    .slice(0, line + 1)
    .map(read)
    .findLast((value) => value !== undefined) ?? 0

/**
 * The tokens in hand now as the person told them: the last count — or what
 * the play was begun with — with what other players handed in or were
 * handed since, a count being the hand as the cabinet shows it and so
 * holding what was handed before it. Worked out afresh from the log, so a
 * handing set right carries through every line after it. None where
 * nothing was counted or handed.
 */
export const heldNowOf = (ordered: readonly Checkpoint[]): number | undefined => {
  const line = ordered.findLastIndex((checkpoint) => checkpoint.held !== undefined)
  const handedSince = runningAt(ordered, ordered.length - 1, (checkpoint) => checkpoint.handed) - (line < 0 ? 0 : runningAt(ordered, line, (checkpoint) => checkpoint.handed))
  const counted = ordered[line]?.held
  return counted === undefined && handedSince === 0 ? undefined : (counted ?? 0) + handedSince
}

/**
 * Whether a reading hands away more tokens than the log holds in hand
 * before it, with no count of its own: the hand would fall below nothing,
 * which no cabinet shows. A count is the hand as the cabinet shows it, so a
 * reading that counted never does.
 */
export const handsBeyondHand = (ordered: readonly Checkpoint[], reading: { readonly handed?: number; readonly held?: number }): boolean =>
  reading.handed !== undefined && reading.handed < 0 && reading.held === undefined && (heldNowOf(ordered) ?? 0) + reading.handed < 0
