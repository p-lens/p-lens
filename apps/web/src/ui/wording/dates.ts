import { type BusinessDayTurn, DEFAULT_BUSINESS_DAY_TURN, type IsoDate } from "../../core/calendar/calendar"

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const

/** `2026-10-03` as `10月3日(土)`: a day of the year in hand. */
export const formatDayOfYear = (date: IsoDate): string => {
  const [year = 0, month = 0, day = 0] = date.split("-").map(Number)
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? ""
  return `${month}月${day}日(${weekday})`
}

/** `2026-10-03` as `2026年10月3日(土)`. */
export const formatDay = (date: IsoDate): string => `${Number(date.slice(0, 4))}年${formatDayOfYear(date)}`

/**
 * Which day "today" is, said beside it where the calendar has moved on and
 * the business day has not: past midnight, a day's plays are still the day
 * before's. Nothing while the two are the same day.
 */
export const businessDayNote = (businessDay: IsoDate, today: IsoDate): string | undefined => (businessDay === today ? undefined : formatDayOfYear(businessDay))

/** An ISO timestamp as the local date and time it was, `10/3 13:42`. */
export const formatMoment = (timestamp: string): string => {
  const moment = new Date(timestamp)
  const pad = (value: number): string => String(value).padStart(2, "0")
  return `${moment.getMonth() + 1}/${moment.getDate()} ${pad(moment.getHours())}:${pad(moment.getMinutes())}`
}

/** An hour a business day turns over at, as a person chooses it: midnight says it is the calendar's own day, five that it is the usual one. */
export const businessDayTurnText = (turn: BusinessDayTurn): string => {
  if (turn === 0) return "0:00（暦の日付どおり）"
  return turn === DEFAULT_BUSINESS_DAY_TURN ? `${turn}:00（標準）` : `${turn}:00`
}
