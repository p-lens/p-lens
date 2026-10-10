/**
 * The shapes crossing to and from hledger, mirroring `wasm/hledger-bindings`.
 *
 * Answers are hledger's own JSON — what `hledger --output-format=json` emits —
 * so they follow upstream rather than a format invented here. A new report
 * means editing `Bindings.hs` and this file together.
 */

/** hledger's Decimal: never read as a float. */
export interface Quantity {
  readonly decimalMantissa: number
  readonly decimalPlaces: number
}

export interface Amount {
  readonly acommodity: string
  readonly aquantity: Quantity
}

/** One amount per commodity; empty means zero. */
export type MixedAmount = readonly Amount[]

/** hledger's `(TagName, TagValue)`, which aeson writes as a pair. */
export type Tag = readonly [name: string, value: string]

/** How a posting takes part in the balance, as hledger names it. */
export type PostingType = "RegularPosting" | "VirtualPosting" | "BalancedVirtualPosting"

export interface Posting {
  readonly paccount: string
  readonly pamount: MixedAmount
  readonly ptype: PostingType
  readonly ptags: readonly Tag[]
}

export interface Transaction {
  readonly tdate: string
  readonly tdescription: string
  readonly ttags: readonly Tag[]
  readonly tpostings: readonly Posting[]
}

/**
 * One row of a balance report. `prrName` is the full account name; the totals
 * row has none and arrives as an empty array.
 */
export interface ReportRow {
  readonly prrName: string | readonly []
  /** The row's amount in each of the report's periods, in the order of `prDates`: one, for a report with no interval. */
  readonly prrAmounts: readonly MixedAmount[]
  readonly prrTotal: MixedAmount
}

/**
 * One end of a period as hledger's `DateSpan` sends it: a day, marked `Flex`
 * when hledger widened it to a whole period, or `null` for an open end.
 */
export type SpanEdge = { readonly contents: string; readonly tag: "Exact" | "Flex" } | null

/** The period a report covers; the end is exclusive. */
export type DateSpan = readonly [start: SpanEdge, end: SpanEdge]

export interface BalanceReport {
  readonly prDates: readonly DateSpan[]
  readonly prRows: readonly ReportRow[]
  readonly prTotals: ReportRow
}

export interface PriceDirective {
  readonly pddate: string
  readonly pdcommodity: string
  readonly pdamount: Amount
}

export interface DeclaredAccount {
  readonly name: string
  readonly tags: readonly Tag[]
}

export interface Page<T> {
  readonly items: readonly T[]
  readonly offset: number
  readonly total: number
}

export interface JournalSummary {
  readonly transactions: number
  readonly accounts: readonly string[]
  readonly commodities: readonly string[]
}

/** hledger's report interval: `-D`, `-M` or `-Y`. */
export type IntervalRequest = "daily" | "monthly" | "yearly"

/**
 * How a balance report is cut, where it is: `pivot` is hledger's `--pivot`,
 * a tag whose values stand in place of accounts, so the report's rows are
 * the tag's values, and what was posted with no such tag is one row with an
 * empty name; `interval` gives the report a column a period.
 */
export interface Cut {
  readonly pivot?: string
  readonly interval?: IntervalRequest
}

/** hledger's `--value`, always into a named commodity. */
export interface ValuationRequest {
  readonly at: "posting-date" | "period-end"
  readonly commodity: string
}

export type Request =
  | { readonly kind: "entries"; readonly query: string; readonly limit: number; readonly offset: number }
  | ({ readonly kind: "balance"; readonly query: string; readonly valuation?: ValuationRequest } & Cut)
  | ({ readonly kind: "incomestatement"; readonly query: string; readonly valuation?: ValuationRequest } & Cut)
  | { readonly kind: "prices"; readonly query: string }
  | { readonly kind: "accounts" }

export interface Answer {
  readonly entries: Page<Transaction>
  readonly balance: BalanceReport
  readonly incomestatement: BalanceReport
  readonly prices: readonly PriceDirective[]
  readonly accounts: readonly DeclaredAccount[]
}

/**
 * Why a call produced no answer: the bindings' own failures, plus the ways the
 * crossing itself can fail.
 */
export type Trouble =
  | { readonly kind: "no-journal" }
  | { readonly kind: "file-missing"; readonly path: string }
  | { readonly kind: "read-failed"; readonly detail: string }
  | { readonly kind: "malformed-request"; readonly detail: string }
  | { readonly kind: "unknown-report"; readonly report: string }
  | { readonly kind: "crashed"; readonly detail: string }
  | { readonly kind: "unreachable"; readonly detail: string }
  | { readonly kind: "unreadable-answer"; readonly detail: string }
