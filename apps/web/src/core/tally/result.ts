import { ZERO, multiply, subtract, type Decimal } from "../decimal/decimal"
import type { TokenTally } from "./tally"

/**
 * What a tally in tokens came to in yen, at the rate its tokens exchange
 * for: the tokens its play left over the savings its replay took and the
 * tokens it was begun with in hand, at the exchange, less the cash it
 * spent. The book itself keeps the tokens and leaves their worth to the
 * rate of the day asked about; this is the figure a person checks a tally
 * by as it is recorded, or set right.
 */
export const tokenTallyResultOf = (tally: TokenTally, exchangeRate: Decimal): Decimal =>
  subtract(multiply(subtract(subtract(tally.payout, tally.replay.deducted), tally.carriedIn), exchangeRate), tally.rental?.outlay ?? ZERO)
