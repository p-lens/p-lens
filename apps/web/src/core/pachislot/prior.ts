import type { BySettingLevelDto, DistributionDto } from "@p-lens/contracts/pachislot"

import { ranked, sameWorth, type FormulaListing } from "../formula/standing"
import { Err, Ok, type Result } from "../result/result"
import type { SettingDistribution, SettingDistributionId, SettingLevelShare } from "./formula"

/**
 * The spreads the app itself offers for any machine, by what kind of day at
 * what kind of parlor each is a reading of: nobody registers a 設定配分 for
 * most machines, and an even spread — a sixth of the cabinets at each
 * level — is no parlor's day.
 */
export type StockSpreadKey =
  | "collecting"
  | "ordinary-harsh"
  | "ordinary"
  | "ordinary-kind"
  | "event-weak"
  | "event"
  | "event-strong"
  | "new-machine"
  | "grand-opening"
  | "featured"

/**
 * Each stock spread's shares of setting levels 1 to 6, in basis points,
 * harshest first. They are made here, not taken from anywhere: what people
 * who ran parlors and people who played for a living have said in public
 * agrees on the shape — an ordinary day is mostly 1 with some 2, seldom
 * above 4, its levels averaging 1.2 to 1.6; a day a parlor gives back
 * averages near 2 and brings 5 and 6 in; a day it collects is nearly all
 * 1 — and each spread here is one point within that shape. No level is
 * given nothing: a spread that rules a level out could never be argued out
 * of it by what the cabinet then does. `featured` is not a parlor's day
 * but a cabinet's standing on one: one of those the day's high levels were
 * said to be put in.
 */
const STOCK_SHARES: Readonly<Record<StockSpreadKey, readonly number[]>> = {
  collecting: [8200, 1300, 350, 100, 30, 20],
  "ordinary-harsh": [7000, 2000, 600, 300, 60, 40],
  ordinary: [6000, 2500, 900, 500, 60, 40],
  "ordinary-kind": [4500, 3000, 1300, 900, 200, 100],
  "event-weak": [5500, 2200, 800, 800, 350, 350],
  event: [4800, 2000, 700, 1100, 650, 750],
  "event-strong": [4000, 2000, 900, 1300, 800, 1000],
  "new-machine": [3500, 2400, 1700, 1200, 700, 500],
  "grand-opening": [4000, 2500, 1200, 1200, 500, 600],
  featured: [1000, 1000, 1000, 2500, 2000, 2500],
}

/** The stock spreads in the order they are offered: the harshest first. */
export const STOCK_SPREADS: readonly StockSpreadKey[] = ["collecting", "ordinary-harsh", "ordinary", "ordinary-kind", "event-weak", "event", "event-strong", "new-machine", "grand-opening", "featured"]

/** The spread a play starts with where nobody has said one, live or told afterwards: an ordinary day at an ordinary parlor. */
const ORDINARY: StockSpreadKey = "ordinary"

const isStockSpread = (key: string): key is StockSpreadKey => STOCK_SPREADS.some((candidate) => candidate === key)

/** A stock spread's shares, level by level. */
export const stockSharesOf = (key: StockSpreadKey): readonly SettingLevelShare[] => STOCK_SHARES[key].map((basisPoints, index) => ({ settingLevel: index + 1, basisPoints }))

/**
 * What a pachislot play's setting level is inferred from before anything is
 * seen: every setting level alike, a 設定配分 of the catalog's as it was
 * when the play began, kept whole so the catalog changing meanwhile changes
 * nothing, or one of the app's own stock spreads, kept whole the same way.
 */
export type Prior =
  | { readonly type: "even" }
  | { readonly type: "distribution"; readonly id: SettingDistributionId; readonly label: string; readonly shares: readonly SettingLevelShare[] }
  | { readonly type: "stock"; readonly key: StockSpreadKey; readonly shares: readonly SettingLevelShare[] }

/** A prior chosen by hand at the start of a play: an even spread, one of the machine's 設定配分, or a stock spread. */
export type ChosenPrior = { readonly type: "even" } | { readonly type: "distribution"; readonly id: SettingDistributionId } | { readonly type: "stock"; readonly key: string }

/**
 * Which prior a play starts with, and why: the one chosen by hand, else the
 * 設定配分 a book of the person's keeps as its favourite, else the ordinary
 * day's stock spread. Unlike a formula, no 設定配分 of the catalog's is chosen for
 * you by its ranking: a parlor's spread is the player's own reading of it.
 */
export interface PriorSelection {
  readonly prior: Prior
  readonly by: "person" | "favorite" | "default"
}

const priorOf = (distribution: SettingDistribution): Prior => ({
  type: "distribution",
  id: distribution.id,
  label: distribution.label,
  shares: distribution.shares,
})

const stockPrior = (key: StockSpreadKey): Prior => ({ type: "stock", key, shares: stockSharesOf(key) })

/** The prior nobody has said one in place of: an ordinary day's stock spread. */
export const DEFAULT_PRIOR: Prior = stockPrior(ORDINARY)

export const selectPrior = (listings: readonly FormulaListing<SettingDistribution>[], chosen: ChosenPrior | undefined, favorites: ReadonlySet<string>): PriorSelection => {
  if (chosen?.type === "even") return { prior: { type: "even" }, by: "person" }
  if (chosen?.type === "stock" && isStockSpread(chosen.key)) return { prior: stockPrior(chosen.key), by: "person" }
  const byHand = chosen?.type === "distribution" ? listings.find((listing) => listing.formula.id === chosen.id) : undefined
  if (byHand !== undefined) return { prior: priorOf(byHand.formula), by: "person" }
  const favorite = ranked(listings, sameWorth).find((listing) => favorites.has(listing.formula.id))
  return favorite === undefined ? { prior: DEFAULT_PRIOR, by: "default" } : { prior: priorOf(favorite.formula), by: "favorite" }
}

/** A 設定配分 that gives none of a formula's setting levels any share, so nothing could be inferred under it. */
export type PriorProblem = { readonly type: "prior-rules-out-every-setting-level"; readonly prior: Prior }

const WHOLE = 10_000

/**
 * Shares scaled up to the whole, each rounded down and what is left handed
 * out one by one to the largest fractions — the lower setting level first on
 * a tie — so they still sum to exactly 100%, as the engine requires.
 */
const rescaled = (shares: readonly SettingLevelShare[], total: number): readonly BySettingLevelDto<number>[] => {
  const scaled = shares.map((share, order) => {
    const exact = (share.basisPoints * WHOLE) / total
    return { settingLevel: share.settingLevel, order, floor: Math.floor(exact), fraction: exact - Math.floor(exact) }
  })
  const left = WHOLE - scaled.reduce((sum, share) => sum + share.floor, 0)
  const raised = new Set(
    scaled
      .toSorted((first, second) => second.fraction - first.fraction || first.order - second.order)
      .slice(0, left)
      .map((share) => share.order),
  )
  return scaled.map((share) => ({ settingLevel: share.settingLevel, value: share.floor + (raised.has(share.order) ? 1 : 0) }))
}

/**
 * The prior as the engine takes it for a formula with these setting levels:
 * none for an even spread; for a 設定配分 or a stock spread, its shares of those levels alone —
 * a level it does not name has no share — scaled back up to 100%, since a
 * spread registered for every level of a machine is often weighed against a
 * formula that has only some of them.
 */
export const priorFor = (prior: Prior, settingLevels: readonly number[]): Result<DistributionDto | undefined, PriorProblem> => {
  if (prior.type === "even") return Ok(undefined)
  const kept = settingLevels.map((settingLevel) => ({
    settingLevel,
    basisPoints: prior.shares.find((share) => share.settingLevel === settingLevel)?.basisPoints ?? 0,
  }))
  const total = kept.reduce((sum, share) => sum + share.basisPoints, 0)
  return total === 0 ? Err({ type: "prior-rules-out-every-setting-level", prior }) : Ok({ shares: rescaled(kept, total) })
}
