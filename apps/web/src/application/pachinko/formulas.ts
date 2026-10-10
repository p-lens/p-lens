import type { AnalysisDto, ConditionsDto, EstimateSummaryDto, SpecDto } from "@p-lens/contracts/pachinko"

import { figuresFromAnalysis } from "../../core/pachinko/figures"
import type { PachinkoFormulaDetail, NewMachine, NewPachinkoFormula, PachinkoMachineDetail } from "../../core/catalog/catalog"
import type { Basis } from "../../core/pachinko/formula"
import type { Figures } from "../../core/pachinko/figures"
import type { MachineId } from "../../core/machine/machine"
import { Err, Ok, mapOk } from "../../core/result/result"
import { tidyTyped } from "../../core/text/tidy"
import type { Catalog, Submitted } from "../../catalog/port/catalog"
import { loadEntry } from "../catalog"
import type { EngineClient, RunningRun } from "../../pachinko-engine/client/client"
import type { RunEvent } from "../../pachinko-engine/protocol/messages"
import type { Outcome } from "../errors"
import { fromCatalog, fromPachinkoEngine } from "../lift"

export const loadMachine = async (catalog: Catalog, id: string): Promise<Outcome<PachinkoMachineDetail>> => loadEntry(catalog, id, "pachinko")

export const loadFormula = async (catalog: Catalog, machineId: string, formulaId: string): Promise<Outcome<PachinkoFormulaDetail>> => {
  const detail = await loadMachine(catalog, machineId)
  if (!detail.ok) return detail
  const listing = detail.value.formulas.find((candidate) => candidate.formula.id === formulaId)
  return listing === undefined ? Err({ type: "catalog", error: { type: "formula-missing", id: formulaId } }) : Ok({ machine: detail.value.machine, listing })
}

/**
 * A new machine and its first formula, sent together: no machine is ever
 * without one. The name is tidied however it was typed: the catalog is
 * master data, and one machine has one spelling.
 */
export const registerMachine = async (catalog: Catalog, machine: NewMachine, formula: NewPachinkoFormula): Promise<Outcome<Submitted>> =>
  fromCatalog(await catalog.register({ ...machine, name: tidyTyped(machine.name) }, { gameKind: "pachinko", formula }))

export const addFormula = async (catalog: Catalog, machineId: MachineId, formula: NewPachinkoFormula): Promise<Outcome<Submitted>> =>
  fromCatalog(await catalog.addFormula(machineId, { gameKind: "pachinko", formula }))

/** What the engine makes of a basis being entered: its exact figures, and the basis to keep with them. */
export interface Analyzed {
  readonly analysis: AnalysisDto
  readonly figures: Figures
  readonly basis: Basis
}

export const analyzeBasis = async (
  engine: EngineClient,
  spec: SpecDto,
  conditions: ConditionsDto,
  spinsPerHour: number | undefined,
): Promise<Outcome<Analyzed>> =>
  mapOk(fromPachinkoEngine(await engine.call("analyze", { source: { type: "spec", spec }, conditions })), (analysis) => ({
    analysis,
    figures: figuresFromAnalysis(analysis, spinsPerHour),
    basis: { spec, conditions, normalized: analysis.normalized, engineSchemaVersion: analysis.schemaVersion },
  }))

/**
 * A basis sampled on the device, a chunk at a time: from its stored
 * normalised spec, so the same sampling run again — by anyone, from the same
 * seed — comes to the same figure.
 */
export const sampleBasis = (
  engine: EngineClient,
  basis: Basis,
  sampling: { readonly cycles: number; readonly seed: string },
  onEvent: (event: RunEvent<EstimateSummaryDto>) => void,
): RunningRun =>
  engine.estimate({ source: { type: "normalized", normalized: basis.normalized }, conditions: basis.conditions, cycles: sampling.cycles, seed: sampling.seed }, onEvent)

/** A simulated formula's 計算根拠: its stored normalised spec solved again, never its spec renormalised. */
export const groundsOf = async (engine: EngineClient, basis: Basis): Promise<Outcome<AnalysisDto>> =>
  fromPachinkoEngine(await engine.call("analyze", { source: { type: "normalized", normalized: basis.normalized }, conditions: basis.conditions }))
