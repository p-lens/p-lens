import { rounded, type Decimal } from "../../core/decimal/decimal"
import type { TallyLine } from "../../core/report/tally-line"

const SECONDS_IN_A_MINUTE = 60n

/** A play's length in whole minutes, the nearest; none where it is not known or comes to none. */
export const minutesOf = (seconds: Decimal | undefined): number | undefined => ((minutes) => (minutes === undefined || minutes <= 0 ? undefined : minutes))(seconds === undefined ? undefined : Number((rounded(seconds, 0).mantissa + SECONDS_IN_A_MINUTE / 2n) / SECONDS_IN_A_MINUTE))

/** Tallies oldest first, as ぱち簿 lists them: by their day, and within a day in the order they were written, the reverse of the newest first they come in. */
export const oldestFirst = (lines: readonly TallyLine[]): readonly TallyLine[] => lines.toReversed().toSorted((left, right) => left.tally.date.localeCompare(right.tally.date))
