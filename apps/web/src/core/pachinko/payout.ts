import type { BonusWon, Checkpoint } from "../play-log/checkpoint"

/** What a bonus its machine lists adds to the hand: what it pays less what winning it took. */
const toldOf = (bonus: BonusWon): number => bonus.payout - bonus.spent

/** What a bonus added to the hand as the person says it did: what its machine lists, and what they say it paid beyond that (`over`). */
export const gainOf = (bonus: BonusWon): number => toldOf(bonus) + (bonus.over ?? 0)

/**
 * A bonus whose balls were counted as it ended: what its machine says it
 * adds to the hand, what the person said it did, and what it did. They
 * part by an over-entry — more balls into the attacker than its rounds
 * count, a cabinet the parlor left generous or a hand that knows it — or
 * by balls lost to a slack one.
 */
export interface CountedPayout {
  /** The line the balls were counted at, by its place in the log in play order. */
  readonly line: number
  readonly told: number
  readonly said: number
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
 * anything else. What it paid is the count after less the count before,
 * whatever was said of it. It is not asked for: a person who counts there
 * is one who wants it known, and the rest never meet it.
 */
export const countedPayoutsOf = (ordered: readonly Checkpoint[]): readonly CountedPayout[] =>
  ordered.flatMap((checkpoint, line) => {
    const jackpot = ordered[line - 1]
    const bonus = jackpot?.event?.kind === "jackpot" ? jackpot.event.bonus : undefined
    if (jackpot === undefined || bonus === undefined || jackpot.held === undefined || checkpoint.held === undefined || !onlyCounted(checkpoint, ordered.slice(0, line), jackpot.spins)) return []
    return [{ line, told: toldOf(bonus), said: gainOf(bonus), paid: checkpoint.held - jackpot.held }]
  })

/** What the counted bonuses paid beyond what was said of them, by the line each was counted at: below nought where they paid less. What came to hand there beyond the bonus's gain as said. */
export const payoutDifferencesOf = (ordered: readonly Checkpoint[]): ReadonlyMap<number, number> => new Map(countedPayoutsOf(ordered).map((counted) => [counted.line, counted.paid - counted.said]))

/** What the counted bonuses paid beyond what their machine lists, by the line each was counted at: the 過出玉 the line shows. */
export const overPaidOf = (ordered: readonly Checkpoint[]): ReadonlyMap<number, number> => new Map(countedPayoutsOf(ordered).map((counted) => [counted.line, counted.paid - counted.told]))

const ratioOf = (paid: number, told: number): number | undefined => (told > 0 && paid > 0 ? paid / told : undefined)

/**
 * How much more a play's bonuses paid than their machine lists, as a
 * ratio — 1.07 for seven in a hundred more: what the bonuses counted as
 * they ended paid, where any was; else what was said of the bonuses won,
 * where anything was said of any; none otherwise, or where those it is
 * worked from were listed to add nothing or came to nothing. Rounds pay
 * in proportion to their count, so the ratio stands for every bonus.
 */
export const payoutRatioOf = (ordered: readonly Checkpoint[]): number | undefined => {
  const counted = countedPayoutsOf(ordered)
  if (counted.length > 0) return ratioOf(counted.reduce((sum, each) => sum + each.paid, 0), counted.reduce((sum, each) => sum + each.told, 0))
  const told = ordered.flatMap((checkpoint) => (checkpoint.event?.kind === "jackpot" && checkpoint.event.bonus !== undefined ? [checkpoint.event.bonus] : []))
  return told.some((bonus) => bonus.over !== undefined) ? ratioOf(told.reduce((sum, bonus) => sum + gainOf(bonus), 0), told.reduce((sum, bonus) => sum + toldOf(bonus), 0)) : undefined
}
