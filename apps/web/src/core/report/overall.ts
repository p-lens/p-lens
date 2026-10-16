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
 * and what it made, what they made and were worth, what they took in and
 * gave back, what renting and replaying tokens cost, the time they were played for, the cash they took,
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
  /** 通算投資: what the tallies took in — cash and savings alike, at the rate of the day each went in — every expense. */
  readonly spent: Decimal
  /** 通算回収: what they gave back, at the rate of its day — their revenue. */
  readonly returned: Decimal
  /** 通算貸玉差額: the loss on renting tokens above their exchange value. */
  readonly rentalSpread: Decimal
  /** 通算再プレイ手数料: what replaying savings cost, at the rate of its day. */
  readonly replayFee: Decimal
  /** 通算時間: the seconds the tallies were played for, as their entries keep them; none where no entry keeps any. */
  readonly playSeconds: Decimal | undefined
  readonly specialPrizes: Decimal
  readonly oddPrizes: Decimal
  /** 換算調整勘定: the part of a yen taken home beside the prizes, which are whole yen. */
  readonly translationAdjustment: Decimal
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

/** 景品等合計: what was taken home — special and odd prizes, and the part of a yen beside them. */
export const prizesOf = (overall: Overall): Decimal => add(add(overall.specialPrizes, overall.oddPrizes), overall.translationAdjustment)

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
    spent: added((book) => book.spent),
    returned: added((book) => book.returned),
    rentalSpread: added((book) => book.rentalSpread),
    replayFee: added((book) => book.replayFee),
    playSeconds: books.some((book) => book.playSeconds !== undefined) ? sum(books.flatMap((book) => (book.playSeconds === undefined ? [] : [book.playSeconds]))) : undefined,
    specialPrizes: added((book) => book.specialPrizes),
    oddPrizes: added((book) => book.oddPrizes),
    translationAdjustment: added((book) => book.translationAdjustment),
    savingsDrawn: added((book) => book.savingsDrawn),
  }
}
