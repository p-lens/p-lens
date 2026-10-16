import type { IsoDate } from "../calendar/calendar"
import { ZERO, add, compare, decimal, quotient, sum, type Decimal } from "../decimal/decimal"

/** What a period's tallies made on one business day, as hledger sums the day. */
export interface DayResult {
  readonly day: IsoDate
  readonly actual: Decimal
}

/**
 * A period's tallies taken as one, every figure from hledger: how many
 * there were and how many made something, each day they were played on
 * and what it made, what they made and were worth, the cash they took,
 * the prizes taken home in the period, and the savings they drew on, in
 * yen at the rate of the day each was drawn.
 */
export interface Overall {
  readonly plays: number
  readonly playsWon: number
  readonly days: readonly DayResult[]
  readonly actual: Decimal
  readonly theoretical: Decimal
  /** The part of `theoretical` that was inferred from what was told of tallies' plays, not measured. */
  readonly inferred: Decimal
  readonly cash: Decimal
  readonly specialPrizes: Decimal
  readonly oddPrizes: Decimal
  readonly savingsDrawn: Decimal
}

/** Whether a result is a win: more came back than went in. */
const won = (actual: Decimal): boolean => compare(actual, ZERO) > 0

/** The days some tallies were played on that made something. */
export const daysWonOf = (overall: Overall): number => overall.days.filter((day) => won(day.actual)).length

/** A share as a ratio, or none where there is nothing to take a share of. */
export const shareOf = (part: number, whole: number): number | undefined => (whole === 0 ? undefined : part / whole)

/** A total over so many, to the yen; none where there are none. */
export const averageOf = (total: Decimal, count: number): Decimal | undefined => (count === 0 ? undefined : quotient(total, decimal(BigInt(count), 0), 0))

/** The prizes taken home: special and odd together. */
export const prizesOf = (overall: Overall): Decimal => add(overall.specialPrizes, overall.oddPrizes)

/** Several books' periods as one: counts and sums added, and a day played in more than one book one day, its results added. */
export const mergedOverall = (books: readonly Overall[]): Overall => {
  const days = [...new Set(books.flatMap((book) => book.days.map((each) => each.day)))].toSorted().map((day) => ({ day, actual: sum(books.flatMap((book) => book.days.filter((each) => each.day === day).map((each) => each.actual))) }))
  const added = (pick: (book: Overall) => Decimal): Decimal => sum(books.map(pick))
  return {
    plays: books.reduce((total, book) => total + book.plays, 0),
    playsWon: books.reduce((total, book) => total + book.playsWon, 0),
    days,
    actual: added((book) => book.actual),
    theoretical: added((book) => book.theoretical),
    inferred: added((book) => book.inferred),
    cash: added((book) => book.cash),
    specialPrizes: added((book) => book.specialPrizes),
    oddPrizes: added((book) => book.oddPrizes),
    savingsDrawn: added((book) => book.savingsDrawn),
  }
}
