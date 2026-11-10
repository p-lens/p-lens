import { parseIsoDate, type IsoDate } from "../../core/calendar/calendar"
import { parseDecimal, type Decimal } from "../../core/decimal/decimal"
import { Err, Ok, andThen, type Result } from "../../core/result/result"
import { playsOf, taggedOf, type MaxbetProblem, type MaxbetTallies, type Tagged } from "./tags"

/** Japan's hours ahead of UTC, in milliseconds: MAXBET is a Japanese app, keeping a day as its midnight there. */
const JAPAN_AHEAD = 9 * 60 * 60 * 1000

/**
 * A backup's moment as the day it falls on in Japan: MAXBET writes a
 * tally's day as that day's midnight in UTC, `2026-11-03T15:00:00Z` for
 * the 4th, as its CSV writes `2026/11/04`.
 */
const japanDayOf = (moment: unknown): IsoDate | undefined => {
  const time = typeof moment === "string" ? Date.parse(moment) : Number.NaN
  const day = Number.isNaN(time) ? undefined : parseIsoDate(new Date(time + JAPAN_AHEAD).toISOString().slice(0, 10))
  return day?.ok === true ? day.value : undefined
}

/** A sum of yen as a backup holds it: a whole number, not below nothing. */
const backupYenOf = (value: unknown): Decimal | undefined => {
  const parsed = typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? parseDecimal(String(value)) : undefined
  return parsed?.ok === true ? parsed.value : undefined
}

const fieldOf = (record: unknown, name: string): unknown => (typeof record === "object" && record !== null ? (record as Record<string, unknown>)[name] : undefined)

/** A record's tags' titles, each once in its order; none where it has none, and not read where they are not a list of titled tags. */
const tagsOf = (tags: unknown): readonly string[] | undefined => {
  if (tags === undefined || tags === null) return []
  if (!Array.isArray(tags)) return undefined
  const titles = tags.map((tag) => fieldOf(tag, "title"))
  return titles.every((title) => typeof title === "string") ? [...new Set(titles.map((title) => title.trim()))].filter((title) => title !== "") : undefined
}

const memoOf = (memo: unknown): string | undefined => (memo === undefined || memo === null ? "" : typeof memo === "string" ? memo : undefined)

/** One record of a backup as a tally, or none where it lacks what a tally needs. */
const recordOf = (record: unknown): Tagged | undefined => {
  const [date, outlay, takings, tags, memo] = [japanDayOf(fieldOf(record, "date")), backupYenOf(fieldOf(record, "expense")), backupYenOf(fieldOf(record, "revenue")), tagsOf(fieldOf(record, "tags")), memoOf(fieldOf(record, "memo"))]
  return date === undefined || outlay === undefined || takings === undefined || tags === undefined || memo === undefined ? undefined : taggedOf(date, outlay, takings, tags, memo)
}

const parsedOf = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

const readRecords = (text: string): Result<readonly Tagged[], MaxbetProblem> => {
  const parsed = parsedOf(text)
  if (!Array.isArray(parsed)) return Err({ type: "not-maxbet" })
  if (parsed.length === 0) return Err({ type: "empty" })
  const read = parsed.map(recordOf)
  const unreadable = read.flatMap((tally, index) => (tally === undefined ? [index + 1] : []))
  return unreadable.length > 0 ? Err({ type: "records-unreadable", records: unreadable }) : Ok(read.flatMap((tally) => (tally === undefined ? [] : [tally])))
}


const BYTE_ORDER_MARK = /^\uFEFF/

/** A MAXBET file as its backup, which is a JSON list, and not its CSV. */
export const isMaxbetJson = (text: string): boolean => text.replace(BYTE_ORDER_MARK, "").trimStart().startsWith("[")

/**
 * The tallies of play MAXBET's backup holds, a JSON list of its records in
 * the file's order — iOS's and Android's alike, whose tags go by ids of
 * their own and by numbers — or why it is not taken in.
 */
export const readMaxbetJson = (text: string): Result<MaxbetTallies, MaxbetProblem> => andThen(readRecords(text.replace(BYTE_ORDER_MARK, "")), playsOf)
