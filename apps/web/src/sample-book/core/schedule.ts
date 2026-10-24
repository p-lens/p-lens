import type { IsoDate } from "../../core/calendar/calendar"
import type { ClockTime } from "../../core/tally/tally"
import { chance, weighted, wholeBetween, type Draws, type Drawn } from "./draws"

const DAY_MILLIS = 86_400_000

const utcOf = (date: IsoDate): number => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)))

const dateAt = (millis: number): IsoDate => new Date(millis).toISOString().slice(0, 10) as IsoDate

/** How many days lie from one day to another, the first not counted: a day to itself is none. */
export const daysBetween = (from: IsoDate, to: IsoDate): number => Math.round((utcOf(to) - utcOf(from)) / DAY_MILLIS)

/** The day three years before the one after this one, so that from it to this day is three years to the day: 29 February goes back to the 28th. */
export const threeYearsTo = (through: IsoDate): IsoDate => {
  const back = `${String(Number(through.slice(0, 4)) - 3).padStart(4, "0")}${through.slice(4) === "-02-29" ? "-02-28" : through.slice(4)}` as IsoDate
  return dateAt(utcOf(back) + DAY_MILLIS)
}

/** Every day from one to another, both counted. */
export const daysFrom = (from: IsoDate, through: IsoDate): readonly IsoDate[] =>
  Array.from({ length: Math.max(0, daysBetween(from, through) + 1) }, (_, index) => dateAt(utcOf(from) + index * DAY_MILLIS))

/** A run of days alike, played or rested, and how likely it is against the other lengths. */
interface Run {
  readonly days: number
  readonly weight: number
}

/** How many days in a row are played, as a person who plays like work plays them: most often five. */
const WORKED_RUNS: readonly Run[] = [
  { days: 3, weight: 1 },
  { days: 4, weight: 2 },
  { days: 5, weight: 4 },
]

/** How many days in a row are rested between: most often two. */
const RESTED_RUNS: readonly Run[] = [
  { days: 2, weight: 4 },
  { days: 3, weight: 2 },
  { days: 4, weight: 1 },
]

/** Runs of played and rested days, one after the other, until they cover so many days: true where a day is played. */
const runsOver = (days: number, working: boolean, draws: Draws): Drawn<readonly boolean[]> => {
  if (days <= 0) return [[], draws]
  const [run, next] = weighted(draws, working ? WORKED_RUNS : RESTED_RUNS, (choice) => choice.weight)
  const length = Math.min(days, run?.days ?? 1)
  const [rest, after] = runsOver(days - length, !working, next)
  return [[...Array.from({ length }, () => working), ...rest], after]
}

/**
 * The days played between two days: runs of three to five days played and
 * two to four rested, one after the other — about four or five days a week,
 * on no weekday more than another, since the days parlors make much of
 * fall at weekends as often as not.
 */
export const playDaysOf = (from: IsoDate, through: IsoDate, draws: Draws): Drawn<readonly IsoDate[]> => {
  const days = daysFrom(from, through)
  const [startsWorking, next] = chance(draws, 0.5)
  const [played, after] = runsOver(days.length, startsWorking, next)
  return [days.filter((_, index) => played[index] === true), after]
}

/** A time of day as minutes after midnight. */
export type Minutes = number

/** When every day's play begins: as the doors open, at ten. */
export const OPENING: Minutes = 10 * 60

/** When a day's play ends, a quarter of an hour at a time from six to nine in the evening, most often between seven and eight. */
const CLOSINGS: readonly { readonly at: Minutes; readonly weight: number }[] = Array.from({ length: 13 }, (_, index) => 18 * 60 + index * 15).map((at) => ({
  at,
  weight: at < 19 * 60 ? 1 : at < 20 * 60 ? 3 : at < 21 * 60 ? 2 : 1,
}))

export const closingOf = (draws: Draws): Drawn<Minutes> => {
  const [closing, next] = weighted(draws, CLOSINGS, (choice) => choice.weight)
  return [closing?.at ?? 20 * 60, next]
}

/** How long lunch is taken for, on a day it is: on some days, half an hour to three quarters. */
export const lunchOf = (draws: Draws): Drawn<Minutes> => {
  const [taken, next] = chance(draws, 0.4)
  if (!taken) return [0, next]
  return wholeBetween(next, 30, 45)
}

/** When lunch is taken, where it is: the play running at noon pauses for it. */
export const NOON: Minutes = 12 * 60

/** How long moving from one machine to the next takes, and choosing it. */
export const moveOf = (draws: Draws): Drawn<Minutes> => wholeBetween(draws, 5, 15)

/** The least time worth sitting down at a machine for. */
export const SHORTEST_SITTING: Minutes = 30

export const clockTimeOf = (minutes: Minutes): ClockTime => ({
  hour: Math.floor(minutes / 60),
  minute: Math.floor(minutes % 60),
})
