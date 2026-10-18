import { decimal, quotient, toPlainString, type Decimal } from "../decimal/decimal"
import { tokenKindOf, type PlayGameKind } from "../play/play"
import type { SavingsPool } from "./parlor"

/**
 * The terms a corner of a parlor plays on, as its board states them: how many
 * tokens a sum of yen rents, how many tokens a sum of yen is exchanged for,
 * and how many tokens a replay pays out for how many taken off savings.
 * Different corners of one parlor — 4 yen, 1 yen, even two 1-yen corners —
 * have different terms, so they belong to a play, not to the parlor. All
 * whole numbers above zero.
 */
export interface PlayTerms {
  readonly rental: { readonly yen: number; readonly tokens: number }
  readonly exchange: { readonly tokens: number; readonly yen: number }
  readonly replay: { readonly paidOut: number; readonly deducted: number }
}

/**
 * How a corner's exchange is stated for each game, as a board and a player
 * say it: the tokens ¥100 takes, to the places each game says it to —
 * pachinko's 28玉 or 27.5玉, pachislot's 5.1枚 or 5.15枚.
 */
const EXCHANGE_STATED: Readonly<Record<PlayGameKind, { readonly yen: number; readonly places: number }>> = {
  pachinko: { yen: 100, places: 1 },
  slot: { yen: 100, places: 2 },
}

const statedNumber = (places: number): RegExp => new RegExp(`^\\d+(\\.\\d{1,${String(places)}})?$`)

/**
 * An exchange as stated for a game, read from its text — commas and wide
 * digits tidied before — as whole tokens for a sum: 5.15枚 for ¥100 is 515
 * for ¥10,000, and 27.5玉 is 275 for ¥1,000. None where it is not a number above zero to the places the
 * game states it to.
 */
export const exchangeOfStated = (gameKind: PlayGameKind, typed: string): PlayTerms["exchange"] | undefined => {
  const { yen, places } = EXCHANGE_STATED[gameKind]
  if (!statedNumber(places).test(typed)) return undefined
  const [units = "", fraction = ""] = typed.split(".")
  const scale = 10 ** places
  const tokens = Number(units) * scale + Number(fraction.padEnd(places, "0") || "0")
  return tokens > 0 ? { yen: yen * scale, tokens } : undefined
}

/** A rate in yen for a token as a game states an exchange, tokens for ¥100, to the places it is said to: 3.571429 yen is 28.0 balls. */
export const statedExchangeOfRate = (gameKind: PlayGameKind, rate: Decimal): string => {
  const { yen, places } = EXCHANGE_STATED[gameKind]
  return (yen / Number(toPlainString(rate))).toFixed(places)
}

/** An exchange as stated for a game, to every place it is said to, however it is kept: 510 for ¥10,000 and 52 for ¥1,000 at pachislot are 5.10 and 5.20, 280 for ¥1,000 at pachinko 28.0. */
export const statedExchangeOf = (gameKind: PlayGameKind, exchange: PlayTerms["exchange"]): string => {
  const { yen, places } = EXCHANGE_STATED[gameKind]
  return ((exchange.tokens * yen) / exchange.yen).toFixed(places)
}

/** How many places an exchange rate is kept to; 1000 yen for 280 balls is 3.571429. */
const RATE_PLACES = 6

const whole = (value: number): Decimal => decimal(BigInt(value), 0)

/** Yen per token the corner exchanges at, as the journal writes a rate. */
export const exchangeRateOf = (terms: Pick<PlayTerms, "exchange">): Decimal => quotient(whole(terms.exchange.yen), whole(terms.exchange.tokens), RATE_PLACES)

/** The rental rates parlors advertise, in yen per token, dearest first, for each game. */
const TIERS: Readonly<Record<PlayGameKind, readonly number[]>> = {
  pachinko: [4, 2, 1, 0.5, 0.25, 0.2],
  slot: [20, 10, 5, 2, 1, 0.5],
}

/** Rates are compared with room for the float a division leaves: 1000 / 250 is 4, not 3.9999…. */
const SLACK = 1e-9

/**
 * The advertised rate a corner rents at, as a number, read off the rental
 * however it is written. A parlor rents at the advertised rate or dearer —
 * 1000 yen for 890 balls is 1.12 a ball at a 1-yen corner — so the rate is
 * the dearest advertised one not above it.
 */
const rentalTier = (gameKind: PlayGameKind, terms: PlayTerms): number | undefined => {
  const rate = terms.rental.yen / terms.rental.tokens
  return TIERS[gameKind].find((tier) => tier <= rate + SLACK)
}

/**
 * The advertised rate a corner's exchange belongs to. A parlor exchanges at
 * the advertised rate or cheaper — 280 balls for 1000 yen is 3.57 a ball at a
 * 4-yen corner — so the rate is the cheapest advertised one not below it.
 */
const exchangeTier = (gameKind: PlayGameKind, terms: PlayTerms): number | undefined => {
  const rate = terms.exchange.yen / terms.exchange.tokens
  return TIERS[gameKind].toReversed().find((tier) => tier >= rate - SLACK)
}

/**
 * The rates a corner is called by, in yen per token, dearest first: the
 * advertised ones, and pachislot's 8円, which some parlors run though the
 * journal keeps no pool under it.
 */
const CORNER_RATES: Readonly<Record<PlayGameKind, readonly number[]>> = {
  pachinko: [4, 2, 1, 0.5, 0.25, 0.2],
  slot: [20, 10, 8, 5, 2, 1, 0.5],
}

const GAME_SHORT: Readonly<Record<PlayGameKind, string>> = { pachinko: "パチ", slot: "スロ" }

/**
 * A corner as a player calls it — `4円パチ`, `20円スロ` — by the dearest
 * rate it rents at or above, whatever it exchanges at and whichever parlor
 * it is: what a press of its buttons adds is kept under it. A play on no
 * terms, or below every rate, is at a rate unknown.
 */
export const cornerOf = (gameKind: PlayGameKind, terms: PlayTerms | undefined): string => {
  const rate = terms === undefined ? undefined : CORNER_RATES[gameKind].find((each) => each <= terms.rental.yen / terms.rental.tokens + SLACK)
  return `${rate === undefined ? UNKNOWN_TIER : `${String(rate)}円`}${GAME_SHORT[gameKind]}`
}

/** What a corner is called when its rental and exchange do not point to one advertised rate. */
export const UNKNOWN_TIER = "レート不明"

/**
 * The advertised rate a corner plays at, as the journal names it — `4円`,
 * `1円`, `20円` — when its rental and its exchange point to the same one.
 * A 4-yen rental exchanged at more than 4 yen, or a 1-yen one at 3.57, points
 * to none, and is kept as a rate unknown rather than guessed at.
 */
export const tierOf = (gameKind: PlayGameKind, terms: PlayTerms): string => {
  const rented = rentalTier(gameKind, terms)
  return rented !== undefined && rented === exchangeTier(gameKind, terms) ? `${String(rented)}円` : UNKNOWN_TIER
}

/** The savings a play on these terms draws on and pays into. */
export const poolOf = (gameKind: PlayGameKind, terms: PlayTerms): SavingsPool => ({ kind: tokenKindOf(gameKind), tier: tierOf(gameKind, terms) })

/** Yen a token is worth on these terms, for the theoretical value a formula gives. */
export const tokenValueOf = (terms: PlayTerms): number => Number(toPlainString(exchangeRateOf(terms)))

/** Tokens a sum of yen rents, rounded down: a parlor never lends part of a ball. */
export const tokensRentedFor = (terms: Pick<PlayTerms, "rental">, yen: number): number => Math.floor((yen * terms.rental.tokens) / terms.rental.yen)

/** Savings a replay of so many tokens takes, rounded up: the fee is never in the player's favour. */
export const savingsDeductedFor = (terms: Pick<PlayTerms, "replay">, paidOut: number): number => Math.ceil((paidOut * terms.replay.deducted) / terms.replay.paidOut)
