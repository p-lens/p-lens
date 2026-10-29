import type { IsoDate } from "../calendar/calendar"
import { isNegative, negate, ZERO, type Decimal } from "../decimal/decimal"
import { describedBy, type Entry } from "../journal/entry"
import type { PlayId } from "../play/play"
import { sidePostings } from "./sides"
import { TALLY_TAGS } from "./tally"

/** What a day came to, as まとめて入力 takes it: a day of a month and its 収支 in yen, and nothing of where or on what. */
export interface DayResult {
  readonly date: IsoDate
  readonly result: Decimal
}

/** What a tally of a day's 収支 says after the bar: no machine and no cabinet, only that it was typed in a month at a time. */
const DAY_RESULT_NOTE = "まとめて入力"

/**
 * A day's 収支 as one journal entry, in yen alone, its two sides as a
 * tally typed in by hand has them (`sidePostings`): a loss is its outlay,
 * out of cash, and a gain its takings, into the special prizes, never into
 * cash. It names no parlor, no machine and no game: those a month typed
 * in at a time does not say.
 */
export const dayResultEntry = (id: PlayId, day: DayResult): Entry => ({
  date: day.date,
  description: describedBy(undefined, DAY_RESULT_NOTE),
  tags: [[TALLY_TAGS.playId, id]],
  postings: isNegative(day.result) ? sidePostings(negate(day.result), ZERO) : sidePostings(ZERO, day.result),
})
