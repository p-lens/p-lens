import type { Checkpoint } from "./checkpoint"

/**
 * The tokens a play was begun with in hand, brought from the play before:
 * what its first line counted, where it counted any. Only the first line
 * says so — it is written as the play starts, before a spin or a yen — and
 * a count on any later line is of the play's own tokens.
 */
export const carriedInOf = (ordered: readonly Checkpoint[]): number | undefined => {
  const first = ordered.at(0)
  return first === undefined || first.spins !== 0 || first.held === undefined || first.held === 0 ? undefined : first.held
}

/**
 * A log with the tokens its play was begun with set right: its first line
 * counting so many in hand, or none. Every later line stands as it is —
 * what it counts in hand is the play's own.
 */
export const withCarriedIn = (ordered: readonly Checkpoint[], carriedIn: number | undefined): readonly Checkpoint[] => {
  const [first, ...rest] = ordered
  if (first === undefined) return ordered
  const { held: _held, ...seat } = first
  return [carriedIn === undefined || carriedIn === 0 ? seat : { ...seat, held: carriedIn }, ...rest]
}
