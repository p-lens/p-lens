import type { IsoDate } from "../../core/calendar/calendar"
import { YEN, type TokenKind } from "../../core/commodity/commodity"
import { ACCOUNTS, EXPENSE_ROOT, REVENUE_ROOT } from "../../core/journal/accounts"
import { TALLY_TAGS } from "../../core/tally/tally"
import type { PlayId } from "../../core/play/play"
import type { Valuation } from "../../core/valuation/valuation"
import type { Cut, Request, ValuationRequest } from "../protocol/wire"
import { accountTerm, branchTerm, parlorSavingsTerm, cashTerm, combine, playTimeTerm, rentalSpreadTerm, drawnTerm, inferredValueTerm, openingBalanceTerm, talliesAmongTerm, talliesTerm, savingsTerm, sentTalliesTerm, spinPerformanceTerm, theoreticalValueTerm, rangeTerm } from "./terms"

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

/** What a branch of the account tree came to over a query, in yen at the rate of each posting's day: what the tallies took in, under 費用, or gave back, under 収益. */
export const branchRequest = (root: string, query: string): RequestOf<"balance"> => ({
  kind: "balance",
  query: combine(branchTerm(root), query),
  valuation: inYen({ at: "posting-date" }),
})

/** The time the tallies of a query were played for, in seconds, as hledger sums it. */
export const playTimeRequest = (query: string): RequestOf<"balance"> => ({ kind: "balance", query: combine(playTimeTerm, query) })

/** The time the tallies of a query were played for, cut the same way. */
export const playTimeCutRequest = (query: string, cut: Cut): RequestOf<"balance"> => ({ ...playTimeRequest(query), ...cut })

/** The loss on renting tokens above their exchange value over a query, in yen. */
export const rentalSpreadRequest = (query: string): RequestOf<"balance"> => ({ kind: "balance", query: combine(rentalSpreadTerm, query) })

/**
 * What each account a period taken as one reads came to, in one report:
 * the cash, the prizes and the part of a yen beside them, the theoretical
 * value and its inferred part, the play time, and the expenses and revenue
 * with every account under them, the replay fee among them — each posting
 * at its own day's rate. A tree, so each branch's row is hledger's sum of
 * it and none is summed here.
 */
export const periodTotalsRequest = (query: string): RequestOf<"balance"> => ({
  kind: "balance",
  query: combine(cashTerm, accountTerm(ACCOUNTS.specialPrizes), accountTerm(ACCOUNTS.oddPrizes), accountTerm(ACCOUNTS.translationAdjustment), theoreticalValueTerm, playTimeTerm, branchTerm(EXPENSE_ROOT), branchTerm(REVENUE_ROOT), query),
  valuation: inYen({ at: "posting-date" }),
  tree: true,
})

/** What one account of a query came to, as hledger sums it: the cash spent, or the prizes taken home. */
export const accountRequest = (account: string, query: string): RequestOf<"balance"> => ({ kind: "balance", query: combine(accountTerm(account), query) })

/** The savings the tallies of a query drew on, in yen at the rate of the day each was drawn: what was taken out of savings, not what was put back. */
export const savingsDrawnRequest = (query: string): RequestOf<"balance"> => ({
  kind: "balance",
  query: combine(talliesTerm, savingsTerm, drawnTerm, query),
  valuation: inYen({ at: "posting-date" }),
})

/** Savings in tokens, per parlor and kind: in every savings account, or in those `accounts` matches. */
export const savingsQuantityRequest = (query: string, accounts: string = savingsTerm): RequestOf<"balance"> => ({
  kind: "balance",
  query: combine(accounts, query),
})

/** Savings in yen, at the rate in force at the end of the query's period: in every savings account, or in those `accounts` matches. */
export const savingsValueRequest = (query: string, accounts: string = savingsTerm): RequestOf<"balance"> => ({
  kind: "balance",
  query: combine(accounts, query),
  valuation: inYen({ at: "period-end" }),
})

/** What a parlor's savings were worth at the end of each day from one to another, everything before it counted, each day at the rate in force then: a column a day. */
export const parlorSavingsByDayRequest = (parlorName: string, from: IsoDate, through: IsoDate): RequestOf<"balance"> => ({
  ...savingsValueRequest(rangeTerm(from, through), parlorSavingsTerm(parlorName)),
  interval: "daily",
  accumulation: "historical",
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

/** Every tally of a query by its head alone, its day and tags, however many. */
export const tallyHeadsRequest = (query: string): RequestOf<"heads"> => ({ kind: "heads", query: combine(talliesTerm, query), limit: 1_000_000, offset: 0 })

/** Every tally of a query that says a spin performance, measured or inferred, however many: hledger keeps the tags and does not add them up. */
export const spinPerformancesRequest = (query: string): RequestOf<"entries"> => ({ kind: "entries", query: combine(talliesTerm, spinPerformanceTerm, query), limit: 1_000_000, offset: 0 })

/** Every tally of a play someone sent, whenever it was played, newest first: who sent each is named by their last. */
export const sentTalliesRequest: RequestOf<"entries"> = { kind: "entries", query: combine(talliesTerm, sentTalliesTerm), limit: 1_000_000, offset: 0 }

/** Every entry that moves any savings within a query, however many. */
export const savingsEntriesRequest = (query: string): RequestOf<"entries"> => ({ kind: "entries", query: combine(savingsTerm, query), limit: 1_000_000, offset: 0 })

/** Every entry that moves a parlor's savings, of any pool, however many, of those `query` matches: its days. */
export const parlorEntriesRequest = (parlorName: string, query: string = ""): RequestOf<"entries"> => ({ kind: "entries", query: combine(parlorSavingsTerm(parlorName), query), limit: 1_000_000, offset: 0 })

/** What went into a parlor's savings, or came out of them, day by day, in yen at the rate of each day: `amt:>0` or `amt:<0` says which, and `query` the days. */
export const parlorMovedRequest = (parlorName: string, way: "amt:>0" | "amt:<0", query: string = ""): RequestOf<"balance"> => ({
  kind: "balance",
  query: combine(parlorSavingsTerm(parlorName), way, query),
  interval: "daily",
  valuation: inYen({ at: "posting-date" }),
})

/** Every entry that moves one pool's savings, however many, of those `query` matches: its days. */
export const poolEntriesRequest = (account: string, query: string = ""): RequestOf<"entries"> => ({ kind: "entries", query: combine(accountTerm(account), query), limit: 1_000_000, offset: 0 })

/** Every entry of the book, however many, and every account's balance in its own commodities: what a book reads as, entry by entry and account by account. */
export const everyEntryRequest: RequestOf<"entries"> = { kind: "entries", query: "", limit: 1_000_000, offset: 0 }
export const everyBalanceRequest: RequestOf<"balance"> = { kind: "balance", query: "" }

/** The newest entry a query matches, and how many it matches: whether there is any, and when the last was. */
export const newestEntryRequest = (query: string): RequestOf<"entries"> => ({ kind: "entries", query, limit: 1, offset: 0 })

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
