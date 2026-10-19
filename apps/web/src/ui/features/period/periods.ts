import { parseIsoDate, previousDay, type IsoDate } from "../../../core/calendar/calendar"
import { rangeTerm } from "../../../hledger/query/terms"

/**
 * The period a view is asked about, and all a period is: the first day and
 * the last, both included, either left open. With neither it is every day
 * there is. Whatever names a period — today, this month — is only a way
 * of filling these two in.
 */
export interface DateRange {
  readonly from: IsoDate | undefined
  readonly to: IsoDate | undefined
}

/** Every day there is: both ends open, which is what the fields say when neither is filled in. */
export const EVERY_DAY: DateRange = { from: undefined, to: undefined }

/** The hledger query that is a range, as it is written into the address. */
export const queryOf = (range: DateRange): string => rangeTerm(range.from, range.to)

const RANGE_QUERY = /^date:(\d{4}-\d{2}-\d{2})?\.\.(\d{4}-\d{2}-\d{2})?$/

const dayOf = (text: string | undefined): IsoDate | undefined => ((read) => (read.ok ? read.value : undefined))(parseIsoDate(text ?? ""))

/**
 * The range an address's query is, read back for the two fields: every day
 * for no query, and the days a query written by `queryOf` says. None for
 * any other query — one typed into the address by hand — which still
 * stands as the address says it, with the fields saying nothing.
 */
export const rangeOf = (query: string): DateRange | undefined => {
  if (query === "") return EVERY_DAY
  const found = RANGE_QUERY.exec(query)
  const [from, after] = [dayOf(found?.[1]), dayOf(found?.[2])]
  const said = (text: string | undefined, read: IsoDate | undefined): boolean => text === undefined || read !== undefined
  return found === null || !said(found[1], from) || !said(found[2], after) || (from === undefined && after === undefined) ? undefined : { from, to: after === undefined ? undefined : previousDay(after) }
}

export const sameRange = (left: DateRange, right: DateRange): boolean => left.from === right.from && left.to === right.to

const lastDayOfMonth = (day: IsoDate): IsoDate => {
  const [year = 0, month = 1] = day.split("-").map(Number)
  return `${day.slice(0, 7)}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0")}` as IsoDate
}

/** What a grouping by period groups into: whole months, or whole years. */
export type Span = "month" | "year"

const firstDayOf = (day: IsoDate, span: Span): IsoDate => (span === "year" ? `${day.slice(0, 4)}-01-01` : `${day.slice(0, 7)}-01`) as IsoDate

const lastDayOf = (day: IsoDate, span: Span): IsoDate => (span === "year" ? (`${day.slice(0, 4)}-12-31` as IsoDate) : lastDayOfMonth(day))

/**
 * A range widened to whole months, or whole years: back to the first day
 * of the one it begins in and on to the last day of the one it ends in.
 * A grouping by month or by year is asked about these days, not the days
 * typed, so that every row is a whole month, or year, and never the part
 * of one a range happened to cut. An end left open stays open.
 */
export const widened = (range: DateRange, span: Span): DateRange => ({ from: range.from === undefined ? undefined : firstDayOf(range.from, span), to: range.to === undefined ? undefined : lastDayOf(range.to, span) })

/** The span a way of grouping groups into, where it groups by one: nothing for a grouping that takes the days as typed. */
const spanOf = (by: string): Span | undefined => (by === "month" || by === "year" ? by : undefined)

/**
 * The query a grouping is asked with, from the query the address has: the
 * address's range widened to the grouping's whole months or years, and
 * the address's own query for every other grouping, or where it is no
 * range of ours.
 */
export const queryFor = (by: string, query: string): string => {
  const [range, span] = [rangeOf(query), spanOf(by)]
  return range === undefined || span === undefined ? query : queryOf(widened(range, span))
}

/** The days a grouping is asked about where they are not the days typed: the widened range, and the span it was widened to. None where the two are the same days. */
export const widenedFor = (by: string, query: string): { readonly span: Span; readonly range: DateRange } | undefined => {
  const [range, span] = [rangeOf(query), spanOf(by)]
  if (range === undefined || span === undefined) return undefined
  const wide = widened(range, span)
  return sameRange(wide, range) ? undefined : { span, range: wide }
}

/** A range under a short name, pressed to fill the two fields in. */
export interface Shortcut {
  readonly id: string
  readonly label: string
  readonly range: DateRange
}

/**
 * The ranges offered by name on a business day: that day, its month and
 * its year. 本日 is the business day, which past midnight is still the day
 * before. Every day there is has no name: it is the fields left empty.
 */
export const shortcutsOn = (today: IsoDate): readonly Shortcut[] => [
  { id: "today", label: "本日", range: { from: today, to: today } },
  { id: "month", label: "今月", range: { from: `${today.slice(0, 7)}-01` as IsoDate, to: lastDayOfMonth(today) } },
  { id: "year", label: "今年", range: yearOf(today) },
]

/** The year a business day is in, from its first day to its last. */
export const yearOf = (today: IsoDate): DateRange => ({ from: `${today.slice(0, 4)}-01-01` as IsoDate, to: `${today.slice(0, 4)}-12-31` as IsoDate })

/**
 * What 集計 opens on, alone and consolidated, when it is opened rather than
 * gone to with a period: the year of the business day. Every day there is
 * reads every book through, where a year reads that year's.
 */
export const openingQueryOn = (today: IsoDate): string => queryOf(yearOf(today))
