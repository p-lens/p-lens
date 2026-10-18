import type { Tag, Transaction } from "../../hledger/protocol/wire"
import { parseIsoDate, type IsoDate } from "../calendar/calendar"
import { isNegative, negate, sum, ZERO, type Decimal } from "../decimal/decimal"
import { SAVINGS_TAG } from "../savings/balance"
import { TALLY_TAGS } from "../tally/tally"
import type { PricePoint } from "../valuation/valuation"
import { quantityIn } from "./figures"

/**
 * Why tokens came into or went out of a pool: a tally, by the machine it
 * names (none where it names none), or one of the entries about savings
 * alone; anything else is an entry written by hand, by its description.
 */
export type PassbookCause =
  | { readonly type: "tally"; readonly machine: string | undefined }
  | { readonly type: "opening" }
  | { readonly type: "adjustment" }
  | { readonly type: "prize-exchange" }
  | { readonly type: "forfeiture" }
  | { readonly type: "other"; readonly description: string }

/** One cause of a day's movements, its entries taken together: how many, and the tokens they put in and took out. */
export interface PassbookLine {
  readonly cause: PassbookCause
  readonly entries: number
  readonly deposited: Decimal
  readonly withdrawn: Decimal
}

/** A rate a pool was set to exchange at from a day, beside the one it had before, where it had one. */
export interface RateSet {
  readonly rate: Decimal
  readonly before: Decimal | undefined
}

/**
 * One day of a pool's passbook: the tokens put in and taken out, what the
 * pool held at its end, what moved them, by cause, and the rate it was set
 * to that day, where it was.
 */
export interface PassbookDay {
  readonly date: IsoDate
  readonly deposited: Decimal
  readonly withdrawn: Decimal
  readonly balance: Decimal
  readonly lines: readonly PassbookLine[]
  readonly rateSet: RateSet | undefined
}

const tagValue = (tags: readonly Tag[], name: string): string | undefined => tags.find(([tag]) => tag === name)?.[1]

const SAVINGS_CAUSES: Readonly<Record<string, PassbookCause>> = {
  opening: { type: "opening" },
  adjustment: { type: "adjustment" },
  "prize-exchange": { type: "prize-exchange" },
  forfeiture: { type: "forfeiture" },
}

const causeOf = (transaction: Transaction): PassbookCause => {
  if (tagValue(transaction.ttags, TALLY_TAGS.playId) !== undefined) return { type: "tally", machine: tagValue(transaction.ttags, TALLY_TAGS.machine) }
  return SAVINGS_CAUSES[tagValue(transaction.ttags, SAVINGS_TAG) ?? ""] ?? { type: "other", description: transaction.tdescription }
}

const causeKey = (cause: PassbookCause): string => (cause.type === "tally" ? `tally:${cause.machine ?? ""}` : cause.type === "other" ? `other:${cause.description}` : cause.type)

/** One entry's movements of the pool: each posting to its account apart, so a tally that drew on savings and put tokens back shows both. */
const movementOf = (transaction: Transaction, account: string, commodity: string): { readonly deposited: Decimal; readonly withdrawn: Decimal } => {
  const amounts = transaction.tpostings.filter((posting) => posting.paccount === account).map((posting) => quantityIn(posting.pamount, commodity))
  return { deposited: sum(amounts.filter((amount) => !isNegative(amount))), withdrawn: negate(sum(amounts.filter(isNegative))) }
}

interface Moved {
  readonly date: IsoDate
  readonly cause: PassbookCause
  readonly deposited: Decimal
  readonly withdrawn: Decimal
}

const linesOf = (moved: readonly Moved[]): readonly PassbookLine[] =>
  [...new Set(moved.map((each) => causeKey(each.cause)))].map((key) => {
    const same = moved.filter((each) => causeKey(each.cause) === key)
    return { cause: same[0]?.cause ?? { type: "other", description: "" }, entries: same.length, deposited: sum(same.map((each) => each.deposited)), withdrawn: sum(same.map((each) => each.withdrawn)) }
  })

/** The rate set on each day the pool's commodity has a price, the later written winning, beside the one before it. */
const ratesSetOf = (prices: readonly PricePoint[], commodity: string): ReadonlyMap<IsoDate, RateSet> => {
  const ordered = prices.map((point, at) => ({ point, at })).filter(({ point }) => point.commodity === commodity).sort((left, right) => (left.point.date < right.point.date ? -1 : left.point.date > right.point.date ? 1 : left.at - right.at))
  const lastOfDay = ordered.filter(({ point }, index) => ordered[index + 1]?.point.date !== point.date).map(({ point }) => point)
  return new Map(lastOfDay.map((point, index) => [point.date, { rate: point.rate, before: lastOfDay[index - 1]?.rate }]))
}

/**
 * A pool's passbook, newest day first: every day its account moved or its
 * rate was set, what moved in and out, by cause, and what it held at the
 * day's end. Read from the entries that post to the account and the book's
 * prices; nothing is worked out that hledger keeps.
 */
export const passbookOf = (transactions: readonly Transaction[], account: string, commodity: string, prices: readonly PricePoint[]): readonly PassbookDay[] => {
  const moved: readonly Moved[] = transactions.flatMap((transaction) => {
    const date = parseIsoDate(transaction.tdate)
    return date.ok ? [{ date: date.value, cause: causeOf(transaction), ...movementOf(transaction, account, commodity) }] : []
  })
  const rates = ratesSetOf(prices, commodity)
  const days = [...new Set([...moved.map((each) => each.date), ...rates.keys()])].sort()
  const ascending = days.reduce<readonly PassbookDay[]>((built, date) => {
    const ofDay = moved.filter((each) => each.date === date)
    const deposited = sum(ofDay.map((each) => each.deposited))
    const withdrawn = sum(ofDay.map((each) => each.withdrawn))
    const balance = sum([built.at(-1)?.balance ?? ZERO, deposited, negate(withdrawn)])
    return [...built, { date, deposited, withdrawn, balance, lines: linesOf(ofDay), rateSet: rates.get(date) }]
  }, [])
  return [...ascending].reverse()
}
