import { tokenValueOf, type PlayTerms } from "../parlor/terms"
import { rentedForThousand, spinPerformanceOf, type Consumption, type Measured } from "./consumption"
import type { Figures } from "./figures"

/** One person's play: how many spins ¥1,000 buys, and what a ball exchanges for. */
export interface PlayRate {
  readonly spinPerformance: number
  /** Yen a ball exchanges for at the parlor, on the day. */
  readonly ballValue: number
}

/**
 * Balls a regular-game spin wins on average. The one place a theoretical
 * value starts from, for typed-in figures and simulated ones alike.
 */
export const ballsPerSpin = (figures: Figures): number => figures.payoutPerRound / figures.roundChanceOneIn

/** Spins per ¥1,000 at which the balls a spin wins, exchanged, repay what it costs. */
export const borderOf = (figures: Figures, ballValue: number): number => 1000 / (ballsPerSpin(figures) * ballValue)

/** Yen a spin is worth under play: what it wins, exchanged, less what it costs. */
export const yenPerSpin = (figures: Figures, play: PlayRate): number =>
  ballsPerSpin(figures) * play.ballValue - 1000 / play.spinPerformance

/** The theoretical value of an hour's play (時給), where the formula says how fast a cabinet plays. */
export const yenPerHour = (figures: Figures, play: PlayRate): number | undefined =>
  figures.spinsPerHour === undefined ? undefined : yenPerSpin(figures, play) * figures.spinsPerHour

/** The theoretical value of so many spins played under these conditions. */
export const theoreticalValueOf = (figures: Figures, play: PlayRate, spins: number): number => yenPerSpin(figures, play) * spins

/** What a play so far is worth, by its formula and what its regular games were measured to cost. */
export interface PlayTheoreticalValue {
  /** Regular spins for the balls ¥1,000 rents, the player's own balls counted with the rented. */
  readonly spinPerformance: number
  /**
   * The spin performance at which this play breaks even, its balls costing
   * what they did: the formula's border where every ball was rented, and
   * lower the more of them were the player's own or drawn from savings,
   * which cost what they would have exchanged for. The play's spin
   * performance is above it exactly when a spin is worth more than nothing.
   */
  readonly border: number
  readonly yenPerSpin: number
  /** The theoretical value of the regular spins played so far. */
  readonly theoreticalValue: number
  readonly yenPerHour: number | undefined
}

/**
 * What the balls a measurement played cost in yen: the rented at what they
 * were rented for, those drawn from savings at what the savings they took
 * would have exchanged for, and the player's own at what they would have
 * exchanged for. The rented and the drawn are taken as played first.
 */
const costOf = (measured: Measured, terms: PlayTerms): number => {
  const ballValue = tokenValueOf(terms)
  const rented = Math.min(measured.rentedBalls, measured.balls)
  const replayed = Math.min(measured.replayedBalls, measured.balls - rented)
  const own = measured.balls - rented - replayed
  return (rented * terms.rental.yen) / terms.rental.tokens + ((replayed * terms.replay.deducted) / terms.replay.paidOut) * ballValue + own * ballValue
}

/** The spin performance at which balls costing so much each repay themselves: what a ball cost over what a spin wins, in spins for the balls ¥1,000 rents. */
const borderAt = (figures: Figures, terms: PlayTerms, yenPerBall: number): number =>
  (yenPerBall / (ballsPerSpin(figures) * tokenValueOf(terms))) * rentedForThousand(terms)

/**
 * The figures as a play's bonuses paid them: every round paying as much
 * more, or less, as its bonuses did than their machine lists
 * (`payoutRatioOf`); before any bonus says, as the person's usual
 * over-entry at the cabinet says, in balls a round.
 */
const asPaid = (figures: Figures, ratio: number | undefined, overEntry: number | undefined): Figures => {
  if (ratio !== undefined) return { ...figures, payoutPerRound: figures.payoutPerRound * ratio }
  return overEntry === undefined ? figures : { ...figures, payoutPerRound: figures.payoutPerRound + overEntry }
}

/**
 * A play's theoretical value, once its corner's terms are known and a
 * stretch of its regular games has been measured; undefined until then.
 * What a regular spin wins, exchanged, less what the measured ones cost,
 * carried over every regular spin of the play. A round wins what the
 * play's bonuses paid, counted or said (`asPaid`) — an over-entry lowers
 * the border, balls lost to a slack attacker raise it.
 */
export const playTheoreticalValue = (told: Figures, terms: PlayTerms | undefined, consumption: Consumption, overEntry?: number): PlayTheoreticalValue | undefined => {
  const measured = consumption.measured
  if (terms === undefined || measured === undefined) return undefined
  const figures = asPaid(told, consumption.payoutRatio, overEntry)
  const ballValue = tokenValueOf(terms)
  const cost = costOf(measured, terms)
  const perSpin = ballsPerSpin(figures) * ballValue - cost / measured.spins
  return {
    spinPerformance: spinPerformanceOf(measured, terms),
    border: borderAt(figures, terms, cost / measured.balls),
    yenPerSpin: perSpin,
    theoreticalValue: perSpin * consumption.regularSpins,
    yenPerHour: figures.spinsPerHour === undefined ? undefined : perSpin * figures.spinsPerHour,
  }
}
