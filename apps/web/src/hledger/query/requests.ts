import { YEN, type TokenKind } from "../../core/commodity/commodity"
import type { Valuation } from "../../core/valuation/valuation"
import type { Cut, Request, ValuationRequest } from "../protocol/wire"
import { combine, openingBalanceTerm, playsTerm, savingsTerm, theoreticalValueTerm } from "./terms"

type RequestOf<K extends Request["kind"]> = Extract<Request, { kind: K }>

const inYen = (valuation: Valuation): ValuationRequest => ({ at: valuation.at, commodity: YEN })

/** What the plays in a query actually made or lost, each posting at its own day's rate. */
export const actualRequest = (query: string): RequestOf<"incomestatement"> => ({
  kind: "incomestatement",
  query,
  valuation: inYen({ at: "posting-date" }),
})

/** The theoretical value of the plays in a query, summed by hledger. */
export const theoreticalRequest = (query: string): RequestOf<"balance"> => ({
  kind: "balance",
  query: combine(theoreticalValueTerm, query),
})

/** What the plays in a query made or lost, cut by a tag's values or by period: an income statement whose rows, or columns, are the groups. */
export const actualCutRequest = (query: string, cut: Cut): RequestOf<"incomestatement"> => ({ ...actualRequest(query), ...cut })

/** The theoretical value of the plays in a query, cut the same way. */
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

export const pricesRequest = (query: string): RequestOf<"prices"> => ({ kind: "prices", query })

export const playsRequest = (query: string, page: { readonly limit: number; readonly offset: number }): RequestOf<"entries"> => ({
  kind: "entries",
  query: combine(playsTerm, query),
  ...page,
})

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
