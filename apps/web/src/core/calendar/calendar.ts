import { Err, Ok, type Result } from "../result/result"

/**
 * A calendar day as hledger writes one, `YYYY-MM-DD`. A day and nothing more:
 * no time and no zone, because a play happens on a day at a parlor.
 */
export type IsoDate = string & { readonly __brand: "IsoDate" }

/** A calendar month, `YYYY-MM`, as an hledger query term names one. */
export type IsoMonth = string & { readonly __brand: "IsoMonth" }

export interface NotADate {
  readonly type: "not-a-date"
  readonly text: string
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

const utcDayOf = (year: number, month: number, day: number): Date => new Date(Date.UTC(year, month - 1, day))

const formatUtcDay = (date: Date): IsoDate => date.toISOString().slice(0, 10) as IsoDate

/** Accept only a day that exists: `2026-02-30` is refused, not rolled over. */
export const parseIsoDate = (text: string): Result<IsoDate, NotADate> => {
  const match = ISO_DATE.exec(text)
  if (match === null) return Err({ type: "not-a-date", text })
  const [, year = "", month = "", day = ""] = match
  return formatUtcDay(utcDayOf(Number(year), Number(month), Number(day))) === text
    ? Ok(text as IsoDate)
    : Err({ type: "not-a-date", text })
}

export const nextDay = (date: IsoDate): IsoDate => {
  const [year = 0, month = 0, day = 0] = date.split("-").map(Number)
  return formatUtcDay(utcDayOf(year, month, day + 1))
}

export const previousDay = (date: IsoDate): IsoDate => {
  const [year = 0, month = 0, day = 0] = date.split("-").map(Number)
  return formatUtcDay(utcDayOf(year, month, day - 1))
}

export const monthOf = (date: IsoDate): IsoMonth => date.slice(0, 7) as IsoMonth

/**
 * The day it is where the person is, read off a clock reading.
 *
 * The local day rather than UTC's: just after midnight in Japan it is still
 * yesterday in UTC, and a play recorded then belongs to today.
 */
export const localDayOf = (moment: Date): IsoDate =>
  formatUtcDay(utcDayOf(moment.getFullYear(), moment.getMonth() + 1, moment.getDate()))

/**
 * The hours a business day may turn over at: midnight, which makes it the
 * calendar's day, to nine in the morning. No later, because a play added by
 * hand is placed at nine in its day, and must fall inside it.
 */
export const BUSINESS_DAY_TURNS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const

/** The hour of the morning a business day turns over at. */
export type BusinessDayTurn = (typeof BUSINESS_DAY_TURNS)[number]

/** Five in the morning, until a person says otherwise: after the last parlor has closed, before the first opens. */
export const DEFAULT_BUSINESS_DAY_TURN: BusinessDayTurn = 5

/** Whether an hour is one a business day may turn over at. */
export const isBusinessDayTurn = (hour: number): hour is BusinessDayTurn => (BUSINESS_DAY_TURNS as readonly number[]).includes(hour)

/** The hour a person chose, as it was kept; anything else kept there is the default. */
export const readBusinessDayTurn = (stored: string | undefined): BusinessDayTurn => {
  const hour = stored === undefined || stored.trim() === "" ? Number.NaN : Number(stored)
  return isBusinessDayTurn(hour) ? hour : DEFAULT_BUSINESS_DAY_TURN
}

const HOUR_MILLIS = 60 * 60 * 1000

/**
 * The business day it is where the person is: the day a play belongs to.
 * It turns over at an hour of the morning, not at midnight, so a play still
 * going at two is the day before's, as the parlor and the player count it.
 */
export const businessDayOf = (moment: Date, turnsAt: BusinessDayTurn): IsoDate => localDayOf(new Date(moment.getTime() - turnsAt * HOUR_MILLIS))
