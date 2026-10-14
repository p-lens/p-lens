import { YEN, type TokenKind } from "../../core/commodity/commodity"
import { TALLY_TAGS } from "../../core/tally/tally"
import type { PlayId } from "../../core/play/play"
import type { Valuation } from "../../core/valuation/valuation"
import type { Cut, Request, ValuationRequest } from "../protocol/wire"
import { cashTerm, combine, inferredValueTerm, openingBalanceTerm, talliesAmongTerm, talliesTerm, savingsTerm, spinPerformanceTerm, theoreticalValueTerm } from "./terms"

type RequestOf<K extends Request["kind"]> = Extract<Request, { kind: K }>

const inYen = (valuation: Valuation): ValuationRequest => ({ at: valuation.at, commodity: YEN })

/** What the tallies in a query actually made or lost, each posting at its own day's rate. */
export const actualRequest = (query: string): RequestOf<"incomestatement"> => ({
  kind: "incomestatement",
  query,
  valuation: inYen({ at: "posting-date" }),
})

/** The theoretical value of the tallies in a query, summed by hledger. */
export const theoreticalRequest = (query: string): RequestOf<"balance"> => ({
  kind: "balance",
  query: combine(theoreticalValueTerm, query),
})

/** The part of the theoretical value of the tallies in a query that was inferred, summed by hledger. */
export const inferredRequest = (query: string): RequestOf<"balance"> => ({
  kind: "balance",
  query: combine(inferredValueTerm, query),
})

/** The inferred part of the theoretical value of the tallies in a query, cut as the two reports beside it are. */
export const inferredCutRequest = (query: string, cut: Cut): RequestOf<"balance"> => ({ ...inferredRequest(query), ...cut })

/** What the tallies in a query made or lost, cut by a tag's values or by period: an income statement whose rows, or columns, are the groups. */
export const actualCutRequest = (query: string, cut: Cut): RequestOf<"incomestatement"> => ({ ...actualRequest(query), ...cut })

/** What each of several tallies made or lost: an income statement of them alone, its rows the tallies' ids. */
export const actualByTallyRequest = (ids: readonly PlayId[]): RequestOf<"incomestatement"> => actualCutRequest(talliesAmongTerm(ids), { pivot: TALLY_TAGS.playId })

/** The theoretical value of the tallies in a query, cut the same way. */
export const theoreticalCutRequest = (query: string, cut: Cut): RequestOf<"balance"> => ({ ...theoreticalRequest(query), ...cut })

/** Savings in tokens, per parlor and kind. */
export const savingsQuantityRequest = (query: string): RequestOf<"balance"> => ({
  kind: "balance",
  query: combine(savingsTerm, query),
})

/** Savings in yen, at the rate in force at the end of the query's period. */
export const savingsValueRequest = (query: string): RequestOf<"balance"> => ({
  kind: "balance",
  query: combine(savingsTerm, query),
  valuation: inYen({ at: "period-end" }),
})

/** 評価損益: what savings gained or lost in yen over the query's period by their rates changing, a row a savings account. */
export const savingsRevaluationRequest = (query: string): RequestOf<"revaluation"> => ({
  kind: "revaluation",
  query: combine(savingsTerm, query),
  valuation: { at: "period-end", commodity: YEN },
})

export const pricesRequest = (query: string): RequestOf<"prices"> => ({ kind: "prices", query })

export const talliesRequest = (query: string, page: { readonly limit: number; readonly offset: number }): RequestOf<"entries"> => ({
  kind: "entries",
  query: combine(talliesTerm, query),
  ...page,
})

/** Every tally of a query that says a spin performance, measured or inferred, however many: hledger keeps the tags and does not add them up. */
export const spinPerformancesRequest = (query: string): RequestOf<"entries"> => ({ kind: "entries", query: combine(talliesTerm, spinPerformanceTerm, query), limit: 1_000_000, offset: 0 })

/** Whether a pool's opening balance is registered: one entry is enough to say so. */
export const openingBalanceRequest = (kind: TokenKind, parlorName: string, tier: string): RequestOf<"entries"> => ({
  kind: "entries",
  query: openingBalanceTerm(kind, parlorName, tier),
  limit: 1,
  offset: 0,
})

/** Whether a book has any theoretical value written in it at all: one entry is enough to say so. */
export const theoreticalKeptRequest: RequestOf<"entries"> = { kind: "entries", query: theoreticalValueTerm, limit: 1, offset: 0 }

export const accountsRequest: RequestOf<"accounts"> = { kind: "accounts" }

/** Every entry that posts to cash, however many: where a book is looked over for cash that rose. */
export const cashEntriesRequest: RequestOf<"entries"> = { kind: "entries", query: cashTerm, limit: 1_000_000, offset: 0 }
