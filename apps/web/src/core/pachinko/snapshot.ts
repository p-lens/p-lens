import type { Formula, FormulaId, FormulaKind } from "./formula"
import type { Figures } from "./figures"
import type { MachineId } from "../machine/machine"

/**
 * What a play carries of its machine and formula: enough to work out its
 * theoretical value offline, for as long as the play lasts, whatever happens to
 * the catalog meanwhile.
 */
export interface FormulaSnapshot {
  readonly id: FormulaId
  readonly machineId: MachineId
  readonly kind: FormulaKind
  readonly figures: Figures
}

export const snapshotOf = (formula: Formula): FormulaSnapshot => ({
  id: formula.id,
  machineId: formula.machineId,
  kind: formula.kind,
  figures: formula.figures,
})
