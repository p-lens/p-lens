import { basisOf, type Formula, type FormulaId, type FormulaKind } from "./formula"
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
  /**
   * 電サポ中の出玉増減 as its basis says, in basis points — `-500` is -5% —
   * left out where it says none or has no basis: what a play's measuring
   * takes off the jackpots won on the 電サポ where the person did not count
   * the drift themselves.
   */
  readonly supportGain?: number
}

export const snapshotOf = (formula: Formula): FormulaSnapshot => ({
  id: formula.id,
  machineId: formula.machineId,
  kind: formula.kind,
  figures: formula.figures,
  ...((points) => (points === undefined || points === 0 ? {} : { supportGain: points }))(basisOf(formula)?.conditions.supportGain?.basisPoints),
})
