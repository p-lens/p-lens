import type { IsoDate } from "../../../core/calendar/calendar"
import { UNSAID, type Dimension } from "../../../core/report/breakdown"
import { narrowedTo, type NarrowedBy, type Narrowing } from "../../../core/report/narrowing"
import { queryOf, widened } from "../period/periods"

/** Where a group's row goes when pressed: the breakdown it opens, narrowed and over the days it asks about. */
export interface Drilled {
  readonly by: Dimension
  readonly narrowing: Narrowing
  readonly query: string
}

/** The dimension a group of one is looked into by, narrowed to it: a game by parlor, a parlor by machine, a machine by parlor. */
const INTO: Readonly<Record<Exclude<NarrowedBy, "rate">, Dimension>> = { game: "parlor", parlor: "machine", machine: "parlor" }

/**
 * Where a group's row goes: a game, a parlor or a machine to the breakdown
 * narrowed to it as well, by the dimension it is looked into by; a year to
 * its months and a month to its days, over its own days. A day, a day of
 * the week and the group of tallies that do not say what is asked go
 * nowhere.
 */
export const drilledFrom = (dimension: Dimension, key: string, narrowing: Narrowing, query: string): Drilled | undefined => {
  if (key === UNSAID) return undefined
  switch (dimension) {
    case "game":
    case "parlor":
    case "machine":
      return { by: INTO[dimension], narrowing: narrowedTo(narrowing, dimension, [key]), query }
    case "year":
      return { by: "month", narrowing, query: queryOf(widened({ from: `${key}-01-01` as IsoDate, to: `${key}-01-01` as IsoDate }, "year")) }
    case "month":
      return { by: "day", narrowing, query: queryOf(widened({ from: `${key}-01` as IsoDate, to: `${key}-01` as IsoDate }, "month")) }
    case "weekday":
    case "day":
      return undefined
  }
}
