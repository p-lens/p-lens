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
  /** The theoretical value of the spins paid for so far: the regular games, and those taken to have been played at the heso. */
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

/** The figures with a round paying as the 電サポ's counted drift says it did against the formula (`supportRatio`); as they are where none was counted. */
const asDrifted = (figures: Figures, ratio: number | undefined): Figures => (ratio === undefined ? figures : { ...figures, payoutPerRound: figures.payoutPerRound * ratio })

/**
 * A play's theoretical value, once its corner's terms are known and a
 * stretch of its regular games has been measured; undefined until then.
 * What a regular spin wins, exchanged, less what the measured ones cost,
 * carried over every regular spin of the play. A round wins what the
 * play's bonuses paid, counted or said (`asPaid`) — an over-entry lowers
 * the border, balls lost to a slack attacker raise it — and as the 電サポ's
 * drift, where the person counted it, says against the formula's
 * 電サポ中の出玉増減 (`asDrifted`): more lost raises the border, less lowers
 * it. The spin performance never moves for either; the theoretical value
 * is worked out the same way whatever the round pays.
 */
export const playTheoreticalValue = (told: Figures, terms: PlayTerms | undefined, consumption: Consumption, overEntry?: number): PlayTheoreticalValue | undefined => {
  const measured = consumption.measured
  if (terms === undefined || measured === undefined) return undefined
  const figures = asDrifted(asPaid(told, consumption.payoutRatio, overEntry), consumption.supportRatio)
  const ballValue = tokenValueOf(terms)
  const cost = costOf(measured, terms)
  const perSpin = ballsPerSpin(figures) * ballValue - cost / measured.spins
  return {
    spinPerformance: spinPerformanceOf(measured, terms),
    border: borderAt(figures, terms, cost / measured.balls),
    yenPerSpin: perSpin,
    theoreticalValue: perSpin * (consumption.regularSpins + consumption.hesoSpins),
    yenPerHour: figures.spinsPerHour === undefined ? undefined : perSpin * figures.spinsPerHour,
  }
}

/**
 * A corner as a person types it in to work a formula's theoretical value
 * out before playing (期待値算出): the balls ¥1,000 rents, the balls ¥100
 * of prizes takes, and the share of spins played with the player's own
 * balls, from 0 to 1.
 */
export interface SheetCorner {
  readonly rentedPerThousand: number
  readonly exchangedPerHundred: number
  readonly ownShare: number
}

/** How a person means to play at a corner: their spin performance, the regular spins they mean to play, and the spins an hour where they say. */
export interface SheetPlay {
  readonly spinPerformance: number
  readonly regularSpins: number
  readonly spinsPerHour: number | undefined
}

/**
 * The spin performance a play breaks even at, in spins for the balls
 * ¥1,000 rents: every ball rented (現金), every ball the player's own,
 * costing what it exchanges for (持玉), and the two mixed by the share
 * of own balls (持比).
 */
export interface SheetBorders {
  readonly cash: number
  readonly mixed: number
  readonly own: number
}

/** What a play typed in comes to: the theoretical value over its spins, a spin's, the balls it gains net of those it plays, and an hour's where the spins an hour are said. */
export interface SheetValue {
  readonly theoreticalValue: number
  readonly yenPerSpin: number
  readonly ballsGained: number
  readonly yenPerHour: number | undefined
}

const ballValueAt = (corner: SheetCorner): number => 100 / corner.exchangedPerHundred

export const sheetBordersOf = (figures: Figures, corner: SheetCorner): SheetBorders => {
  const worth = ballsPerSpin(figures) * ballValueAt(corner)
  const ownCost = corner.rentedPerThousand * ballValueAt(corner)
  return {
    cash: 1000 / worth,
    mixed: ((1 - corner.ownShare) * 1000 + corner.ownShare * ownCost) / worth,
    own: ownCost / worth,
  }
}

/**
 * A spin played with rented balls is worth what it wins, exchanged, less
 * the yen its balls were rented for; one with the player's own balls,
 * what it wins less the balls it plays, both exchanged. A play is worth
 * the two mixed by its share of own balls.
 */
export const sheetValueOf = (figures: Figures, corner: SheetCorner, play: SheetPlay): SheetValue => {
  const ballValue = ballValueAt(corner)
  const gainedPerSpin = ballsPerSpin(figures) - corner.rentedPerThousand / play.spinPerformance
  const cashPerSpin = ballsPerSpin(figures) * ballValue - 1000 / play.spinPerformance
  const perSpin = (1 - corner.ownShare) * cashPerSpin + corner.ownShare * gainedPerSpin * ballValue
  return {
    theoreticalValue: perSpin * play.regularSpins,
    yenPerSpin: perSpin,
    ballsGained: gainedPerSpin * play.regularSpins,
    yenPerHour: play.spinsPerHour === undefined ? undefined : perSpin * play.spinsPerHour,
  }
}
