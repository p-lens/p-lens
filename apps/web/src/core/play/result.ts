import { ZERO, multiply, subtract, type Decimal } from "../decimal/decimal"
import type { PlayRecord } from "./play"

/**
 * What a play at a parlor came to in yen, at the rate its tokens exchange
 * for: the tokens it left over the savings its replay took and the tokens
 * it was begun with in hand, at the exchange, less the cash it spent. The book itself keeps the tokens and
 * leaves their worth to the rate of the day asked about; this is the figure
 * a person checks a play by as it is recorded, or set right.
 */
export const playResultOf = (record: PlayRecord, exchangeRate: Decimal): Decimal =>
  subtract(multiply(subtract(subtract(record.payout, record.replay.deducted), record.carriedIn), exchangeRate), record.rental?.outlay ?? ZERO)
