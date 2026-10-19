import { decimal, floored, multiply, quotient, type Decimal } from "../decimal/decimal"
import { exchangeRateOf, type PlayTerms } from "../parlor/terms"
import { oddPrizesAt } from "./prize-exchange"

/** The special prizes the stages may step down by, in yen: a counter's smallest special prize is one of them. */
export const STAGE_STEPS = [100, 500, 1000] as const

export type StageStep = (typeof STAGE_STEPS)[number]

/** The step the stages start at, until another is chosen: a 500円 special prize is the smallest at many counters. */
const DEFAULT_STAGE_STEP: StageStep = 500

/** A step as kept, or the default where nothing, or nothing it could be, is kept. */
export const readStageStep = (kept: string | undefined): StageStep => STAGE_STEPS.find((step) => String(step) === kept) ?? DEFAULT_STAGE_STEP

/** How many stages are set out at most, the nearest first: enough to choose from, few enough to read. */
const MOST_STAGES = 20

/**
 * A count of tokens to stop at so that they exchange for a sum of special
 * prizes and as little else as can be: the tokens kept, the special prizes
 * they come to, the odd prizes left beside them, in whole yen — none
 * where the sum is whole tokens, less than a token's worth where it is not
 * — and the tokens to be played before them.
 */
export interface Stage {
  readonly kept: number
  readonly specialPrizes: Decimal
  readonly oddPrizes: Decimal
  readonly toPlay: number
}

/** What tokens come to at a corner: what renting as many would cost, and what they are worth at its exchange, the part of a yen cut off. */
export interface OddPrizeReckoning {
  readonly rented: Decimal
  readonly exchanged: Decimal
}

const whole = (value: number | bigint): Decimal => decimal(BigInt(value), 0)

/** The fewest whole tokens a sum of yen is exchanged from: at 5.15枚 for ¥100, ¥9,500 is 489.25 medals, so 490. */
const tokensFor = (yen: bigint, exchange: PlayTerms["exchange"]): bigint => {
  const [rate, tokens] = [BigInt(exchange.yen), BigInt(exchange.tokens)]
  return (yen * tokens + rate - 1n) / rate
}

/**
 * The counts below so many whole tokens to stop at, a special prize of the
 * step apart, the nearest first and none left last where that is among the
 * first twenty: for one who would rather play on than stop at the odd few.
 */
export const stagesOf = (tokens: number, exchange: PlayTerms["exchange"], step: StageStep): readonly Stage[] => {
  const most = (BigInt(tokens) * BigInt(exchange.yen)) / (BigInt(step) * BigInt(exchange.tokens))
  return Array.from({ length: Math.min(Number(most) + 1, MOST_STAGES) }, (_, below) => (most - BigInt(below)) * BigInt(step)).map((yen) => {
    const kept = tokensFor(yen, exchange)
    return {
      kept: Number(kept),
      specialPrizes: whole(yen),
      oddPrizes: oddPrizesAt(whole(kept), exchangeRateOf({ exchange }), whole(yen)),
      toPlay: tokens - Number(kept),
    }
  })
}

/** So many whole tokens at a corner's rental and exchange. */
export const oddPrizeReckoningOf = (tokens: number, terms: Pick<PlayTerms, "rental" | "exchange">): OddPrizeReckoning => ({
  rented: quotient(multiply(whole(tokens), whole(terms.rental.yen)), whole(terms.rental.tokens), 0),
  exchanged: floored(multiply(whole(tokens), exchangeRateOf(terms)), 0),
})
