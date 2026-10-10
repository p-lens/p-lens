import type { ApplicationError } from "../../../../application/errors"
import type { CatalogTarget } from "../../../../core/catalog/catalog"
import { type CheckMark, type FormulaListing, type HeldMark, isHeld, type MyMarks } from "../../../../core/formula/standing"
import type { Formula, SettingDistribution } from "../../../../core/pachislot/formula"
import { useMoves } from "../../../navigation/moves"
import { useBookMarks } from "../../live/book-marks"
import { useStartForm } from "../../live/start-form"

export interface Actions {
  /** What this member holds on a formula or a 設定配分, as the book in use says. */
  readonly mine: (id: string) => MyMarks
  /** Set or clear an adoption or a rejection on a formula or a 設定配分, then ask again of everything showing it. */
  readonly toggle: (target: CatalogTarget["type"], listing: FormulaListing<Formula | SettingDistribution>, mark: HeldMark, failed: (error: ApplicationError) => void) => void
  /** This member's check either way on a formula, given once and standing; `checked` is told once the catalog and the book have it. */
  readonly check: (formula: Formula, mark: CheckMark, failed: (error: ApplicationError) => void, checked?: () => void) => void
  /** Take a formula into the slot start form, and go back to starting the play. */
  readonly useFormula: (formula: Formula, machineName: string) => void
  /** Take a 設定配分 into the slot start form, and go back to starting the play. */
  readonly useDistribution: (distribution: SettingDistribution, machineName: string) => void
}

export const useActions = (): Actions => {
  const moves = useMoves()
  const start = useStartForm()
  const marks = useBookMarks()
  return {
    mine: marks.of,
    toggle: (target, listing, mark, failed) =>
      marks.press({ type: target, id: listing.formula.id }, listing.formula.machineId, mark, !isHeld(marks.of(listing.formula.id), mark), failed),
    check: (formula, mark, failed, checked) => marks.press({ type: "formula", id: formula.id }, formula.machineId, mark, true, failed, checked),
    useFormula: (formula, machineName) => {
      start.updatePachislot({ machine: { type: "catalog", machineId: formula.machineId, name: machineName }, formulaId: formula.id })
      moves.go({ kind: "live-new", game: "slot" })
    },
    useDistribution: (distribution, machineName) => {
      start.updatePachislot({ machine: { type: "catalog", machineId: distribution.machineId, name: machineName }, prior: { type: "distribution", id: distribution.id } })
      moves.go({ kind: "live-new", game: "slot" })
    },
  }
}
