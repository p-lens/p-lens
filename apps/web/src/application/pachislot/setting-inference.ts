import type { PlayDto, PlayedDto, PosteriorRequest, WeightDto } from "@p-lens/contracts/pachislot"

import type { Catalog } from "../../catalog/port/catalog"
import { ranked } from "../../core/formula/standing"
import { DEFAULT_PRIOR, priorFor } from "../../core/pachislot/prior"
import { worthOf } from "../../core/pachislot/formula"
import { snapshotOf, type FormulaSnapshot } from "../../core/pachislot/snapshot"
import { atGamesOf, playedGamesOf, playTermsOf, segmentOf, toldAtPathOf, toldPathOf, type MedalTerms, type SettingTold } from "../../core/pachislot/told"
import { pricedPlayOf, settingLevelsOf } from "../../core/pachislot/weighing"
import { Err, mapOk } from "../../core/result/result"
import type { EngineClient } from "../../pachislot-engine/client/client"
import type { ApplicationError, Outcome } from "../errors"
import { fromPachislotEngine } from "../lift"
import { loadMachine } from "./formulas"

/**
 * The formula a told play of a machine is read by: the best ranked of its
 * formulas, the one the machine would open with for anyone — a bonus
 * machine's read by its data counter, an AT machine's by its history.
 */
export type Inferable = { readonly type: "inferable"; readonly formula: FormulaSnapshot } | { readonly type: "no-formula" }

/** The formula a machine's told plays are read by, looked up in the catalog. */
export const loadInferable = async (catalog: Catalog, machineId: string): Promise<Outcome<Inferable>> =>
  mapOk(await loadMachine(catalog, machineId), (detail): Inferable => {
    const best = ranked(detail.formulas, worthOf).at(0)
    return best === undefined ? { type: "no-formula" } : { type: "inferable", formula: snapshotOf(best.formula) }
  })

/** How likely each setting level was, by what the counter showed, and what the games played were worth under those odds. */
interface InferredSettingLevels {
  readonly formulaId: string
  readonly settingLevels: readonly WeightDto[]
  /** In yen, on the terms the play was told on. */
  readonly theoreticalValue: number
}

/** Where the reading of a told play's setting level is: nothing pressed, being read, read, or failed. */
export type SettingInference =
  | { readonly type: "resting" }
  | { readonly type: "inferring" }
  | { readonly type: "inferred"; readonly inferred: InferredSettingLevels }
  | { readonly type: "failed"; readonly error: ApplicationError }

/** What a told play is read from and weighed over, as the engine takes them: on a bonus machine its counter's games and the games its hours come to, on an AT machine its history and the path it walks. */
const askedOf = (told: SettingTold): { readonly seen: Pick<PosteriorRequest, "segments" | "told">; readonly played: PlayedDto; readonly games: number; readonly outlay: number } => {
  switch (told.type) {
    case "counter":
      return { seen: { segments: [segmentOf(told.told)] }, played: { type: "games", games: playedGamesOf(told.told) }, games: playedGamesOf(told.told), outlay: told.told.outlay }
    case "history":
      return { seen: { segments: [], told: toldPathOf(told.told) }, played: { type: "path", path: toldAtPathOf(told.told) }, games: atGamesOf(told.told), outlay: told.told.outlay }
  }
}

/**
 * Read a told play's setting level by Bayes: an ordinary day's stock spread
 * over the formula's setting levels, as a play followed live starts with, updated by what was told — a bonus machine's
 * day games and bonuses its counter showed, an AT machine's history of ATs
 * — then the theoretical value of its games, each setting level weighed by
 * how likely it now is, on the terms told: the cash put in rented, nothing
 * drawn from savings. A bonus machine's games are those its hours come
 * to; an AT machine's are walked along its history, as the live screen
 * walks a play.
 */
export const inferSettingLevels = async (engine: EngineClient, formula: FormulaSnapshot, told: SettingTold, terms: MedalTerms): Promise<Outcome<InferredSettingLevels>> => {
  const source = { type: "normalized", normalized: formula.normalized } as const
  const asked = askedOf(told)
  const prior = priorFor(DEFAULT_PRIOR, settingLevelsOf(formula))
  if (!prior.ok) return Err({ type: "pachislot-play", problem: prior.error })
  const posterior = fromPachislotEngine(await engine.call("posterior", { source, ...asked.seen, ...(prior.value === undefined ? {} : { prior: prior.value }) }))
  if (!posterior.ok) return posterior
  const weigh = async (play: PlayDto) =>
    fromPachislotEngine(await engine.call("theoreticalValue", { source, conditions: formula.conditions, weights: posterior.value.settingLevels, play, played: asked.played }))
  const unpriced = await weigh({ medalValue: 1, rentalPrice: 1, cashShare: 0 })
  if (!unpriced.ok) return unpriced
  return mapOk(await weigh(pricedPlayOf(playTermsOf(terms), { bet: formula.normalized.bet, games: asked.games, outlay: asked.outlay, replay: undefined, payoutRate: unpriced.value.payoutRate })), (value) => ({ formulaId: formula.id, settingLevels: posterior.value.settingLevels, theoreticalValue: value.yen }))
}
