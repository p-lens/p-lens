import type { BeliefDto, InferenceSummaryDto, ReadingDto, ToldDto, WayDto } from "@p-lens/contracts/pachinko"

import { decimal } from "../decimal/decimal"
import { keptSpinPerformance } from "../tally/aside"
import type { InferredWorth } from "../tally/tally"
import type { Figures } from "./figures"
import { borderOf } from "./theoretical-value"

/** What a ball may rent for, in yen: the two rates a parlor's corners are. */
export const TOKEN_RENTALS = [4, 1] as const

export type TokenRental = (typeof TOKEN_RENTALS)[number]

/**
 * How a parlor exchanges balls for prizes, named as players name it at ¥4
 * a ball, the kindest first: the 25 that ¥100 rented — an equal exchange —
 * or 28 balls, 30 or 33 for ¥100 of prizes.
 */
export const EXCHANGES = ["equal", "28", "30", "33"] as const

export type Exchange = (typeof EXCHANGES)[number]

/** The exchanges a corner of each rental is offered as: 33 balls is a ¥4 corner's, a ¥1 corner being seldom that harsh. */
export const EXCHANGES_AT: Readonly<Record<TokenRental, readonly Exchange[]>> = { 4: EXCHANGES, 1: ["equal", "28", "30"] }

/** What a told play is weighed on beside its formula: what a ball rented for, and how balls were exchanged. */
export interface WeighingTerms {
  readonly rental: TokenRental
  readonly exchange: Exchange
}

/** The terms a play is weighed on until a person says otherwise: ¥4 a ball, exchanged at 28 — the harsher of the common exchanges being the one to assume. */
export const TERMS_BY_DEFAULT: WeighingTerms = { rental: 4, exchange: "28" }

/** Terms at another rental: the exchange as it was where that rental is offered it, and the usual one where not. */
export const withRental = (terms: WeighingTerms, rental: TokenRental): WeighingTerms => ({ rental, exchange: EXCHANGES_AT[rental].includes(terms.exchange) ? terms.exchange : TERMS_BY_DEFAULT.exchange })

const BALLS_FOR_100_AT_4: Readonly<Record<Exchange, number>> = { "28": 28, "30": 30, "33": 33, equal: 25 }

/** Balls ¥100 of prizes takes: what the exchange is named for at ¥4 a ball, and as many times more as a ball is cheaper. */
export const tokenExchangeOf = (terms: WeighingTerms): number => (BALLS_FOR_100_AT_4[terms.exchange] * 4) / terms.rental

/** Yen a ball exchanges for. */
export const ballValueOf = (terms: WeighingTerms): number => 100 / tokenExchangeOf(terms)

/** The terms two figures kept with a play say: what a ball rented for and the balls ¥100 of prizes took. None where they are not ones a play is weighed on. */
export const termsOf = (tokenRental: number, tokenExchange: number): WeighingTerms | undefined => {
  const rental = TOKEN_RENTALS.find((each) => each === tokenRental)
  const exchange = rental === undefined ? undefined : EXCHANGES_AT[rental].find((each) => tokenExchangeOf({ rental, exchange: each }) === tokenExchange)
  return rental === undefined || exchange === undefined ? undefined : { rental, exchange }
}

/** Regular spins a cabinet is taken to play in an hour where its formula does not say: on the slow side, a person's breaks being in their hours. */
export const PACE_BY_DEFAULT = 200

/** How many times a machine is played out to weigh one play typed in by hand. */
export const TRIALS_BY_HAND = 2_000_000

/** How many times a machine is played out again for a play too few of the usual trials came near: five times as many, before it is given up as one that tells too little. */
export const TRIALS_BEYOND = 10_000_000

/** How many times a machine is played out for each play of a file taken in: fewer, a file holding years of them. */
export const TRIALS_ON_IMPORT = 200_000

/** What a person tells of a play typed in afterwards, as figures. */
export interface Told {
  readonly hours: number
  readonly outlay: number
  readonly takings: number
  readonly jackpots: number | undefined
}

/**
 * The engine weighs a play as one of ¥4 a ball, 250 to ¥1,000. A play of a
 * cheaper ball is the same play with its yen worth so many times more —
 * the balls, the spins and the hours are what they were — so its sums are
 * scaled up going in, and coming out its worth is scaled back down and
 * its spin performance, which is spins for ¥1,000, up: ¥1,000 rents so
 * many times more of a cheaper ball.
 */
const scaleOf = (terms: WeighingTerms): number => 4 / terms.rental

/** Balls ¥1,000 rents in the engine's play. */
export const RENTED_PER_THOUSAND = 250

/** Yen a ball exchanges for in the engine's play. */
export const scaledBallValueOf = (terms: WeighingTerms): number => ballValueOf(terms) * scaleOf(terms)

/** What was told, as the engine is told it. */
export const toldDtoOf = (told: Told, terms: WeighingTerms): ToldDto => ({
  hours: told.hours,
  outlay: told.outlay * scaleOf(terms),
  takings: told.takings * scaleOf(terms),
  ...(told.jackpots === undefined ? {} : { jackpots: told.jackpots }),
})

/**
 * How far under its border a cabinet is believed to be before its play is
 * told of, in spins for ¥1,000 at ¥4 a ball: one. A cabinet set at its
 * border pays back, on average, all that is put into it, and a parlor
 * whose cabinets all did could not pay for its electricity, its staff or
 * its rent: its cabinets stand under the border by what it costs to keep
 * its doors open. One spin is that allowance — a round figure, not a
 * measured one.
 */
const BELIEVED_UNDER = 1

/**
 * What is believed of a cabinet before its play is told of, in the
 * engine's play: a spin under the border (`BELIEVED_UNDER`), give or take
 * a sixth of the border. That is the one assumption made about a cabinet,
 * and it is said here with its reason: the figure gone by afterwards is
 * the middle of what the play allows, with no side taken.
 */
export const beliefOf = (figures: Figures, terms: WeighingTerms): BeliefDto => {
  const border = borderOf(figures, scaledBallValueOf(terms))
  return { mean: border - BELIEVED_UNDER, deviation: border / 6 }
}

/**
 * What a told play is taken to have been (推定): its spin performance, the
 * border it is set against, and what it was worth, all of its balls taken
 * as rented. Each is the middle of what the play allows — as likely to be
 * over as under — and each is read from the trials themselves: what it
 * was worth is the middle of what each trial's own spins were worth at
 * its own spin performance, not a figure worked out from the spin
 * performance beside it.
 */
export interface Weighed {
  /** Spins for ¥1,000 (推定回転率). */
  readonly spinPerformance: number
  readonly border: number
  /** In yen (推定期待値). */
  readonly theoreticalValue: number
}

/** A reading of the engine's as what the play is taken to have been, on its own terms. */
const weighedOf = (figures: Figures, terms: WeighingTerms, reading: ReadingDto): Weighed => ({
  spinPerformance: reading.middle * scaleOf(terms),
  border: borderOf(figures, ballValueOf(terms)),
  theoreticalValue: reading.value / scaleOf(terms),
})

/** Balls a regular spin wins on average by a formula: what the engine weighs each trial's spins by. */
export const ballsPerSpinOf = (figures: Figures): number => figures.payoutPerRound / figures.roundChanceOneIn

/** Trials of equal weight a reading must rest on to be gone by. */
const ENOUGH = 150

/** How often a play as far out as one told of may come and still be an ordinary play: more seldom than once in so many, it is called out of the ordinary. */
export const ANOMALY_ONE_IN = 1000

/** A belief's quartiles stand this many of its deviations apart. */
const QUARTILES_APART = 1.349

/** How wide a reading may be, against what was believed before the play was told of, and still say something: wider, the play has told too little. */
const VAGUE_FROM = 0.8

/**
 * What the weighing of a told play comes to.
 *
 * - `weighed`: the play is taken to have been this.
 * - `anomalous`: the play is one so far out of the ordinary, one `way` —
 *   in its cash, in what came back, or in what the two came to — that a
 *   play as far out that way comes about once in `oneIn` plays of the
 *   machine as it is taken to be; or, where no trial went as far
 *   (`beyond`), was not once played out in `oneIn` trials. Nothing is
 *   read from such a play.
 * - `vague`: nothing can be read from the play as told — too few trials
 *   came near it (`few-near`), or those that did say hardly more than was
 *   believed already (`wide`), which is how a play carried by its winnings
 *   reads until its jackpots are told.
 */
export type Verdict =
  | { readonly type: "weighed"; readonly weighed: Weighed }
  | { readonly type: "anomalous"; readonly oneIn: number; readonly beyond: boolean; readonly way: WayDto }
  | { readonly type: "vague"; readonly why: "few-near" | "wide" }

/** How wide a reading is, against the belief it started from: the quartiles of the one over those of the other. */
const spreadOf = (reading: ReadingDto, belief: BeliefDto): number => (reading.upper - reading.lower) / (QUARTILES_APART * belief.deviation)

/** What a weighing that has run its trials comes to: out of the ordinary before anything, then too little to read, then read. */
export const verdictOf = (figures: Figures, terms: WeighingTerms, summary: InferenceSummaryDto): Verdict => {
  if (summary.rarest * ANOMALY_ONE_IN < summary.trials) return { type: "anomalous", oneIn: summary.rarest === 0 ? summary.trials : summary.trials / summary.rarest, beyond: summary.rarest === 0, way: summary.rarestWay }
  if (summary.reading === null || summary.reading.effectiveTrials < ENOUGH) return { type: "vague", why: "few-near" }
  return spreadOf(summary.reading, beliefOf(figures, terms)) > VAGUE_FROM ? { type: "vague", why: "wide" } : { type: "weighed", weighed: weighedOf(figures, terms, summary.reading) }
}

/** What a play was taken to be worth, as its entry keeps it: the value in whole yen, with the formula and the terms it stood on. */
export const inferredWorthOf = (weighed: Weighed, formulaId: string, terms: WeighingTerms): InferredWorth => ({
  value: decimal(BigInt(Math.round(weighed.theoreticalValue)), 0),
  formulaId,
  tokenRental: decimal(BigInt(terms.rental), 0),
  tokenExchange: decimal(BigInt(tokenExchangeOf(terms)), 0),
  spinPerformance: keptSpinPerformance(weighed.spinPerformance),
})

const FNV_OFFSET = 0xcbf29ce484222325n
const FNV_PRIME = 0x100000001b3n
const WORD = (1n << 64n) - 1n

/**
 * The seed a play is weighed from, as a decimal string: its id hashed
 * (FNV-1a, 64 bits), so the same play is weighed the same on every device
 * and every time, and no weighing can be asked again for a kinder answer.
 */
export const seedOf = (playId: string): string =>
  [...playId]
    .reduce((hash, character) => ((hash ^ BigInt(character.codePointAt(0) ?? 0)) * FNV_PRIME) & WORD, FNV_OFFSET)
    .toString()
