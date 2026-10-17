import type { BalanceReport } from "../../hledger/protocol/wire"
import type { Decimal } from "../decimal/decimal"
import { mapOk, type Result } from "../result/result"
import { yenOf, type ReportError } from "./figures"

/**
 * 評価損益: what savings gained or lost in yen over a period by their rate
 * changing and by nothing else — tokens held when a parlor's exchange rate
 * fell are worth less, though none was played or exchanged. No entry says
 * so and none is written: it follows from the rates and the savings a book
 * already holds, and hledger works it out when asked. It is no tally's
 * result, so it stands beside what the tallies made and is never part of it.
 */
export interface Revaluation {
  /** Every parlor's together, as hledger totals it. */
  readonly total: Decimal
}

/** A revaluation report read: its total, as hledger totals it. */
export const revaluationOf = (report: BalanceReport): Result<Revaluation, ReportError> => mapOk(yenOf(report.prTotals.prrTotal), (total) => ({ total }))
