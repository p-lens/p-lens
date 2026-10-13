import type { IsoDate } from "../calendar/calendar"
import { tokenCommodity, type TokenKind } from "../commodity/commodity"
import { isNegative, isZero, negate, type Decimal } from "../decimal/decimal"
import { ACCOUNTS, savingsAccount } from "../journal/accounts"
import { describedBy, type Entry } from "../journal/entry"
import { identityTags, type Parlor, type SavingsPool } from "../parlor/parlor"
import { Err, Ok, type Result } from "../result/result"
import { SAVINGS_TAG } from "./balance"

/**
 * Savings a parlor took back: so many tokens out of one pool on a day,
 * with nothing given for them — savings left past the day a parlor keeps
 * them to, or a membership withdrawn and the card with it, which is a
 * lapse of another kind. The tokens are gone either way, and the book has
 * one word for it: 失効, on screen and on the entry, written to 失効損,
 * the loss it is, named as a book names a loss. It is a loss,
 * as large as the tokens were worth, and no play's: nothing was played
 * for it, so it stands under no machine and is counted in the results of
 * its day like any other expense.
 */
export interface Forfeiture {
  readonly parlor: Parlor
  readonly pool: SavingsPool
  readonly date: IsoDate
  readonly tokens: Decimal
}

/**
 * Why a forfeiture cannot be written.
 *
 * - `savings-short`: the pool holds fewer tokens by that day than were said to be taken.
 */
export type ForfeitureProblem = { readonly type: "nothing-forfeited" } | { readonly type: "fractional-tokens" } | { readonly type: "savings-short"; readonly kind: TokenKind; readonly held: Decimal }

const declares = (accounts: string): boolean => accounts.split("\n").some((line) => line.startsWith(`account ${ACCOUNTS.forfeiture}`))

/** A book's accounts with the forfeiture's declared, once: a book declares it when it first has one to write. */
export const withForfeitureDeclared = (accounts: string): string => (declares(accounts) ? accounts : `${accounts.replace(/\n*$/, "")}\naccount ${ACCOUNTS.forfeiture}\n`)

/**
 * A forfeiture as one journal entry, in tokens only, as a replay's fee is:
 * the tokens leave savings and are an expense, and what they come to in
 * yen is hledger's to say at the rate of the day. Cash is not touched —
 * none was paid — and no prize is said to have been handed over.
 */
export const forfeitureEntry = (forfeiture: Forfeiture): Result<Entry, ForfeitureProblem> => {
  if (isZero(forfeiture.tokens) || isNegative(forfeiture.tokens)) return Err({ type: "nothing-forfeited" })
  if (forfeiture.tokens.places > 0) return Err({ type: "fractional-tokens" })
  const commodity = tokenCommodity(forfeiture.pool.kind, forfeiture.parlor.name, forfeiture.pool.tier)
  return Ok({
    date: forfeiture.date,
    description: describedBy(forfeiture.parlor.name, "失効"),
    tags: [...identityTags(forfeiture.parlor.identity), [SAVINGS_TAG, "forfeiture"]],
    postings: [
      { account: ACCOUNTS.forfeiture, amount: { quantity: forfeiture.tokens, commodity }, kind: "real" },
      { account: savingsAccount(forfeiture.pool.kind, forfeiture.parlor.name, forfeiture.pool.tier), amount: { quantity: negate(forfeiture.tokens), commodity }, kind: "real" },
    ],
  })
}
