import { YEN } from "../commodity/commodity"
import type { Decimal } from "../decimal/decimal"
import { ACCOUNTS } from "../journal/accounts"
import type { Posting } from "../journal/entry"

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
