import { YEN } from "../commodity/commodity"
import { isNegative, isZero, negate, rounded, subtract, type Decimal } from "../decimal/decimal"
import { ACCOUNTS } from "../journal/accounts"
import type { Posting } from "../journal/entry"

const real = (account: string, quantity: Decimal): readonly Posting[] => (isZero(quantity) ? [] : [{ account, amount: { quantity, commodity: YEN }, kind: "real" }])

/** The translation adjustment, written with no amount for hledger to balance: the app never works it out. */
const TRANSLATION_ADJUSTMENT: Posting = { account: ACCOUNTS.translationAdjustment, kind: "balancing" }

/**
 * What lies between a tally's two sides in yen. A loss is cash spent. A gain
 * is never cash received — cash in a book only ever falls: it is prizes
 * taken home, the special prizes in whole yen and the part of a yen left
 * over the translation adjustment for hledger to balance, as a prize
 * exchange writes them.
 */
const betweenPostings = (between: Decimal): readonly Posting[] =>
  isNegative(between) ? real(ACCOUNTS.cash, between) : isZero(between) ? [] : [...real(ACCOUNTS.specialPrizes, rounded(between, 0)), TRANSLATION_ADJUSTMENT]

/**
 * The two sides of a tally in yen, typed in by hand or taken in from
 * another app: what went in as its play's expense, what came back as its
 * revenue, and what lies between, so the income statement counts it as it
 * counts any tally and both sides are kept, not only their difference. A
 * side of nothing writes no posting, and a tally that came out even moves
 * nothing else.
 */
export const sidePostings = (outlay: Decimal, takings: Decimal): readonly Posting[] => [
  ...real(ACCOUNTS.playExpense, outlay),
  ...real(ACCOUNTS.playRevenue, negate(takings)),
  ...betweenPostings(subtract(takings, outlay)),
]

/**
 * The two sides of a play at no parlor counted in tokens: the cash of its
 * outlay leaves cash, and the rest of its outlay and all its takings —
 * tokens begun with, drawn from savings and left — are set against savings
 * the book does not keep, in one posting of what they came to. Cash falls
 * by the cash spent, never by tokens, and no prize is written.
 */
export const sidePostingsOffBook = (outlay: Decimal, takings: Decimal, cash: Decimal, offBookAccount: string): readonly Posting[] => [
  ...real(ACCOUNTS.playExpense, outlay),
  ...real(ACCOUNTS.playRevenue, negate(takings)),
  ...real(ACCOUNTS.cash, negate(cash)),
  ...real(offBookAccount, subtract(takings, subtract(outlay, cash))),
]

/**
 * The two sides of a play at no parlor counted in tokens whose tokens left
 * were exchanged for prizes: the cash of its outlay leaves cash, the rest
 * of its outlay — tokens begun with and drawn from savings — comes from
 * savings the book does not keep, and its takings leave as the prizes
 * taken home, special and odd as given, with the translation adjustment
 * between for hledger to balance. Cash falls by the cash spent, and
 * nothing goes back to savings the book does not keep.
 */
export const sidePostingsOffBookExchanged = (outlay: Decimal, takings: Decimal, cash: Decimal, prizes: { readonly specialPrizes: Decimal; readonly oddPrizes: Decimal }, offBookAccount: string): readonly Posting[] => [
  ...real(ACCOUNTS.playExpense, outlay),
  ...real(ACCOUNTS.playRevenue, negate(takings)),
  ...real(ACCOUNTS.cash, negate(cash)),
  ...real(offBookAccount, negate(subtract(outlay, cash))),
  ...real(ACCOUNTS.specialPrizes, prizes.specialPrizes),
  ...real(ACCOUNTS.oddPrizes, prizes.oddPrizes),
  TRANSLATION_ADJUSTMENT,
]

/**
 * The two sides of a play at no parlor counted in yen alone: its outlay
 * leaves cash, and its takings are the special prizes taken home — in
 * whole yen, the part of one over the translation adjustment for hledger
 * to balance.
 */
export const sidePostingsInCashAndPrizes = (outlay: Decimal, takings: Decimal): readonly Posting[] => [
  ...real(ACCOUNTS.playExpense, outlay),
  ...real(ACCOUNTS.playRevenue, negate(takings)),
  ...real(ACCOUNTS.cash, negate(outlay)),
  ...(isZero(takings) ? [] : [...real(ACCOUNTS.specialPrizes, rounded(takings, 0)), TRANSLATION_ADJUSTMENT]),
]
