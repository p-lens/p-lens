import type { IsoDate } from "../../../core/calendar/calendar"
import { dayTerm, monthTerm } from "../../../hledger/query/terms"

/** A period a view is asked about: what it is called, and the hledger query that is it. */
export interface Period {
  readonly id: string
  readonly label: string
  readonly query: string
}

/**
 * Today, this month, or everything: each a query written into the address,
 * so the period on screen is the one the address says.
 */
export const periodsOn = (today: IsoDate): readonly Period[] => [
  { id: "today", label: "今日", query: dayTerm(today) },
  { id: "month", label: "今月", query: monthTerm(today) },
  { id: "all", label: "全期間", query: "" },
]
