import { add, isZero, ZERO, type Decimal } from "../decimal/decimal"
import type { Revaluation } from "./revaluation"

/**
 * その他損益: what a period gained or lost besides its plays — the savings
 * a parlor took back (失効損), an expense in 収支 that is no play's, and
 * the savings' revaluation (評価損益), which nothing writes and which is
 * never added into 収支. They are listed together and never summed: the
 * one is in 収支 and the other is not.
 */
export interface OtherGains {
  /** 失効損 in yen at the rate of its day: a loss, so never below nought. */
  readonly forfeited: Decimal
  readonly revaluation: Revaluation
}

/** Whether a period has any to show: a rate seldom changes and savings seldom lapse. */
export const hasOtherGains = (gains: OtherGains): boolean => !isZero(gains.forfeited) || !isZero(gains.revaluation.total)

/** Several books' as one: each sum added. */
export const mergedOtherGains = (books: readonly OtherGains[]): OtherGains => ({
  forfeited: books.reduce((total, book) => add(total, book.forfeited), ZERO),
  revaluation: { total: books.reduce((total, book) => add(total, book.revaluation.total), ZERO) },
})
