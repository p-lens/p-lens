import type { PlayTerms } from "../parlor/terms"
import type { Checkpoint } from "../play-log/checkpoint"
import { gainOf, payoutDifferencesOf, payoutRatioOf } from "./payout"
import type { FormulaSnapshot } from "./snapshot"

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

/**
 * Where a play's regular games stand: how many there were, what they were
 * measured to cost, once there is a stretch to measure, and how much more
 * its bonuses paid than they were told to, where any was counted as it
 * ended (`payoutRatioOf`).
 */
export interface Consumption {
  readonly regularSpins: number
  /**
   * Spins taken to have been played at the heso besides the regular games:
   * the formula's spins a combo plays there on average, after each jackpot
   * won in regular games, where no 電サポ drift was counted — a CZ a person
   * writes as a 時短. No regular game's, but paid for as one is.
   */
  readonly hesoSpins: number
  readonly measured: Measured | undefined
  readonly payoutRatio: number | undefined
  /**
   * What the play's bonuses came to with the 電サポ's drift the person
   * counted, over what the formula looks for them to come to — its
   * 電サポ中の出玉増減 on those won on the 電サポ: a round pays as much more,
   * or less. None where no drift was counted, the formula's own then
   * standing; one where it came as the formula said.
   */
  readonly supportRatio: number | undefined
}

/** A play at one line: its running totals, and what the line says of the balls in hand. */
interface Standing {
  readonly regularSpins: number
  /** Spins taken to have been played at the heso besides the regular games, so far. */
  readonly hesoSpins: number
  readonly rentedBalls: number
  readonly replayedBalls: number
  /** Every ball that came to hand: rented, drawn, won in bonuses, gained or lost on the 電サポ. */
  readonly gained: number
  /** The balls in hand, where the line knows: counted, or none because more had to be bought. */
  readonly held: number | undefined
  /** Spins played so far on a 電サポ whose drift the person did not count (`unsaidSupportOf`): two points with such a 確変 or 時短 played between them differ in it, and a 電サポ that ended where it began — a bonus with none after it, ended at nought spins — leaves it as it was. */
  readonly unsaidSupportSpins: number
}

const START: Standing = { regularSpins: 0, hesoSpins: 0, rentedBalls: 0, replayedBalls: 0, gained: 0, held: 0, unsaidSupportSpins: 0 }

/**
 * What a play's consumption takes of its formula: the 電サポ中の出玉増減 that
 * the drift a person counted is set against (`supportRatioOf`), and the
 * spins a combo plays at the heso on average after a jackpot won in
 * regular games — a CZ a person writes as a 時短 — counted as paid for,
 * never measured, where the person counted no 電サポ drift, which then
 * holds them already.
 */
export type PlayFormula = Pick<FormulaSnapshot, "supportGain" | "paidSpins">

const rentedBallsOf = (outlay: number, terms: PlayTerms): number => (outlay * terms.rental.tokens) / terms.rental.yen

/** Balls ¥1,000 rents at the corner: what a spin performance and a border are counted in. */
export const rentedForThousand = (terms: PlayTerms): number => rentedBallsOf(1000, terms)

const isRegular = (checkpoint: Checkpoint): boolean => checkpoint.phase === undefined || checkpoint.phase === "regular"

const bonusGainOf = (checkpoint: Checkpoint): number => (checkpoint.event?.kind === "jackpot" && checkpoint.event.bonus !== undefined ? gainOf(checkpoint.event.bonus) : 0)

/** Whether a jackpot's line was won on the 電サポ: in a 確変 or 時短, not in regular games. */
const wonOnSupport = (checkpoint: Checkpoint): boolean => checkpoint.event?.kind === "jackpot" && !isRegular(checkpoint)

/** A formula's 電サポ中の出玉増減, in basis points, as the factor a jackpot won on the 電サポ pays by: one where it has none. */
const supportFactorOf = (supportGain: number | undefined): number => 1 + (supportGain ?? 0) / 10_000

/** What a jackpot's bonus is looked for to bring to hand by its formula: what it paid, and — one won on the 電サポ — that changed by the formula's 電サポ中の出玉増減. */
const broughtOf = (checkpoint: Checkpoint, factor: number): number => bonusGainOf(checkpoint) * (wonOnSupport(checkpoint) ? factor : 1)

/** Whether a line says what the 電サポ drifted: one where the person counted it writes the running total of it, and no other does. */
const saysDrift = (checkpoint: Checkpoint): boolean => checkpoint.support !== undefined

/**
 * Whether each line was played on a 電サポ whose drift the person did not
 * count: a run of 確変 and 時短 lines, unbroken by regular games, none of
 * which says what it drifted. Each run is its own: one counted says nothing
 * of another, whose drift a running total carried past it would otherwise
 * be taken to be none.
 */
const unsaidSupportOf = (ordered: readonly Checkpoint[]): readonly boolean[] => {
  const marks = ordered.reduce<{ readonly marks: readonly { readonly run: number | undefined; readonly said: boolean }[]; readonly runs: number; readonly within: boolean }>(
    (walked, checkpoint) => {
      const on = !isRegular(checkpoint)
      const runs = on && !walked.within ? walked.runs + 1 : walked.runs
      return { marks: [...walked.marks, { run: on ? runs : undefined, said: saysDrift(checkpoint) }], runs, within: on }
    },
    { marks: [], runs: 0, within: false },
  ).marks
  const said = new Set(marks.flatMap((mark) => (mark.run !== undefined && mark.said ? [mark.run] : [])))
  return marks.map((mark) => mark.run !== undefined && !said.has(mark.run))
}

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
 * is counted. A line where the balls in hand were counted says so itself
 * — a jackpot's count being the hand as the jackpot came, before its bonus
 * paid, which is then in hand besides; any other line does not know what
 * is in hand. A line made of readings folded
 * together says, besides, where the hand was known inside it
 * (`handsBefore`), each a standing of its own before the line's; what was
 * bought by the last of them was bought there, not at the line. A bonus
 * paid what its machine lists and what the person said it paid beyond
 * that (`gainOf`); one counted as it ended (`payoutDifferencesOf`) paid
 * what was counted: what it paid beyond what was said came to hand at the
 * count, so an over-entry is never taken for regular games costing less.
 * What the 電サポ gained or lost is in the hand only as the person counted
 * it; where they did not, the hand after it holds it unknown, and the
 * measuring keeps away from it (`measurableAcross`). `atHeso` is the spins
 * taken to have been played at the heso after each jackpot won in
 * regular games, but one whose 電サポ after it was counted: the drift
 * counted holds the CZ's balls already.
 */
const standingsOf = (ordered: readonly Checkpoint[], terms: PlayTerms, atHeso: number): readonly Stood[] => {
  const differences = payoutDifferencesOf(ordered)
  const unsaid = unsaidSupportOf(ordered)
  const saidAfter = (line: number): boolean => ((next) => next !== undefined && !isRegular(next) && unsaid[line + 1] !== true)(ordered[line + 1])
  return ordered.reduce<{ readonly stood: readonly Stood[]; readonly before: Standing; readonly spins: number; readonly bonuses: number; readonly support: number }>(
    (walked, checkpoint, line) => {
      const rentedBalls = checkpoint.outlay === undefined ? walked.before.rentedBalls : rentedBallsOf(checkpoint.outlay, terms)
      const replayedBalls = checkpoint.replay ?? walked.before.replayedBalls
      const bonuses = walked.bonuses + bonusGainOf(checkpoint) + (differences.get(line) ?? 0)
      const unsaidSince = (spins: number): number => walked.before.unsaidSupportSpins + (unsaid[line] === true ? spins - walked.spins : 0)
      const paidAfter = isRegular(checkpoint) && checkpoint.event?.kind === "jackpot" && !saidAfter(line) ? atHeso : 0
      const regularSince = (spins: number): number => walked.before.regularSpins + (isRegular(checkpoint) ? spins - walked.spins : 0)
      const hands = (checkpoint.handsBefore ?? []).map(
        (hand): Known => ({
          regularSpins: regularSince(hand.spins),
          hesoSpins: walked.before.hesoSpins,
          rentedBalls: rentedBallsOf(hand.outlay, terms),
          replayedBalls: hand.replay,
          gained: rentedBallsOf(hand.outlay, terms) + hand.replay + walked.bonuses + hand.support,
          held: hand.held,
          unsaidSupportSpins: unsaidSince(hand.spins),
        }),
      )
      const latest = hands.at(-1) ?? walked.before
      const bought = rentedBalls > latest.rentedBalls || replayedBalls > latest.replayedBalls
      const standing: Standing = {
        regularSpins: regularSince(checkpoint.spins),
        hesoSpins: walked.before.hesoSpins + paidAfter,
        rentedBalls,
        replayedBalls,
        gained: rentedBalls + replayedBalls + bonuses + (checkpoint.support ?? walked.support),
        held: checkpoint.held === undefined ? (bought && checkpoint.event?.kind !== "jackpot" ? 0 : undefined) : checkpoint.held + Math.max(0, bonusGainOf(checkpoint)),
        unsaidSupportSpins: unsaidSince(checkpoint.spins),
      }
      return { stood: [...walked.stood, { standing, hands }], before: standing, spins: checkpoint.spins, bonuses, support: checkpoint.support ?? walked.support }
    },
    { stood: [], before: START, spins: ordered.at(0)?.spins ?? 0, bonuses: 0, support: 0 },
  ).stood
}

type Known = Standing & { readonly held: number }

const isKnown = (standing: Standing): standing is Known => standing.held !== undefined

const playedOf = (standing: Known): number => standing.gained - standing.held

/**
 * Whether the regular games between two points the hand was known at can
 * be measured by the balls they cost: not where spins were played between
 * them on a 確変 or 時短 whose drift the person did not count. The hand
 * after it holds that drift, which nothing can tell apart from what the
 * regular games cost; a formula's 電サポ中の出玉増減 is what the 電サポ is
 * looked for to do, never what it did, and moves the border alone.
 */
const measurableAcross = (from: Known, to: Known): boolean => from.unsaidSupportSpins === to.unsaidSupportSpins

/** A play walked through: where it stands at its last line, and the points its regular games are measured over, in play order. */
interface Walked {
  readonly last: Standing | undefined
  readonly points: readonly Known[]
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

const walkedOf = (ordered: readonly Checkpoint[], terms: PlayTerms, atHeso: number): Walked => {
  const untold = ordered.findIndex(isUntold)
  const stood = standingsOf(ordered, terms, atHeso)
  const known = knownOf(stood, untold)
  const from = Math.max(0, known.findLastIndex((standing) => standing.regularSpins === 0))
  return { last: stood.at(-1)?.standing, points: known.slice(from) }
}

/** Each point after the first with the point before it. */
const stepsOf = (points: readonly Known[]): readonly { readonly from: Known; readonly to: Known }[] =>
  points.reduce<{ readonly steps: readonly { readonly from: Known; readonly to: Known }[]; readonly before: Known | undefined }>(
    (walked, to) => ({ steps: walked.before === undefined ? walked.steps : [...walked.steps, { from: walked.before, to }], before: to }),
    { steps: [], before: undefined },
  ).steps

const NOTHING_MEASURED: Measured = { spins: 0, balls: 0, rentedBalls: 0, replayedBalls: 0 }

/** The regular games from one point the hand was known at to the next, and what they cost. */
const stepMeasured = (from: Known, to: Known): Measured => ({
  spins: to.regularSpins - from.regularSpins,
  balls: playedOf(to) - playedOf(from),
  rentedBalls: to.rentedBalls - from.rentedBalls,
  replayedBalls: to.replayedBalls - from.replayedBalls,
})

const measuredOf = (walked: Walked): Measured | undefined => {
  const summed = stepsOf(walked.points)
    .filter((step) => measurableAcross(step.from, step.to))
    .map((step) => stepMeasured(step.from, step.to))
    .reduce((sum, step) => ({ spins: sum.spins + step.spins, balls: sum.balls + step.balls, rentedBalls: sum.rentedBalls + step.rentedBalls, replayedBalls: sum.replayedBalls + step.replayedBalls }), NOTHING_MEASURED)
  return summed.spins > 0 && summed.balls > 0 ? summed : undefined
}

/**
 * A play's regular games and what they were measured to cost, by its log
 * in play order and its corner's terms. Measured from the play's start —
 * or the last line before any regular game was played, where the first
 * balls were bought — over each stretch between points that know what is
 * in hand, to the last of them: 確変 and 時短 are not bought with balls,
 * and what they gain or lose is the 電サポ's. Where the person counted it,
 * the hand is followed across them; where not, a stretch with one inside
 * it is left out (`measurableAcross`), so that what the 電サポ did never
 * shows as regular games costing more or less. Spins taken to have been
 * played at the heso are paid for, never measured. Nothing is measured
 * past a jackpot whose bonus the log does not say.
 */
export const consumptionOf = (ordered: readonly Checkpoint[], terms: PlayTerms, formula: PlayFormula | undefined): Consumption => {
  const walked = walkedOf(ordered, terms, formula?.paidSpins ?? 0)
  return { regularSpins: walked.last?.regularSpins ?? 0, hesoSpins: walked.last?.hesoSpins ?? 0, measured: measuredOf(walked), payoutRatio: payoutRatioOf(ordered), supportRatio: supportRatioOf(ordered, formula) }
}

/**
 * What the play's bonuses came to with the 電サポ's drift counted, over what
 * the formula looks for: every bonus at what it paid, the drift on top of
 * them, against the same bonuses with those won on the 電サポ changed by
 * the formula's 電サポ中の出玉増減. A bonus won on a 電サポ left uncounted
 * is taken as the formula looks for on both sides, its drift being
 * unknown. None where no drift was counted, or no bonus said what it paid.
 */
const supportRatioOf = (ordered: readonly Checkpoint[], formula: PlayFormula | undefined): number | undefined => {
  if (!ordered.some(saysDrift)) return undefined
  const factor = supportFactorOf(formula?.supportGain)
  const unsaid = unsaidSupportOf(ordered)
  const paid = ordered.reduce((sum, checkpoint, line) => sum + (unsaid[line] === true ? broughtOf(checkpoint, factor) : bonusGainOf(checkpoint)), 0)
  const looked = ordered.reduce((sum, checkpoint) => sum + broughtOf(checkpoint, factor), 0)
  const drift = ordered.findLast((checkpoint) => checkpoint.support !== undefined)?.support ?? 0
  return looked > 0 ? (paid + drift) / looked : undefined
}

/**
 * The spin performance a measurement comes to: regular spins for the balls
 * ¥1,000 rents at the corner, the player's own balls and those drawn from
 * savings counted as rented ones are — what a person counts as spins for
 * ¥1,000. A dear rental shows as fewer of them, never as a border moved.
 */
export const spinPerformanceOf = (measured: Measured, terms: PlayTerms): number => (measured.spins / measured.balls) * rentedForThousand(terms)

/** The spin performance a play's log measured, as its live screen shows it: none until there is a stretch to measure. */
export const measuredSpinPerformance = (ordered: readonly Checkpoint[], terms: PlayTerms): number | undefined =>
  ((measured) => (measured === undefined ? undefined : spinPerformanceOf(measured, terms)))(consumptionOf(ordered, terms, undefined).measured)

/** The spin performance between two points the hand was known at; none where no regular game, or no ball, came between, or they cannot be measured across. */
const stretchBetween = (from: Known, to: Known, terms: PlayTerms): number | undefined => {
  const step = stepMeasured(from, to)
  return measurableAcross(from, to) && step.spins > 0 && step.balls > 0 ? spinPerformanceOf(step, terms) : undefined
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
 * paid is unknown, so the balls played over it are; nor across a 確変 or
 * 時短 whose drift was not counted (`measurableAcross`), a jackpot's line
 * awaiting its hand settling to none as the 電サポ begins.
 */
export const stretchPerformancesOf = (ordered: readonly Checkpoint[], terms: PlayTerms): readonly (StretchRate | undefined)[] =>
  standingsOf(ordered, terms, 0).reduce<Stretching>(
    (walked, { standing, hands }, index) => {
      const line = ordered[index]
      const waiting = walked.waiting
      if (line !== undefined && isUntold(line)) return { rates: [...(waiting === undefined ? walked.rates : settled(walked.rates, waiting.line, undefined)), undefined], last: undefined, waiting: undefined }
      if (waiting !== undefined && !measurableAcross(waiting.from, { ...(hands.at(0) ?? standing), held: 0 })) return { rates: [...settled(walked.rates, waiting.line, undefined), undefined], last: isKnown(standing) ? standing : (hands.at(-1) ?? walked.last), waiting: undefined }
      const first = hands.at(0) ?? (isKnown(standing) ? standing : undefined)
      const closing = waiting !== undefined && first !== undefined
      const rates = closing ? settled(walked.rates, waiting.line, measuredRate(stretchBetween(waiting.from, first, terms))) : walked.rates
      const from = closing ? (first === standing ? undefined : first) : (walked.last ?? hands.at(0))
      const rate = from === undefined || !isKnown(standing) || line?.phase !== "regular" ? undefined : measuredRate(stretchBetween(from, standing, terms))
      const last = isKnown(standing) ? standing : (hands.at(-1) ?? walked.last)
      const opens = (closing || waiting === undefined) && isToldRegularJackpot(line) && !isKnown(standing) && from !== undefined
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
  const measured = consumptionOf(ordered, terms, undefined).measured
  const bought = rentedBallsOf(last.outlay - counted.outlay, terms) + last.replay - counted.replay
  return { spins, estimate: told === undefined || measured === undefined ? undefined : Math.max(0, Math.round(told + bought - (spins * measured.balls) / measured.spins)) }
}
