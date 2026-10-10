import type {
  AnalysisDto,
  ConditionsDto,
  EstimateSummaryDto,
  SpecDto,
} from "@p-lens/contracts/pachislot"

import { figuresFromAnalysis, type SettingLevelFigures } from "../../core/pachislot/figures"
import type { NewMachine, NewPachislotFormula, NewSettingDistribution, PachislotFormulaDetail, PachislotMachineDetail } from "../../core/catalog/catalog"
import type { MachineId } from "../../core/machine/machine"
import type { Basis } from "../../core/pachislot/formula"
import { Err, Ok, mapOk } from "../../core/result/result"
import { tidyTyped } from "../../core/text/tidy"
import type { EngineClient, RunningRun } from "../../pachislot-engine/client/client"
import type { RunEvent } from "../../pachislot-engine/protocol/messages"
import type { Catalog, Submitted } from "../../catalog/port/catalog"
import { loadEntry } from "../catalog"
import type { Outcome } from "../errors"
import { fromCatalog, fromPachislotEngine } from "../lift"

export const loadMachine = async (catalog: Catalog, id: string): Promise<Outcome<PachislotMachineDetail>> => loadEntry(catalog, id, "pachislot")

export const loadFormula = async (catalog: Catalog, machineId: string, formulaId: string): Promise<Outcome<PachislotFormulaDetail>> => {
  const detail = await loadMachine(catalog, machineId)
  if (!detail.ok) return detail
  const listing = detail.value.formulas.find((candidate) => candidate.formula.id === formulaId)
  return listing === undefined ? Err({ type: "catalog", error: { type: "formula-missing", id: formulaId } }) : Ok({ machine: detail.value.machine, listing })
}

/**
 * A new pachislot machine and its first formula, sent together: no machine
 * is ever without one. The name is tidied however it was typed.
 */
export const registerMachine = async (catalog: Catalog, machine: NewMachine, formula: NewPachislotFormula): Promise<Outcome<Submitted>> =>
  fromCatalog(await catalog.register({ ...machine, name: tidyTyped(machine.name) }, { gameKind: "pachislot", formula }))

export const addFormula = async (catalog: Catalog, machineId: MachineId, formula: NewPachislotFormula): Promise<Outcome<Submitted>> =>
  fromCatalog(await catalog.addFormula(machineId, { gameKind: "pachislot", formula }))

export const addSettingDistribution = async (catalog: Catalog, machineId: MachineId, distribution: NewSettingDistribution): Promise<Outcome<Submitted>> =>
  fromCatalog(await catalog.addDistribution(machineId, { ...distribution, label: tidyTyped(distribution.label) }))

/** What the engine makes of a world being entered: its exact figures, and the basis to keep with them. */
export interface Analyzed {
  readonly analysis: AnalysisDto
  readonly figures: readonly SettingLevelFigures[]
  readonly basis: Basis
}

export const analyzeBasis = async (engine: EngineClient, spec: SpecDto, conditions: ConditionsDto): Promise<Outcome<Analyzed>> =>
  mapOk(fromPachislotEngine(await engine.call("analyze", { source: { type: "spec", spec }, conditions })), (analysis) => ({
    analysis,
    figures: figuresFromAnalysis(analysis, spec),
    basis: { spec, conditions, normalized: analysis.normalized, engineSchemaVersion: analysis.schemaVersion },
  }))

/**
 * A basis's payout rates sampled on the device, a chunk at a time: from its
 * stored normalised spec, so the same sampling run again — by anyone, from
 * the same seed — comes to the same figures.
 */
export const sampleBasis = (
  engine: EngineClient,
  basis: Basis,
  sampling: { readonly gamesPerSettingLevel: number; readonly seed: string },
  onEvent: (event: RunEvent<EstimateSummaryDto>) => void,
): RunningRun =>
  engine.estimate(
    {
      source: { type: "normalized", normalized: basis.normalized },
      conditions: basis.conditions,
      gamesPerSettingLevel: sampling.gamesPerSettingLevel,
      seed: sampling.seed,
    },
    onEvent,
  )

/** A formula's 計算根拠: its stored normalised spec solved again, never its world renormalised. */
export const groundsOf = async (engine: EngineClient, basis: Basis): Promise<Outcome<AnalysisDto>> =>
  fromPachislotEngine(await engine.call("analyze", { source: { type: "normalized", normalized: basis.normalized }, conditions: basis.conditions }))
