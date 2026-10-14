import type { BalanceReport } from "../../hledger/protocol/wire"
import { add, isZero, ZERO, type Decimal } from "../decimal/decimal"
import { readSavingsAccount } from "../journal/accounts"
import { andThen, collect, mapOk, type Result } from "../result/result"
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
  /** Each parlor's, by the name its savings are kept under; a parlor whose savings neither gained nor lost is not among them. */
  readonly byParlor: ReadonlyMap<string, Decimal>
}

const parlorOf = (name: unknown): string | undefined => (typeof name === "string" ? readSavingsAccount(name)?.parlorName : undefined)

/** A parlor's rows added together: its balls and its medals, at each of its rental rates, are savings accounts of their own. */
const together = (rows: readonly (readonly [string | undefined, Decimal])[]): ReadonlyMap<string, Decimal> =>
  rows.reduce<ReadonlyMap<string, Decimal>>((found, [parlor, yen]) => (parlor === undefined ? found : new Map([...found, [parlor, add(found.get(parlor) ?? ZERO, yen)]])), new Map())

/** A revaluation report read: its total, and its rows by the parlor each savings account is at. */
export const revaluationOf = (report: BalanceReport): Result<Revaluation, ReportError> =>
  andThen(yenOf(report.prTotals.prrTotal), (total) =>
    mapOk(collect(report.prRows.map((row) => mapOk(yenOf(row.prrTotal), (yen) => [parlorOf(row.prrName), yen] as const))), (rows) => ({
      total,
      byParlor: new Map([...together(rows)].filter(([, yen]) => !isZero(yen))),
    })),
  )
