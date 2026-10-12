import type { IsoDate } from "../calendar/calendar"
import { YEN, tokenCommodity, type TokenKind } from "../commodity/commodity"
import { isNegative, isZero, multiply, negate, rounded, subtract, type Decimal } from "../decimal/decimal"
import { ACCOUNTS, savingsAccount } from "../journal/accounts"
import type { Entry, Posting } from "../journal/entry"
import { identityTags, type Parlor, type SavingsPool } from "../parlor/parlor"
import { Err, Ok, type Result } from "../result/result"
import { rateOn, type PricePoint } from "../valuation/valuation"
import { SAVINGS_TAG, withEquityDeclared } from "./balance"

/**
 * Savings exchanged for prizes at a parlor's counter: so many tokens out of
 * one pool on a day, and what the special prizes (特殊景品) handed over for
 * them are worth in yen. A parlor gives prizes, never money, and the book
 * says what the parlor did: what becomes of a prize afterwards is outside
 * it. It is no play and no play's result — the tokens were won, or lost,
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

const real = (account: string, quantity: Decimal, commodity: string): Posting => ({ account, amount: { quantity, commodity }, kind: "real" })

const unlessZero = (quantity: Decimal, posting: Posting): readonly Posting[] => (isZero(quantity) ? [] : [posting])

const checked = (exchange: PrizeExchange): Result<PrizeExchange, PrizeExchangeProblem> => {
  if (isZero(exchange.tokens) || isNegative(exchange.tokens)) return Err({ type: "nothing-exchanged" })
  if (exchange.tokens.places > 0) return Err({ type: "fractional-tokens" })
  return isNegative(exchange.specialPrizes) ? Err({ type: "negative-prizes" }) : Ok(exchange)
}

/** The accounts an exchange is written to, as a book declares them, under the equity savings are set against. */
const PRIZE_ACCOUNTS = [ACCOUNTS.specialPrizes, ACCOUNTS.oddPrizes, ACCOUNTS.translationAdjustment] as const

const declares = (accounts: string, account: string): boolean => accounts.split("\n").some((line) => line.startsWith(`account ${account}`))

/** A book's accounts with the two prize accounts and the translation adjustment declared, each once, and the equity they stand under: a book made before they were recorded has none. */
export const withPrizesDeclared = (accounts: string): string =>
  PRIZE_ACCOUNTS.filter((account) => !declares(accounts, account)).reduce((declared, account) => `${declared.replace(/\n*$/, "")}\naccount ${account}\n`, withEquityDeclared(accounts))

/** A book's accounts as an entry needs them: with the prize accounts declared where it posts to one — a play in yen that gained does — and as they were where it does not. */
export const withPrizesDeclaredFor = (accounts: string, entry: Entry): string =>
  entry.postings.some((posting) => (PRIZE_ACCOUNTS as readonly string[]).includes(posting.account)) ? withPrizesDeclared(accounts) : accounts

/**
 * A prize exchange as one journal entry. The tokens leave savings at the
 * book's exchange rate for the day — what they stood at in every figure
 * until then — and leave the book as prizes: the special prizes at what
 * they are worth, and whatever lies between as odd prizes (端玉景品), the
 * sweets tokens short of a special prize are given as. A prize is worth
 * whole yen and a token's rate is not, so the odd prizes are the nearest
 * yen and the part of a yen left over is the translation adjustment
 * (換算調整勘定), as the difference left by restating one unit in another
 * is kept. All three are equity, as an opening balance is: taking prizes
 * home is no play's result, so no income statement counts it, and the book
 * never says money came of it.
 */
export const prizeExchangeEntry = (exchange: PrizeExchange, prices: readonly PricePoint[]): Result<Entry, PrizeExchangeProblem> => {
  const valid = checked(exchange)
  if (!valid.ok) return valid
  const commodity = tokenCommodity(exchange.pool.kind, exchange.parlor.name, exchange.pool.tier)
  const point = rateOn(prices, commodity, exchange.date)
  if (point === undefined) return Err({ type: "no-exchange-rate", commodity, date: exchange.date })
  const between = subtract(multiply(exchange.tokens, point.rate), exchange.specialPrizes)
  const odd = rounded(between, 0)
  const adjustment = subtract(between, odd)
  return Ok({
    date: exchange.date,
    description: `景品交換 ${exchange.parlor.name}`,
    tags: [...identityTags(exchange.parlor.identity), [SAVINGS_TAG, "prize-exchange"]],
    postings: [
      { ...real(savingsAccount(exchange.pool.kind, exchange.parlor.name, exchange.pool.tier), negate(exchange.tokens), commodity), cost: { rate: point.rate, commodity: YEN } },
      ...unlessZero(exchange.specialPrizes, real(ACCOUNTS.specialPrizes, exchange.specialPrizes, YEN)),
      ...unlessZero(odd, real(ACCOUNTS.oddPrizes, odd, YEN)),
      ...unlessZero(adjustment, real(ACCOUNTS.translationAdjustment, adjustment, YEN)),
    ],
  })
}
