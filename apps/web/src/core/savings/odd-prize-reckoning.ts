import { decimal, floored, multiply, quotient, type Decimal } from "../decimal/decimal"
import { exchangeRateOf, type PlayTerms } from "../parlor/terms"

/**
 * The special prizes the stages may step down by, in yen: a counter's
 * smallest special prize is one of them, and every counter hands over
 * ¥1,000, so tokens worth a whole number of thousands leave no odd prizes
 * anywhere.
 */
export const STAGE_STEPS = [100, 500, 1000] as const

export type StageStep = (typeof STAGE_STEPS)[number]

/** The step the stages start at, until another is chosen: a 500円 special prize is the smallest at many counters. */
const DEFAULT_STAGE_STEP: StageStep = 500

/** A step as kept, or the default where nothing, or nothing it could be, is kept. */
export const readStageStep = (kept: string | undefined): StageStep => STAGE_STEPS.find((step) => String(step) === kept) ?? DEFAULT_STAGE_STEP

/** How many stages are set out at most, the nearest first: enough to choose from, few enough to read. */
const MOST_STAGES = 20

/**
 * A count of tokens to stop at so that they exchange exactly, with no odd
 * prizes: the tokens kept, the special prizes they come to, and the tokens
 * to be played before them.
 */
export interface ExactStage {
  readonly kept: number
  readonly specialPrizes: Decimal
  readonly toPlay: number
}

/** What tokens come to at a corner: what renting as many would cost, and what they are worth at its exchange, the part of a yen cut off. */
export interface OddPrizeReckoning {
  readonly rented: Decimal
  readonly exchanged: Decimal
}

const whole = (value: number | bigint): Decimal => decimal(BigInt(value), 0)

const gcd = (left: bigint, right: bigint): bigint => (right === 0n ? left : gcd(right, left % right))

/**
 * The step between stages, in yen and in tokens: the step chosen, or as
 * many of it as it takes to be whole tokens — at 5.15枚 for ¥100, ¥1,000
 * is 51.5 medals, so the step is ¥2,000 and 103.
 */
const stepOf = (exchange: PlayTerms["exchange"], chosen: StageStep): { readonly yen: bigint; readonly tokens: bigint } => {
  const [yen, tokens] = [BigInt(exchange.yen), BigInt(exchange.tokens)]
  const times = yen / gcd(yen, BigInt(chosen) * tokens)
  const stepYen = BigInt(chosen) * times
  return { yen: stepYen, tokens: (stepYen * tokens) / yen }
}

/**
 * The counts below so many whole tokens that exchange exactly at a
 * corner, a step apart, the nearest first and none left last where that
 * is among the first twenty: for one who would rather play on than stop
 * at the odd few.
 */
export const exactStagesOf = (tokens: number, exchange: PlayTerms["exchange"], chosen: StageStep): readonly ExactStage[] => {
  const step = stepOf(exchange, chosen)
  const most = BigInt(tokens) / step.tokens
  return Array.from({ length: Math.min(Number(most) + 1, MOST_STAGES) }, (_, below) => most - BigInt(below)).map((steps) => ({
    kept: Number(steps * step.tokens),
    specialPrizes: whole(steps * step.yen),
    toPlay: tokens - Number(steps * step.tokens),
  }))
}

/** So many whole tokens at a corner's rental and exchange. */
export const oddPrizeReckoningOf = (tokens: number, terms: Pick<PlayTerms, "rental" | "exchange">): OddPrizeReckoning => ({
  rented: quotient(multiply(whole(tokens), whole(terms.rental.yen)), whole(terms.rental.tokens), 0),
  exchanged: floored(multiply(whole(tokens), exchangeRateOf(terms)), 0),
})
