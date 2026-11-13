import type { IsoDate } from "../../core/calendar/calendar"
import type { ReportedRates } from "../../core/parlor/reported-rates"
import type { Result } from "../../core/result/result"

/** Why the reports of parlors' rates could not be read: the file that did not answer, or answered with something else. */
export interface RateReportsError {
  readonly type: "unread"
  readonly file: string
}

/**
 * What players reported of parlors' rates: the corners p-lens-parlors
 * publishes beside its list, and what p-lens-brokers saw a prize come to.
 * The copy last read is kept on the device, so rates are filled in
 * offline as well; a device that never could read them fills none in, and
 * plays on.
 */
export interface RateReports {
  /** The rates as they stand on a day, reports dated after it not yet in force. */
  readonly rates: (today: IsoDate) => Promise<Result<ReportedRates, RateReportsError>>
}
