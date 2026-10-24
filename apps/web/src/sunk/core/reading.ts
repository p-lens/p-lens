import type { OutlayDto, SunkSummaryDto } from "@p-lens/contracts/pachinko"

/** Days played out for a counter, at most: ten seconds or so on a computer for a counter so rare it never stops sooner. */
export const TRIALS = 3_000_000

/** Days matching a counter after which no more are played: enough for the spread of what they took to stand still. */
export const ENOUGH = 20_000

/** Days matching a counter below which what they took is read as rough: too few to say its spread. */
const FEW = 30

/**
 * How seldom what the counter shows comes: so many spins without a jackpot
 * since the last, known exactly (`dry`), or a day like it, by how many of
 * the days searched matched (`day`).
 */
export type Rarity = { readonly type: "dry"; readonly spins: number; readonly oneIn: number } | { readonly type: "day"; readonly oneIn: number }

/**
 * What a run of a counter says so far.
 *
 * - `outlay`: what the cabinet took in cash, by the days that match its
 *   counter (`rough` while they are few), and how seldom it comes, where
 *   that can be said.
 * - `unmatched`: no day matched the counter; where the run is over, none
 *   did in all it played (`played`).
 */
export type Reading =
  | { readonly type: "outlay"; readonly outlay: OutlayDto; readonly rough: boolean; readonly rarity: Rarity | undefined }
  | { readonly type: "unmatched"; readonly played: number; readonly over: boolean }

/** How seldom the counter's day comes, as the run can say it: a dry spell where the machine forgets, a searched day where any matched. */
const rarityOf = (summary: SunkSummaryDto, dryFor: number): Rarity | undefined => {
  if (summary.dryOneIn !== undefined) return { type: "dry", spins: dryFor, oneIn: summary.dryOneIn }
  return summary.way === "searched" && summary.matched > 0 ? { type: "day", oneIn: summary.trials / summary.matched } : undefined
}

/** What a run's summary says of a counter, whose spins since the last jackpot are `dryFor`. */
export const readingOf = (summary: SunkSummaryDto, dryFor: number): Reading =>
  summary.outlay === undefined
    ? { type: "unmatched", played: summary.trials, over: summary.finished }
    : { type: "outlay", outlay: summary.outlay, rough: summary.way !== "dry" && summary.matched < FEW, rarity: rarityOf(summary, dryFor) }

/** How far a run is toward its end, from nothing to whole: played to its most days, or matched enough of them, whichever it is nearer. */
export const doneShareOf = (summary: SunkSummaryDto | undefined): number =>
  summary === undefined ? 0 : summary.finished ? 1 : Math.min(1, Math.max(summary.trials / summary.planned, summary.matched / ENOUGH))

/**
 * How widely what the matching days took is spread: not at all, all of them
 * at one figure (`none`); the middle half as wide as the middle eight
 * tenths, said once (`one`); or each of them (`two`).
 */
export type Spread = { readonly type: "none" } | { readonly type: "one"; readonly low: number; readonly high: number } | { readonly type: "two"; readonly outlay: OutlayDto }

export const spreadOf = (outlay: OutlayDto): Spread => {
  if (outlay.low === outlay.high) return { type: "none" }
  return outlay.lower === outlay.low && outlay.upper === outlay.high ? { type: "one", low: outlay.low, high: outlay.high } : { type: "two", outlay }
}
