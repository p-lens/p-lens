import type { IsoDate } from "../calendar/calendar"
import { tokenCommodity } from "../commodity/commodity"
import { negate, type Decimal } from "../decimal/decimal"
import { ACCOUNTS, savingsAccount } from "../journal/accounts"
import { describedBy, type Entry } from "../journal/entry"
import { identityTags, type Parlor, type SavingsPool } from "../parlor/parlor"

/** The tag an entry about savings and no tally carries, saying which it is: an opening balance, an adjustment, or a prize exchange. */
export const SAVINGS_TAG = "savings"

/**
 * The accounts savings are set against, as a book declares them. Neither is
 * revenue nor an expense: savings a person already had, and a count put
 * right, are no tally's result, so they are kept out of every income
 * statement, in equity.
 */
const EQUITY_DECLARATIONS = ["account 純資産                         ; type: E", `account ${ACCOUNTS.openingBalance}`, `account ${ACCOUNTS.balanceAdjustment}`, ""].join("\n")

/** Whether a book's accounts already declare what savings are set against. */
const declaresEquity = (accounts: string): boolean => accounts.split("\n").some((line) => line.startsWith(`account ${ACCOUNTS.openingBalance}`))

/** A book's accounts with what savings are set against declared, once: a book made before savings could be set has none. */
export const withEquityDeclared = (accounts: string): string => (declaresEquity(accounts) ? accounts : `${accounts.replace(/\n*$/, "")}\n\n${EQUITY_DECLARATIONS}`)

/** Savings at one pool of one parlor, on a day: where an entry that sets them writes. */
export interface SavingsAt {
  readonly parlor: Parlor
  readonly pool: SavingsPool
  readonly date: IsoDate
}

const settingEntry = (at: SavingsAt, what: "opening" | "adjustment", title: string, against: string, tokens: Decimal): Entry => {
  const commodity = tokenCommodity(at.pool.kind, at.parlor.name, at.pool.tier)
  return {
    date: at.date,
    description: describedBy(at.parlor.name, title),
    tags: [...identityTags(at.parlor.identity), [SAVINGS_TAG, what]],
    postings: [
      { account: savingsAccount(at.pool.kind, at.parlor.name, at.pool.tier), amount: { quantity: tokens, commodity }, kind: "real" },
      { account: against, amount: { quantity: negate(tokens), commodity }, kind: "real" },
    ],
  }
}

/** The savings a person already had at a pool when they began keeping the book, as one entry. */
export const openingBalanceEntry = (at: SavingsAt, tokens: Decimal): Entry => settingEntry(at, "opening", "開始残高", ACCOUNTS.openingBalance, tokens)

/** A pool's savings put right by so many tokens, more or fewer, as one entry: what the parlor says is there, where the book had drifted from it. */
export const balanceAdjustmentEntry = (at: SavingsAt, difference: Decimal): Entry => settingEntry(at, "adjustment", "残高調整", ACCOUNTS.balanceAdjustment, difference)
