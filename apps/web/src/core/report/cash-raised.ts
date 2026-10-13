import { YEN } from "../commodity/commodity"
import { isNegative, isZero, type Decimal } from "../decimal/decimal"
import { ACCOUNTS } from "../journal/accounts"
import type { Transaction } from "../../hledger/protocol/wire"
import { decimalOfQuantity } from "./figures"

/**
 * A posting that puts a positive amount to `資産:現金`: an entry saying
 * cash came in, which a book never says. A parlor gives prizes, never
 * money, so a gain is prizes taken home, in equity.
 */
export interface CashRaised {
  readonly date: string
  readonly description: string
  readonly amount: Decimal
}

const raises = (quantity: Decimal): boolean => !isZero(quantity) && !isNegative(quantity)

/** Every posting among these entries that raises cash, in the order they stand. */
export const cashRaisedIn = (transactions: readonly Transaction[]): readonly CashRaised[] =>
  transactions.flatMap((transaction) =>
    transaction.tpostings
      .filter((posting) => posting.paccount === ACCOUNTS.cash)
      .flatMap((posting) => posting.pamount.filter((amount) => amount.acommodity === YEN).map((amount) => decimalOfQuantity(amount.aquantity)))
      .filter(raises)
      .map((amount) => ({ date: transaction.tdate, description: transaction.tdescription, amount })),
  )

const keyOf = (raised: CashRaised): string => `${raised.date}\n${raised.description}\n${raised.amount.mantissa}e${raised.amount.places}`

const without = (raised: readonly CashRaised[], key: string): readonly CashRaised[] => {
  const at = raised.findIndex((each) => keyOf(each) === key)
  return at < 0 ? raised : [...raised.slice(0, at), ...raised.slice(at + 1)]
}

/**
 * The postings raising cash that a change brought into a book: those it
 * has after that it had not before, counted one for one. One a book
 * already held — written before cash was held never to rise — is not the
 * change's doing, and does not stop it.
 */
export const cashRaisedBy = (before: readonly CashRaised[], after: readonly CashRaised[]): readonly CashRaised[] =>
  after.reduce<{ readonly left: readonly CashRaised[]; readonly brought: readonly CashRaised[] }>(
    (state, raised) => {
      const key = keyOf(raised)
      return state.left.some((each) => keyOf(each) === key) ? { left: without(state.left, key), brought: state.brought } : { left: state.left, brought: [...state.brought, raised] }
    },
    { left: before, brought: [] },
  ).brought
