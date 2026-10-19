import type { IsoDate } from "../calendar/calendar"
import { entryDaysOf, isTransactionsFile } from "./filing"
import { BOOK_FILES, type BookFiles } from "./layout"

/**
 * A book seen for a question about some days: the files hledger is to read
 * for it, which are fewer than the book's where some of its transactions
 * cannot bear on the answer. A view leaves out only what the question would
 * not count — the book is one timeline, and a view is that timeline with
 * the stretches the question never reaches not read — so whatever is asked
 * of a view is answered as the book would answer it.
 */

/** The days a question is about: from a first day, up to a day it stops before, either left open. */
export interface Days {
  readonly from: IsoDate | undefined
  readonly until: IsoDate | undefined
}

/** What a question counts: what moved within its days, or what stood at their end, everything before them counted. */
export type Need = "moved" | "stood"

const RANGE = /^date:(\d{4}-\d{2}-\d{2})?\.\.(\d{4}-\d{2}-\d{2})?$/
const MONTH = /^date:(\d{4})-(\d{2})$/
const YEAR = /^date:(\d{4})$/

const monthAfter = (year: number, month: number): IsoDate => (month === 12 ? `${String(year + 1)}-01-01` : `${String(year)}-${String(month + 1).padStart(2, "0")}-01`) as IsoDate

/**
 * The days of a query as the app writes one for a period: every day for
 * none, a range of days, a month or a year. None for any other query, which
 * is asked of the whole book.
 */
export const daysOfQuery = (query: string): Days | undefined => {
  if (query === "") return { from: undefined, until: undefined }
  const range = RANGE.exec(query)
  if (range !== null) return { from: range[1] as IsoDate | undefined, until: range[2] as IsoDate | undefined }
  const month = MONTH.exec(query)
  if (month !== null) return { from: `${month[1] ?? ""}-${month[2] ?? ""}-01` as IsoDate, until: monthAfter(Number(month[1]), Number(month[2])) }
  const year = YEAR.exec(query)
  return year === null ? undefined : { from: `${year[1] ?? ""}-01-01` as IsoDate, until: `${String(Number(year[1]) + 1)}-01-01` as IsoDate }
}

/** Whether an entry of a day can bear on a question about these days. */
const counted = (day: IsoDate, days: Days, need: Need): boolean => (days.until === undefined || day < days.until) && (need === "stood" || days.from === undefined || day >= days.from)

const INCLUDE = /^include\s+(\S+)/

/**
 * A book's files as hledger is to read them for a question about some
 * days: every file but those of transactions, and of those, each with an
 * entry the question can count — within the days for what moved, before
 * their end for what stood — under a main journal including just those, in
 * its order. None where nothing would be left out, or where a file of
 * transactions holds anything but the entries the app writes, which may
 * bear on any day.
 */
export const viewOf = (files: BookFiles, days: Days, need: Need): BookFiles | undefined => {
  const transactions = Object.keys(files).filter(isTransactionsFile)
  const entryDays = transactions.map((path) => [path, entryDaysOf(files[path] ?? "")] as const)
  if (entryDays.some(([, found]) => found === undefined)) return undefined
  const left = entryDays.filter(([, found]) => (found ?? []).length > 0 && !(found ?? []).some((day) => counted(day, days, need))).map(([path]) => path)
  if (left.length === 0) return undefined
  const main = (files[BOOK_FILES.main] ?? "")
    .split("\n")
    .filter((line) => !left.includes(INCLUDE.exec(line)?.[1] ?? ""))
    .join("\n")
  return { ...Object.fromEntries(Object.entries(files).filter(([path]) => !left.includes(path))), [BOOK_FILES.main]: main }
}
