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
 * played — but not a jackpot's line: the jackpot may have come a few
 * spins into what was bought there, and what was left of it is in hand
 * with what the bonus paid, so that line does not know the hand until it
 * is counted. A line where the balls in hand were counted says so itself;
 * any other line does not know what is in hand. A line made of readings folded
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
        held: checkpoint.held ?? (bought && checkpoint.event?.kind !== "jackpot" ? 0 : undefined),
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

/** The spin performance between two points the hand was known at; none where no regular game, or no ball, came between. */
const stretchBetween = (from: Known, to: Known, terms: PlayTerms): number | undefined => {
  const spins = to.regularSpins - from.regularSpins
  const balls = playedOf(to) - playedOf(from)
  return spins > 0 && balls > 0 ? spinPerformanceOf({ spins, balls, rentedBalls: 0, replayedBalls: 0 }, terms) : undefined
}

/** Whether a line is a jackpot won in regular games whose bonus the log says. */
const isToldRegularJackpot = (checkpoint: Checkpoint | undefined): boolean => checkpoint?.phase === "regular" && checkpoint.event?.kind === "jackpot" && checkpoint.event.bonus !== undefined

/** A line's own stretch's spin performance: measured, or awaited — a jackpot's line whose stretch closes only once the hand is known after the bonus. */
export type StretchRate = { readonly type: "measured"; readonly rate: number } | { readonly type: "awaited" }

const measuredRate = (rate: number | undefined): StretchRate | undefined => (rate === undefined ? undefined : { type: "measured", rate })

/** Where the walk for each line's stretch stands: the rates so far, the last point the hand was known at, and a jackpot's line waiting on the hand to be known after it, with the point its stretch runs from. */
interface Stretching {
  readonly rates: readonly (StretchRate | undefined)[]
  readonly last: Known | undefined
  readonly waiting: { readonly line: number; readonly from: Known } | undefined
}

/** The rates with the waiting line's set as given. */
const settled = (rates: readonly (StretchRate | undefined)[], line: number, rate: StretchRate | undefined): readonly (StretchRate | undefined)[] => rates.map((each, at) => (at === line ? rate : each))

/**
 * The spin performance of each line's own stretch, by its place in the
 * log: from the last point the hand was known at before the line to the
 * line, where the line knows the hand and was played in regular games. A
 * line made of readings folded together is one stretch, from before the
 * first of them, as if they had been read as one. A jackpot won in
 * regular games knows no hand until it is counted after the bonus
 * (`standingsOf`), so its stretch is awaited until the first point the
 * hand is known after it, whatever state that is in, and then the
 * jackpot's line's: what the bonus paid taken off, what is left is the
 * balls the regular games before it cost; a line after it runs from that
 * point. None for any other line — the seat, the finish, a 時短 or 確変
 * line — nor across a jackpot whose bonus the log does not say: what it
 * paid is unknown, so the balls played over it are.
 */
export const stretchPerformancesOf = (ordered: readonly Checkpoint[], terms: PlayTerms): readonly (StretchRate | undefined)[] =>
  standingsOf(ordered, terms).reduce<Stretching>(
    (walked, { standing, hands }, index) => {
      const line = ordered[index]
      const waiting = walked.waiting
      if (line !== undefined && isUntold(line)) return { rates: [...(waiting === undefined ? walked.rates : settled(walked.rates, waiting.line, undefined)), undefined], last: isKnown(standing) ? standing : undefined, waiting: undefined }
      const first = hands.at(0) ?? (isKnown(standing) ? standing : undefined)
      const closing = waiting !== undefined && first !== undefined
      const rates = closing ? settled(walked.rates, waiting.line, measuredRate(stretchBetween(waiting.from, first, terms))) : walked.rates
      const from = closing ? (first === standing ? undefined : first) : (walked.last ?? hands.at(0))
      const rate = from === undefined || !isKnown(standing) || line?.phase !== "regular" ? undefined : measuredRate(stretchBetween(from, standing, terms))
      const last = isKnown(standing) ? standing : (hands.at(-1) ?? walked.last)
      const opens = !closing && waiting === undefined && isToldRegularJackpot(line) && !isKnown(standing) && from !== undefined
      const next = opens ? { line: index, from } : closing ? undefined : waiting
      return { rates: [...rates, opens ? { type: "awaited" as const } : rate], last, waiting: next }
    },
    { rates: [], last: { ...START, held: 0 }, waiting: undefined },
  ).rates

/** Regular games the hand may be played that long without a count before a person is asked to count it again. */
export const RECOUNT_AFTER = 75

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
 * into the hand. None where the hand was never counted, or where it is
 * told to be empty: a hand played down to nothing and said so has nothing
 * left to count, whatever is played on after.
 */
export const handDriftOf = (ordered: readonly Checkpoint[], terms: PlayTerms, told: number | undefined): HandDrift | undefined => {
  const counted = lastCountOf(ordered)
  const last = totalsOf(ordered).at(-1)
  if (counted === undefined || last === undefined || told === 0) return undefined
  const spins = regularSpinsAfter(ordered, counted.spins)
  const measured = consumptionOf(ordered, terms).measured
  const bought = rentedBallsOf(last.outlay - counted.outlay, terms) + last.replay - counted.replay
  return { spins, estimate: told === undefined || measured === undefined ? undefined : Math.max(0, Math.round(told + bought - (spins * measured.balls) / measured.spins)) }
}
