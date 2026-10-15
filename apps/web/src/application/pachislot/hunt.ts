import type { HuntDto, PathStartDto, WeightDto } from "@p-lens/contracts/pachislot"

import type { Basis } from "../../core/pachislot/formula"
import { DEFAULT_PRIOR, priorFor } from "../../core/pachislot/prior"
import { huntPlayOf } from "../../core/pachislot/weighing"
import type { PlayTerms } from "../../core/parlor/terms"
import { Err, Ok, mapOk } from "../../core/result/result"
import type { EngineClient } from "../../pachislot-engine/client/client"
import type { Outcome } from "../errors"
import { fromPachislotEngine } from "../lift"

/** 天井狙い from one seat of a table. */
export interface HuntRow {
  readonly seat: PathStartDto
  readonly hunt: HuntDto
}

/**
 * 天井狙い at each seat of a formula, as a table: under the stock spread a
 * play starts with where nobody has said another, every regular game until
 * the AT rented for cash on the corner's terms. None at a machine of
 * bonuses.
 */
export const huntTable = async (engine: EngineClient, basis: Basis, terms: PlayTerms, seats: readonly PathStartDto[]): Promise<Outcome<readonly HuntRow[]>> => {
  const rules = basis.normalized.atRules
  if (rules === undefined || seats.length === 0) return Ok([])
  const levels = basis.normalized.tables.map((table) => table.settingLevel)
  const prior = priorFor(DEFAULT_PRIOR, levels)
  if (!prior.ok) return Err({ type: "pachislot-play", problem: prior.error })
  const weights: readonly WeightDto[] = prior.value?.shares.map((share) => ({ settingLevel: share.settingLevel, probability: share.value / 10_000 })) ?? levels.map((settingLevel) => ({ settingLevel, probability: 1 / levels.length }))
  const rows = fromPachislotEngine(
    await engine.call("hunt", { source: { type: "normalized", normalized: basis.normalized }, weights, play: huntPlayOf(terms, rules, basis.normalized.bet), seats }),
  )
  return mapOk(rows, (hunts) => hunts.flatMap((hunt, index) => ((seat) => (seat === undefined ? [] : [{ seat, hunt }]))(seats[index])))
}
