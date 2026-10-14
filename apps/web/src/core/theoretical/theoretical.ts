import { YEN } from "../commodity/commodity"
import { decimal, type Decimal } from "../decimal/decimal"
import { ACCOUNTS } from "../journal/accounts"
import type { Entry, Posting } from "../journal/entry"

/** The places a theoretical value worked out in floating point is written to: fine enough that a book keeps what was worked out, not whole yen. */
const THEORETICAL_PLACES = 6

/** A theoretical value worked out in floating point, as a book keeps it: to six places, its trailing zeros dropped. */
export const theoreticalDecimalOf = (value: number): Decimal => decimal(BigInt(Math.round(value * 10 ** THEORETICAL_PLACES)), THEORETICAL_PLACES)

/**
 * The theoretical value of a play, as a posting.
 *
 * Neither money nor a promise of money, so never a real posting: a virtual one
 * on an account with no type. hledger sums it when asked about
 * `統計:期待値` and leaves it out of every balanced report, which is what
 * keeps it apart from what was actually won or lost.
 */
export const theoreticalValuePosting = (value: Decimal): Posting => ({
  account: ACCOUNTS.theoreticalValue,
  amount: { quantity: value, commodity: YEN },
  kind: "virtual",
})

/**
 * A theoretical value nobody measured, as a posting: what a play told of
 * afterwards was taken to be worth, from its hours and its two sides. On
 * an account of its own under the measured one's, so hledger sums the two
 * together when asked about `統計:期待値` and apart when asked about
 * either, and what was inferred can always be told from what was measured.
 */
export const inferredTheoreticalValuePosting = (value: Decimal): Posting => ({
  account: ACCOUNTS.inferredTheoreticalValue,
  amount: { quantity: value, commodity: YEN },
  kind: "virtual",
})

const declares = (accounts: string, account: string): boolean => accounts.split("\n").some((line) => line.trim() === `account ${account}`)

/**
 * A book's accounts as an entry needs them: with the inferred theoretical
 * value's account declared where the entry posts to it and the book has
 * not got it — a book made before anything was inferred has none — and as
 * they were otherwise.
 */
export const withInferredDeclaredFor = (accounts: string, entry: Entry): string =>
  entry.postings.some((posting) => posting.account === ACCOUNTS.inferredTheoreticalValue) && !declares(accounts, ACCOUNTS.inferredTheoreticalValue)
    ? `${accounts.replace(/\n*$/, "")}\naccount ${ACCOUNTS.inferredTheoreticalValue}\n`
    : accounts
