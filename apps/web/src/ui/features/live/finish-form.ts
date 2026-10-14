import type { Finish, FinishCounter } from "../../../core/play-log/finish"
import { tidyTyped } from "../../../core/text/tidy"
import type { TimeOfDay } from "../../primitives/time-field"

/** How a play finished, as typed: the time of day on this device's clock, and the counter as text. */
export interface FinishForm {
  readonly time: TimeOfDay
  readonly counter: string
}

/** The time of day a moment is at on this device's clock. */
export const timeOf = (timestamp: string): TimeOfDay => {
  const moment = new Date(timestamp)
  return { hour: moment.getHours(), minute: moment.getMinutes() }
}

/** The form as a play is about to be recorded: finished now, on the counter as it was last read. */
export const finishFormOf = (now: string, read: FinishCounter | undefined): FinishForm => ({ time: timeOf(now), counter: read === undefined ? "" : String(read.count) })

const DAY = 24 * 60 * 60 * 1000

/**
 * The moment a time of day names for a play begun at `startedAt`: that
 * time on the day the play began, or on the day after where it would
 * otherwise fall before the beginning — a play that ran past midnight.
 */
export const finishedAt = (startedAt: string, time: TimeOfDay): string => {
  const began = new Date(startedAt)
  const sameDay = new Date(began.getFullYear(), began.getMonth(), began.getDate(), time.hour, time.minute)
  return new Date(sameDay.getTime() < began.getTime() - 60_000 ? sameDay.getTime() + DAY : sameDay.getTime()).toISOString()
}

const COUNT = /^\d+$/

const readCounter = (typed: string): number | undefined => {
  const plain = tidyTyped(typed).replaceAll(",", "")
  return COUNT.test(plain) ? Number(plain) : undefined
}

/** Whether the counter typed is one a play can finish on: left empty, or a count no less than it was last read at. */
export const counterStands = (form: FinishForm, read: FinishCounter | undefined): boolean => {
  const counter = readCounter(form.counter)
  return tidyTyped(form.counter) === "" || (counter !== undefined && (read === undefined || counter >= read.count))
}

/** The form read: the moment its time names for a play begun at `startedAt`, and the counter where it holds one. */
export const readFinishForm = (form: FinishForm, startedAt: string): Finish => ({ at: finishedAt(startedAt, form.time), counter: readCounter(form.counter) })
