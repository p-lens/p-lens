import type { IsoDate } from "../calendar/calendar"
import { journalsOf, type BookFiles } from "../journal/layout"

const PRICE = /^P\s/
const DATED_PRICE = /^P (\d{4}-\d{2}-\d{2}) /

/**
 * The last day on or before a day that a book sets any rate on, as its
 * price lines say, or none where it sets none by then: what a value
 * standing on that day is read at, so that two days with the same last
 * rate value the book's savings alike. The day itself where some price
 * line is not written as the app writes one, which could set a rate on
 * any day.
 */
export const lastRateDayOf = (files: BookFiles, day: IsoDate): string => {
  const lines = journalsOf(files).flatMap(([, text]) => text.split("\n").filter((line) => PRICE.test(line)))
  const days = lines.map((line) => DATED_PRICE.exec(line)?.[1])
  if (days.some((found) => found === undefined)) return day
  const latest = days.filter((found): found is string => found !== undefined && found <= day).reduce((last, found) => (found > last ? found : last), "")
  return latest === "" ? "none" : latest
}
