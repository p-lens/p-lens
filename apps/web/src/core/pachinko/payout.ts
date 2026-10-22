import type { Checkpoint } from "../play-log/checkpoint"

/**
 * A bonus whose balls were counted as it ended: what its machine says it
 * adds to the hand, and what it did. The two part by an over-entry — more
 * balls into the attacker than its rounds count, a cabinet the parlor
 * left generous or a hand that knows it — or by balls lost to a slack
 * one.
 */
export interface CountedPayout {
  /** The line the balls were counted at, by its place in the log in play order. */
  readonly line: number
  readonly told: number
  readonly paid: number
}

const lastKnown = (ordered: readonly Checkpoint[], read: (checkpoint: Checkpoint) => number | undefined): number =>
  ordered.map(read).findLast((value): value is number => value !== undefined) ?? 0

/** Whether a line only counted the balls in hand where the line before left off: no spin, nothing bought, drawn or drifted, nothing happening. */
const onlyCounted = (checkpoint: Checkpoint, before: readonly Checkpoint[], spins: number): boolean =>
  checkpoint.spins === spins &&
  checkpoint.held !== undefined &&
  checkpoint.event === undefined &&
  checkpoint.handsBefore === undefined &&
  (checkpoint.outlay ?? lastKnown(before, (each) => each.outlay)) === lastKnown(before, (each) => each.outlay) &&
  (checkpoint.replay ?? lastKnown(before, (each) => each.replay)) === lastKnown(before, (each) => each.replay) &&
  (checkpoint.support ?? lastKnown(before, (each) => each.support)) === lastKnown(before, (each) => each.support)

/**
 * The bonuses a play counted the balls of as they ended: each jackpot
 * whose bonus the log says, counted as it came, followed at once by a line
 * that only counted the balls in hand again — the bonus over, before
 * anything else. What it paid is the count after less the count before.
 * It is not asked for: a person who counts there is one who wants it
 * known, and the rest never meet it.
 */
export const countedPayoutsOf = (ordered: readonly Checkpoint[]): readonly CountedPayout[] =>
  ordered.flatMap((checkpoint, line) => {
    const jackpot = ordered[line - 1]
    const bonus = jackpot?.event?.kind === "jackpot" ? jackpot.event.bonus : undefined
    if (jackpot === undefined || bonus === undefined || jackpot.held === undefined || checkpoint.held === undefined || !onlyCounted(checkpoint, ordered.slice(0, line), jackpot.spins)) return []
    return [{ line, told: bonus.payout - bonus.spent, paid: checkpoint.held - jackpot.held }]
  })

/** What the counted bonuses paid beyond what they were told to, by the line each was counted at: below nought where they paid less. */
export const payoutDifferencesOf = (ordered: readonly Checkpoint[]): ReadonlyMap<number, number> => new Map(countedPayoutsOf(ordered).map((counted) => [counted.line, counted.paid - counted.told]))

/**
 * How much more the counted bonuses paid than they were told to, as a
 * ratio — 1.07 for seven in a hundred more — and none where no bonus was
 * counted, or those counted were told to add nothing or came to nothing. Rounds pay in
 * proportion to their count, so the ratio stands for every bonus, counted
 * or not.
 */
export const payoutRatioOf = (ordered: readonly Checkpoint[]): number | undefined => {
  const counted = countedPayoutsOf(ordered)
  const told = counted.reduce((sum, each) => sum + each.told, 0)
  const paid = counted.reduce((sum, each) => sum + each.paid, 0)
  return told > 0 && paid > 0 ? paid / told : undefined
}
