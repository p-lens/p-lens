import type { BySettingLevelDto, DistributionDto } from "@p-lens/contracts/pachislot"

import { ranked, sameWorth, type FormulaListing } from "../formula/standing"
import { Err, Ok, type Result } from "../result/result"
import type { SettingDistribution, SettingDistributionId, SettingLevelShare } from "./formula"

/**
 * What a pachislot play's setting level is inferred from before anything is
 * seen: every setting level alike, or a 設定配分 as it was when the play
 * began, kept whole so the catalog changing meanwhile changes nothing.
 */
export type Prior =
  | { readonly type: "even" }
  | { readonly type: "distribution"; readonly id: SettingDistributionId; readonly label: string; readonly shares: readonly SettingLevelShare[] }

/** A prior chosen by hand at the start of a play: an even spread, or one of the machine's 設定配分. */
export type ChosenPrior = { readonly type: "even" } | { readonly type: "distribution"; readonly id: SettingDistributionId }

/**
 * Which prior a play starts with, and why: the one chosen by hand, else the
 * 設定配分 a book of the person's keeps as its favourite, else an even spread. Unlike a
 * formula, no 設定配分 is chosen for you by its ranking: a parlor's spread is
 * the player's own reading of it.
 */
export interface PriorSelection {
  readonly prior: Prior
  readonly by: "person" | "favorite" | "default"
}

const priorOf =(distribution: SettingDistribution): Prior => ({
  type: "distribution",
  id: distribution.id,
  label: distribution.label,
  shares: distribution.shares,
})

export const selectPrior = (listings: readonly FormulaListing<SettingDistribution>[], chosen: ChosenPrior | undefined, favorites: ReadonlySet<string>): PriorSelection => {
  if (chosen?.type === "even") return { prior: { type: "even" }, by: "person" }
  const byHand = chosen === undefined ? undefined : listings.find((listing) => listing.formula.id === chosen.id)
  if (byHand !== undefined) return { prior: priorOf(byHand.formula), by: "person" }
  const favorite = ranked(listings, sameWorth).find((listing) => favorites.has(listing.formula.id))
  return favorite === undefined ? { prior: { type: "even" }, by: "default" } : { prior: priorOf(favorite.formula), by: "favorite" }
}

/** A 設定配分 that gives none of a formula's setting levels any share, so nothing could be inferred under it. */
export type PriorProblem = { readonly type: "prior-rules-out-every-setting-level"; readonly label: string }

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
 * none for an even spread; for a 設定配分, its shares of those levels alone —
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
  return total === 0 ? Err({ type: "prior-rules-out-every-setting-level", label: prior.label }) : Ok({ shares: rescaled(kept, total) })
}
