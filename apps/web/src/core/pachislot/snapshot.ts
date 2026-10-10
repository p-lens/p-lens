import type { ConditionsDto, NormalizedSpecDto } from "@p-lens/contracts/pachislot"

import type { MachineId } from "../machine/machine"
import type { SettingLevelFigures } from "./figures"
import type { Formula, FormulaId, FormulaKind } from "./formula"

/**
 * What a pachislot play carries of its formula: enough to infer the setting
 * level and weigh the play offline for as long as it lasts, whatever happens
 * to the catalog meanwhile.
 */
export interface FormulaSnapshot {
  readonly id: FormulaId
  readonly machineId: MachineId
  readonly kind: FormulaKind
  readonly figures: readonly SettingLevelFigures[]
  readonly normalized: NormalizedSpecDto
  readonly conditions: ConditionsDto
  /** What each bonus, part and small win is called, by its id: what the counting tiles say. */
  readonly labels: Readonly<Record<string, string>>
}

export const snapshotOf = (formula: Formula): FormulaSnapshot => ({
  id: formula.id,
  machineId: formula.machineId,
  kind: formula.kind,
  figures: formula.figures,
  normalized: formula.basis.normalized,
  conditions: formula.basis.conditions,
  labels: formula.basis.spec.components.label ?? {},
})
