import type { PlayTerms } from "../parlor/terms"
import type { Checkpoint } from "../play-log/checkpoint"

/**
 * What a play's regular games were measured to cost in balls: so many
 * regular spins for so many balls, with how many of those balls were
 * rented for cash and how many drawn from savings — the rest were the
 * player's own, won in the play.
 */
export interface Measured {
  readonly spins: number
  readonly balls: number
  readonly rentedBalls: number
  readonly replayedBalls: number
}

/** Where a play's regular games stand: how many there were, and what they were measured to cost, once there is a stretch to measure. */
export interface Consumption {
  readonly regularSpins: number
  readonly measured: Measured | undefined
}

/** A play at one line: its running totals, and what the line says of the balls in hand. */
interface Standing {
  readonly regularSpins: number
  readonly rentedBalls: number
  readonly replayedBalls: number
  /** Every ball that came to hand: rented, drawn, won in bonuses, gained or lost on the 電サポ. */
  readonly gained: number
  /** The balls in hand, where the line knows: counted, or none because more had to be bought. */
  readonly held: number | undefined
}

const START: Standing = { regularSpins: 0, rentedBalls: 0, replayedBalls: 0, gained: 0, held: 0 }

const rentedBallsOf = (outlay: number, terms: PlayTerms): number => (outlay * terms.rental.tokens) / terms.rental.yen

const isRegular = (checkpoint: Checkpoint): boolean => checkpoint.phase === undefined || checkpoint.phase === "regular"

const bonusGainOf = (checkpoint: Checkpoint): number =>
  checkpoint.event?.kind === "jackpot" && checkpoint.event.bonus !== undefined ? checkpoint.event.bonus.payout - checkpoint.event.bonus.spent : 0

/** A jackpot whose bonus the log does not say: what it paid is unknown, so the balls cannot be followed past it. */
const isUntold = (checkpoint: Checkpoint): boolean => checkpoint.event?.kind === "jackpot" && checkpoint.event.bonus === undefined

/** A line's standing, and those of the hands known inside it before it, oldest first. */
interface Stood {
  readonly standing: Standing
  readonly hands: readonly Known[]
}

/**
 * The standing at each line. A line where balls were rented or drawn is
 * one where the hand had run out, so all that came to hand by then was
 * played — but for what a bonus won at that very line, which is in hand;
 * a line where the balls in hand were counted says so itself; any other
 * line does not know what is in hand. A line made of readings folded
 * together says, besides, where the hand was known inside it
 * (`handsBefore`), each a standing of its own before the line's; what was
 * bought by the last of them was bought there, not at the line.
 */
const standingsOf = (ordered: readonly Checkpoint[], terms: PlayTerms): readonly Stood[] =>
  ordered.reduce<{ readonly stood: readonly Stood[]; readonly before: Standing; readonly spins: number; readonly bonuses: number }>(
    (walked, checkpoint) => {
      const rentedBalls = checkpoint.outlay === undefined ? walked.before.rentedBalls : rentedBallsOf(checkpoint.outlay, terms)
      const replayedBalls = checkpoint.replay ?? walked.before.replayedBalls
      const bonuses = walked.bonuses + bonusGainOf(checkpoint)
      const regularSince = (spins: number): number => walked.before.regularSpins + (isRegular(checkpoint) ? spins - walked.spins : 0)
      const hands = (checkpoint.handsBefore ?? []).map(
        (hand): Known => ({
          regularSpins: regularSince(hand.spins),
          rentedBalls: rentedBallsOf(hand.outlay, terms),
          replayedBalls: hand.replay,
          gained: rentedBallsOf(hand.outlay, terms) + hand.replay + walked.bonuses + hand.support,
          held: hand.held,
        }),
      )
      const latest = hands.at(-1) ?? walked.before
      const bought = rentedBalls > latest.rentedBalls || replayedBalls > latest.replayedBalls
      const standing: Standing = {
        regularSpins: regularSince(checkpoint.spins),
        rentedBalls,
        replayedBalls,
        gained: rentedBalls + replayedBalls + bonuses + (checkpoint.support ?? 0),
        held: checkpoint.held ?? (bought ? Math.max(0, bonusGainOf(checkpoint)) : undefined),
      }
      return { stood: [...walked.stood, { standing, hands }], before: standing, spins: checkpoint.spins, bonuses }
    },
    { stood: [], before: START, spins: ordered.at(0)?.spins ?? 0, bonuses: 0 },
  ).stood

type Known = Standing & { readonly held: number }

const isKnown = (standing: Standing): standing is Known => standing.held !== undefined

const playedOf = (standing: Known): number => standing.gained - standing.held

/** A play walked through: where it stands at its last line, and the two points its regular games are measured between. */
interface Walked {
  readonly last: Standing | undefined
  readonly from: Known
  readonly to: Known
  /** Whether the last line is past a jackpot whose bonus the log does not say. */
  readonly pastUntold: boolean
}

/**
 * Every point the hand was known at, in play order, up to a jackpot whose
 * bonus the log does not say: the start, each line that knew, and the
 * hands known inside folded lines — those inside the untold jackpot's own
 * line too, which came before it.
 */
const knownOf = (stood: readonly Stood[], untold: number): readonly Known[] => [
  { ...START, held: 0 },
  ...(untold === -1 ? stood : stood.slice(0, untold + 1)).flatMap((each, index) => [...each.hands, ...(index !== untold && isKnown(each.standing) ? [each.standing] : [])]),
]

const walkedOf = (ordered: readonly Checkpoint[], terms: PlayTerms): Walked => {
  const untold = ordered.findIndex(isUntold)
  const stood = standingsOf(ordered, terms)
  const known = knownOf(stood, untold)
  const from = known.findLast((standing) => standing.regularSpins === 0) ?? { ...START, held: 0 }
  return { last: stood.at(-1)?.standing, from, to: known.at(-1) ?? from, pastUntold: untold !== -1 }
}

const measuredOf = (walked: Walked): Measured | undefined => {
  const spins = walked.to.regularSpins - walked.from.regularSpins
  const balls = playedOf(walked.to) - playedOf(walked.from)
  return spins > 0 && balls > 0
    ? { spins, balls, rentedBalls: walked.to.rentedBalls - walked.from.rentedBalls, replayedBalls: walked.to.replayedBalls - walked.from.replayedBalls }
    : undefined
}

/**
 * A play's regular games and what they were measured to cost, by its log
 * in play order and its corner's terms. Measured between the play's start
 * — or the last line before any regular game was played, where the first
 * balls were bought — and the last line that knows what is in hand, over
 * the regular games between them: 確変 and 時短 are not bought with balls,
 * and what they gain or lose is the 電サポ's. Nothing is measured past a
 * jackpot whose bonus the log does not say.
 */
export const consumptionOf = (ordered: readonly Checkpoint[], terms: PlayTerms): Consumption => {
  const walked = walkedOf(ordered, terms)
  return { regularSpins: walked.last?.regularSpins ?? 0, measured: measuredOf(walked) }
}

/** The spin performance a measurement comes to: regular spins for the balls ¥1,000 rents, the player's own balls counted as rented ones are. */
export const spinPerformanceOf = (measured: Measured, terms: PlayTerms): number => (measured.spins / measured.balls) * ((terms.rental.tokens * 1000) / terms.rental.yen)

/** The spin performance a play's log measured, as its live screen shows it: none until there is a stretch to measure. */
export const measuredSpinPerformance = (ordered: readonly Checkpoint[], terms: PlayTerms): number | undefined =>
  ((measured) => (measured === undefined ? undefined : spinPerformanceOf(measured, terms)))(consumptionOf(ordered, terms).measured)

/** Regular games the hand may be played that long without a count before a person is asked to count it again. */
export const RECOUNT_AFTER = 50

/** How far a play has gone since its hand was last counted: the regular games since, and what the hand is likely to hold now — none where nothing has been measured to cost. */
export interface HandDrift {
  readonly spins: number
  readonly estimate: number | undefined
}

/** A point where the balls in hand were counted: so many spins into the play, at the running totals there. */
interface Counted {
  readonly spins: number
  readonly outlay: number
  readonly replay: number
}

/** The running totals each line leaves, a line that says nothing of one keeping it as it was. */
const totalsOf = (ordered: readonly Checkpoint[]): readonly { readonly outlay: number; readonly replay: number }[] =>
  ordered.reduce<readonly { readonly outlay: number; readonly replay: number }[]>(
    (totals, checkpoint) => [...totals, { outlay: checkpoint.outlay ?? totals.at(-1)?.outlay ?? 0, replay: checkpoint.replay ?? totals.at(-1)?.replay ?? 0 }],
    [],
  )

/** The last point the balls in hand were counted at: a line's count, or one folded into it, or the seat's. */
const lastCountOf = (ordered: readonly Checkpoint[]): Counted | undefined => {
  const totals = totalsOf(ordered)
  return ordered
    .flatMap((checkpoint, index) => [
      ...(checkpoint.handsBefore ?? []).filter((hand) => hand.counted === true).map((hand) => ({ spins: hand.spins, outlay: hand.outlay, replay: hand.replay })),
      ...(checkpoint.held === undefined ? [] : [{ spins: checkpoint.spins, outlay: totals[index]?.outlay ?? 0, replay: totals[index]?.replay ?? 0 }]),
    ])
    .at(-1)
}

/** Regular games played after a point so many spins into the play. */
const regularSpinsAfter = (ordered: readonly Checkpoint[], spins: number): number =>
  ordered.reduce((sum, checkpoint, index) => {
    const from = Math.max(spins, ordered[index - 1]?.spins ?? 0)
    return isRegular(checkpoint) && checkpoint.spins > from ? sum + checkpoint.spins - from : sum
  }, 0)

/**
 * How far a play has gone since its hand was last counted, for asking a
 * person to count it again: the regular games since, and the hand likely
 * now — as told, with what was bought since, less those games at the cost
 * the play was measured at. An estimate to be shown, never one written
 * into the hand. None where the hand was never counted.
 */
export const handDriftOf = (ordered: readonly Checkpoint[], terms: PlayTerms, told: number | undefined): HandDrift | undefined => {
  const counted = lastCountOf(ordered)
  const last = totalsOf(ordered).at(-1)
  if (counted === undefined || last === undefined) return undefined
  const spins = regularSpinsAfter(ordered, counted.spins)
  const measured = consumptionOf(ordered, terms).measured
  const bought = rentedBallsOf(last.outlay - counted.outlay, terms) + last.replay - counted.replay
  return { spins, estimate: told === undefined || measured === undefined ? undefined : Math.max(0, Math.round(told + bought - (spins * measured.balls) / measured.spins)) }
}
