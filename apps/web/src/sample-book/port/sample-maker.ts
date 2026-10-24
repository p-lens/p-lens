import type { IsoDate } from "../../core/calendar/calendar"
import type { Entry } from "../../core/journal/entry"
import type { Result } from "../../core/result/result"
import type { SampleWork, Tallied } from "../core/book"
import type { DayProblem } from "../core/day"

/** A day of a sample book as it is told while it is made: when, where, and at which machines. */
export interface DaySeen {
  readonly date: IsoDate
  readonly parlor: string
  readonly machines: readonly string[]
}

/** How far the days have got: so many of so many, the day just played where one was, and what they have come to so far. */
export interface DaysMade {
  readonly done: number
  readonly of: number
  readonly day: DaySeen | undefined
  readonly tallied: Tallied
}

/** Every day of a sample book played: its entries, oldest first, and what they came to. */
export interface Played {
  readonly entries: readonly Entry[]
  readonly tallied: Tallied
}

/** Who is told of each day as it is played, and the signal the person stops it by: stopped, the days stop at once. */
export interface DaysWatch {
  readonly onDay: (made: DaysMade) => void
  readonly stopped: AbortSignal
}

/** Why the days could not be played: a day that could not be written, or the place they are played in that could not be reached. */
export type PlayProblem = { readonly type: "day"; readonly problem: DayProblem } | { readonly type: "unreachable"; readonly detail: string }

/**
 * Where a sample book's days are played: away from the screen, which a
 * few years of draws would hold up. Nothing where the person stopped it.
 */
export interface SampleMaker {
  readonly play: (work: SampleWork, watch: DaysWatch) => Promise<Result<Played | undefined, PlayProblem>>
}
