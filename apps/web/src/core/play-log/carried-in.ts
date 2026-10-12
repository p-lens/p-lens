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
