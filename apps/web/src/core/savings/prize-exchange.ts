import type { IsoDate } from "../calendar/calendar"
import { YEN, tokenCommodity, type TokenKind } from "../commodity/commodity"
import { decimal, isNegative, isZero, multiply, negate, rounded, subtract, type Decimal } from "../decimal/decimal"
import { ACCOUNTS, savingsAccount } from "../journal/accounts"
import { describedBy, type Entry, type StatedPosting } from "../journal/entry"
import { identityTags, type Parlor, type SavingsPool } from "../parlor/parlor"
import { rentalPriceOfTier } from "../parlor/terms"
import { Err, Ok, type Result } from "../result/result"
import { rateOn, type PricePoint } from "../valuation/valuation"
import { SAVINGS_TAG, withEquityDeclared } from "./balance"

/**
 * Savings exchanged for prizes at a parlor's counter: so many tokens out of
 * one pool on a day, and what the special prizes (特殊景品) handed over for
 * them are worth in yen. A parlor gives prizes, never money, and the book
 * says what the parlor did: what becomes of a prize afterwards is outside
 * it. It is no tally and no tally's result — the tokens were won, or lost,
 * when they were played for.
 */
export interface PrizeExchange {
  readonly parlor: Parlor
  readonly pool: SavingsPool
  readonly date: IsoDate
  readonly tokens: Decimal
  /** What the special prizes received are worth, in yen. */
  readonly specialPrizes: Decimal
}

/**
 * Why a prize exchange cannot be written.
 *
 * - `savings-short`: the pool holds fewer tokens by that day than were said to be exchanged.
 */
export type PrizeExchangeProblem =
  | { readonly type: "nothing-exchanged" }
  | { readonly type: "fractional-tokens" }
  | { readonly type: "negative-prizes" }
  | { readonly type: "no-exchange-rate"; readonly commodity: string; readonly date: IsoDate }
  | { readonly type: "savings-short"; readonly kind: TokenKind; readonly held: Decimal }

const real = (account: string, quantity: Decimal, commodity: string): StatedPosting => ({ account, amount: { quantity, commodity }, kind: "real" })

const unlessZero = (quantity: Decimal, posting: StatedPosting): readonly StatedPosting[] => (isZero(quantity) ? [] : [posting])

const checked = (exchange: PrizeExchange): Result<PrizeExchange, PrizeExchangeProblem> => {
  if (isZero(exchange.tokens) || isNegative(exchange.tokens)) return Err({ type: "nothing-exchanged" })
  if (exchange.tokens.places > 0) return Err({ type: "fractional-tokens" })
  return isNegative(exchange.specialPrizes) ? Err({ type: "negative-prizes" }) : Ok(exchange)
}

/** What lies between tokens' worth at a rate and the special prizes handed over for them, in yen to whatever part of one. */
const between = (tokens: Decimal, rate: Decimal, specialPrizes: Decimal): Decimal => subtract(multiply(tokens, rate), specialPrizes)

/** What lies between tokens' worth at a rate and the special prizes, in whole yen: the odd prizes where no token can be counted out at the rate. */
const betweenInWholeYen = (tokens: Decimal, rate: Decimal, specialPrizes: Decimal): Decimal => rounded(between(tokens, rate, specialPrizes), 0)

/** A ratio of whole numbers above nothing: yen to tokens, as a counter's board states an exchange. */
interface Ratio {
  readonly numerator: bigint
  readonly denominator: bigint
}

/** The ratio with the smallest denominator from one ratio to another, both above nothing, ends included. */
const simplestWithin = (low: Ratio, high: Ratio): Ratio => {
  const whole = low.numerator / low.denominator
  if (whole * low.denominator === low.numerator || (whole + 1n) * high.denominator <= high.numerator) {
    return { numerator: whole * low.denominator === low.numerator ? whole : whole + 1n, denominator: 1n }
  }
  const rest = simplestWithin(
    { numerator: high.denominator, denominator: high.numerator - whole * high.denominator },
    { numerator: low.denominator, denominator: low.numerator - whole * low.denominator },
  )
  return { numerator: whole * rest.numerator + rest.denominator, denominator: rest.numerator }
}

/** The fewest places a rate is taken to be rounded to: a book's rates are written to two places at least. */
const RATE_PLACES = 2

/**
 * The exchange a rate was rounded from: the simplest ratio of yen to
 * tokens that rounds to it. A counter's board is 28 balls or 5.6 medals to
 * ¥100, and the book keeps 3.57 or 17.86 — the one rounded down, the other
 * up — or the same to six places; each is 25/7 or 125/7 again.
 */
const exchangeOf = (rate: Decimal): Ratio => {
  const places = BigInt(Math.max(rate.places, RATE_PLACES))
  const scaled = rate.mantissa * 10n ** (places - BigInt(rate.places))
  const unit = 2n * 10n ** places
  return simplestWithin({ numerator: 2n * scaled - 1n, denominator: unit }, { numerator: 2n * scaled + 1n, denominator: unit })
}

/** The fewest whole tokens special prizes are exchanged from at a rate, as a counter counts them out. */
const specialTokensAt = (rate: Decimal, specialPrizes: Decimal): Decimal => {
  const exchange = exchangeOf(rate)
  const scaled = specialPrizes.mantissa * exchange.denominator
  const over = exchange.numerator * 10n ** BigInt(specialPrizes.places)
  return decimal((scaled + over - 1n) / over, 0)
}

/**
 * The odd prizes of an exchange of so many tokens at a rate for special
 * prizes: the odd tokens the special prizes leave, at what renting as many
 * costs — the book's choice of value for them, not a parlor's — in
 * whole yen. They are below nothing where the special
 * prizes took more tokens than were exchanged: no parlor hands over less
 * than no sweets, so the book's rate is then lower than the parlor's was.
 * It is written so all the same — the person may know what they are
 * doing, and the line says where to look — and whoever asks is told
 * before it is. With no rental price known — a pool at a rate unknown —
 * the odd tokens go at the rate; a rate of nothing or below, which only a
 * hand can write, counts no tokens out and gives what lies between.
 */
export const exchangedOddPrizes = (tokens: Decimal, rate: Decimal, specialPrizes: Decimal, rentalPrice: Decimal | undefined): Decimal =>
  isZero(rate) || isNegative(rate)
    ? betweenInWholeYen(tokens, rate, specialPrizes)
    : rounded(multiply(subtract(tokens, specialTokensAt(rate, specialPrizes)), rentalPrice ?? rate), 0)

/** The accounts an exchange is written to, as a book declares them, under the equity savings are set against. */
const PRIZE_ACCOUNTS = [ACCOUNTS.specialPrizes, ACCOUNTS.oddPrizes, ACCOUNTS.translationAdjustment] as const

const declares = (accounts: string, account: string): boolean => accounts.split("\n").some((line) => line.startsWith(`account ${account}`))

/** A book's accounts with the two prize accounts and the translation adjustment declared, each once, and the equity they stand under: a book made before they were recorded has none. */
export const withPrizesDeclared = (accounts: string): string =>
  PRIZE_ACCOUNTS.filter((account) => !declares(accounts, account)).reduce((declared, account) => `${declared.replace(/\n*$/, "")}\naccount ${account}\n`, withEquityDeclared(accounts))

/** A book's accounts as an entry needs them: with the prize accounts declared where it posts to one — a tally in yen that gained does — and as they were where it does not. */
export const withPrizesDeclaredFor = (accounts: string, entry: Entry): string =>
  entry.postings.some((posting) => (PRIZE_ACCOUNTS as readonly string[]).includes(posting.account)) ? withPrizesDeclared(accounts) : accounts

/**
 * A prize exchange as one journal entry. The tokens leave savings at the
 * book's exchange rate for the day — what they stood at in every figure
 * until then — and leave the book as prizes: the special prizes at what
 * they are worth, and the odd tokens beside them as odd prizes (端玉景品),
 * the sweets tokens short of a special prize are given as, at the rental
 * price. What the tokens were worth at the rate and what the prizes are
 * worth do not meet, so the difference is the translation adjustment
 * (換算調整勘定), as the difference left by restating one unit in another
 * is kept — written with no amount, for hledger to balance. All three are equity, as an opening balance is: taking prizes
 * home is no tally's result, so no income statement counts it, and the book
 * never says money came of it.
 */
export const prizeExchangeEntry = (exchange: PrizeExchange, prices: readonly PricePoint[]): Result<Entry, PrizeExchangeProblem> => {
  const valid = checked(exchange)
  if (!valid.ok) return valid
  const commodity = tokenCommodity(exchange.pool.kind, exchange.parlor.name, exchange.pool.tier)
  const point = rateOn(prices, commodity, exchange.date)
  if (point === undefined) return Err({ type: "no-exchange-rate", commodity, date: exchange.date })
  const odd = exchangedOddPrizes(exchange.tokens, point.rate, exchange.specialPrizes, rentalPriceOfTier(exchange.pool.tier))
  return Ok({
    date: exchange.date,
    description: describedBy(exchange.parlor.name, "景品交換"),
    tags: [...identityTags(exchange.parlor.identity), [SAVINGS_TAG, "prize-exchange"]],
    postings: [
      { ...real(savingsAccount(exchange.pool.kind, exchange.parlor.name, exchange.pool.tier), negate(exchange.tokens), commodity), cost: { rate: point.rate, commodity: YEN } },
      ...unlessZero(exchange.specialPrizes, real(ACCOUNTS.specialPrizes, exchange.specialPrizes, YEN)),
      ...unlessZero(odd, real(ACCOUNTS.oddPrizes, odd, YEN)),
      { account: ACCOUNTS.translationAdjustment, kind: "balancing" },
    ],
  })
}
